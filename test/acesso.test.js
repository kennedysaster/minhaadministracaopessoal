// Login, usuários, permissões, pessoas e pessoa jurídica
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./ajuda');
const { deBrasilApi, deCnpjWs } = require('../src/receita');
const { cpfValido, cnpjValido } = require('../src/util');

let master;
const CNPJ_TESTE = '11222333000181'; // CNPJ de exemplo com dígitos válidos
const CNPJ_CLIENTE = '11444777000161';

before(async () => {
  await h.iniciar();
});
after(() => h.encerrar());

test('validação de CPF e CNPJ', () => {
  assert.ok(cpfValido('715.963.721-68'));
  assert.ok(!cpfValido('715.963.721-69'));
  assert.ok(!cpfValido('111.111.111-11'));
  assert.ok(cnpjValido('11.222.333/0001-81'));
  assert.ok(!cnpjValido('11.222.333/0001-82'));
});

test('master: primeiro acesso exige trocar a senha temporária', async () => {
  const temp = h.auth.garantirMaster();
  assert.ok(temp && temp.length >= 10);
  assert.equal(h.auth.garantirMaster(), null); // não cria duas vezes
  const req = h.cliente();
  assert.equal((await req('/api/auth/login', 'POST', { login: '71596372168', senha: 'errada' })).status, 401);
  const r = await req('/api/auth/login', 'POST', { login: 'KennedySaster@gmail.com', senha: temp });
  assert.equal(r.status, 200);
  assert.equal(r.json.master, true);
  assert.equal(r.json.trocar_senha, true);
  assert.equal(r.json.nome, 'Marcos Kennedy de Sá e Souza');
  assert.equal(r.json.data_nascimento, '1979-11-10');
  // Enquanto não troca a senha, nada funciona
  assert.equal((await req('/api/transacoes')).status, 403);
  assert.equal((await req('/api/auth/senha', 'POST', { nova_senha: 'curta', confirmar_senha: 'curta' })).status, 400);
  const ok = await req('/api/auth/senha', 'POST', { nova_senha: h.SENHA, confirmar_senha: h.SENHA });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.trocar_senha, false);
  assert.equal((await req('/api/transacoes')).status, 200);
  master = req;
});

test('master já fica cadastrado como pessoa física sem endereço', async () => {
  const eu = (await master('/api/auth/eu')).json;
  const { json: p } = await master(`/api/pessoas/${eu.pessoa_id}`);
  assert.equal(p.tipo, 'PF');
  assert.equal(p.documento, '71596372168');
  assert.equal(p.email, 'kennedysaster@gmail.com');
  assert.equal(p.cep, null);
  assert.equal(p.usuario_id, eu.id);
});

test('alterações exigem JSON (proteção contra formulários de outros sites)', async () => {
  const res = await fetch(h.base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'login=71596372168&senha=x',
  });
  assert.equal(res.status, 415);
});

test('criar conta exige nome, CPF, e-mail, telefone, endereço e nascimento', async () => {
  const novo = h.cliente();
  const base = {
    nome: 'Bruno Lima', cpf: '153.509.460-56', email: 'bruno@exemplo.com', telefone: '62988887777',
    data_nascimento: '1985-02-03', cep: '74000000', logradouro: 'Av. Goiás', numero: '100', bairro: 'Centro',
    cidade: 'Goiânia', uf: 'GO', senha: 'Senha12345', confirmar_senha: 'Senha12345',
  };
  for (const falta of ['telefone', 'email', 'data_nascimento', 'cep', 'numero']) {
    const r = await novo('/api/auth/cadastro', 'POST', { ...base, [falta]: '' });
    assert.equal(r.status, 400, `deveria exigir ${falta}`);
  }
  assert.equal((await novo('/api/auth/cadastro', 'POST', { ...base, cpf: '123.456.789-00' })).status, 400);
  assert.equal((await novo('/api/auth/cadastro', 'POST', { ...base, cpf: '715.963.721-68' })).status, 409);
  const r = await novo('/api/auth/cadastro', 'POST', base);
  assert.equal(r.status, 201);
  // Novo usuário só tem as telas pessoais
  assert.ok(r.json.permissoes.every((p) => p.startsWith('pf.')));
  assert.equal((await novo('/api/pessoas')).status, 403);
  assert.equal((await novo('/api/empresas')).status, 403);
  assert.equal((await novo('/api/usuarios')).status, 403);
});

test('master cadastra usuário, define permissões e o usuário vira pessoa física', async () => {
  const r = await master('/api/usuarios', 'POST', { nome: 'carla souza', cpf: '390.533.447-05', email: 'carla@exemplo.com' });
  assert.equal(r.status, 201);
  assert.ok(r.json.senha_temporaria);
  const id = r.json.usuario.id;
  const pessoa = (await master('/api/pessoas?tipo=PF&busca=carla')).json[0];
  assert.equal(pessoa.nome, 'Carla Souza');
  assert.equal(pessoa.usuario_id, id);
  // e-mail repetido
  assert.equal((await master('/api/usuarios', 'POST', { nome: 'X Y', cpf: '864.464.227-84', email: 'carla@exemplo.com' })).status, 409);

  const carla = h.cliente();
  await carla('/api/auth/login', 'POST', { login: 'carla@exemplo.com', senha: r.json.senha_temporaria });
  await carla('/api/auth/senha', 'POST', { nova_senha: 'Carla12345', confirmar_senha: 'Carla12345' });
  assert.equal((await carla('/api/pessoas')).status, 403);

  // Permissão desconhecida é recusada; só o master altera permissões
  assert.equal((await master(`/api/usuarios/${id}/permissoes`, 'PUT', { permissoes: ['nao.existe'] })).status, 400);
  assert.equal((await carla(`/api/usuarios/${id}/permissoes`, 'PUT', { permissoes: ['pessoas'] })).status, 403);
  const p = await master(`/api/usuarios/${id}/permissoes`, 'PUT', { permissoes: ['pessoas', 'pf.visao'] });
  assert.deepEqual(p.json.permissoes.sort(), ['pessoas', 'pf.visao']);
  assert.equal((await carla('/api/pessoas')).status, 200);
  assert.equal((await carla('/api/pessoas', 'POST', { tipo: 'PF', nome: 'Teste', documento: '864.464.227-84' })).status, 403);
  assert.equal((await carla('/api/transacoes')).status, 403); // perdeu finanças

  // Desativar derruba a sessão
  await master(`/api/usuarios/${id}`, 'PUT', { ativo: false });
  assert.equal((await carla('/api/pessoas')).status, 401);
  // Master não tira o próprio perfil master
  const eu = (await master('/api/auth/eu')).json;
  assert.equal((await master(`/api/usuarios/${eu.id}/permissoes`, 'PUT', { permissoes: [], master: false })).status, 400);
});

test('pessoas: cadastro PF e PJ com contas bancárias', async () => {
  const pj = await master('/api/pessoas', 'POST', {
    tipo: 'PJ', documento: '11.444.777/0001-61', nome: 'Cliente Exemplo Ltda', email: 'contato@cliente.com', telefone: '6232221111',
    cep: '74000-000', logradouro: 'Rua 2', numero: '5', bairro: 'Setor Oeste', cidade: 'Goiânia', uf: 'GO',
  });
  assert.equal(pj.status, 201);
  assert.equal(pj.json.nome, 'CLIENTE EXEMPLO LTDA');
  assert.equal((await master('/api/pessoas', 'POST', { tipo: 'PJ', documento: '11.444.777/0001-61', nome: 'Duplicada' })).status, 409);
  assert.equal((await master('/api/pessoas', 'POST', { tipo: 'PJ', documento: '11.444.777/0001-62', nome: 'Errada' })).status, 400);

  const cb = await master(`/api/pessoas/${pj.json.id}/contas-bancarias`, 'POST', { banco: 'Banco do Brasil', agencia: '1234-5', conta: '99999-0', tipo: 'Corrente', chave_pix: '11444777000161' });
  assert.equal(cb.status, 201);
  assert.equal((await master(`/api/pessoas/${pj.json.id}/contas-bancarias`, 'POST', { banco: 'X' })).status, 400);
  const det = (await master(`/api/pessoas/${pj.json.id}`)).json;
  assert.equal(det.contas_bancarias.length, 1);
  assert.equal(det.tipo, 'PJ');
});

test('meus dados: usuário comum edita só o próprio cadastro', async () => {
  const novo = h.cliente();
  const r = await novo('/api/auth/cadastro', 'POST', {
    nome: 'Diego Alves', cpf: '864.464.227-84', email: 'diego@exemplo.com', telefone: '62977776666', data_nascimento: '1992-07-07',
    cep: '74000000', logradouro: 'Rua 3', numero: '1', bairro: 'Centro', cidade: 'Goiânia', uf: 'GO',
    senha: 'Diego12345', confirmar_senha: 'Diego12345',
  });
  const pid = r.json.pessoa_id;
  assert.equal((await novo(`/api/pessoas/${pid}`, 'PUT', { complemento: 'Apto 12' })).json.complemento, 'Apto 12');
  assert.equal((await novo(`/api/pessoas/${pid}/contas-bancarias`, 'POST', { banco: 'Nubank', chave_pix: 'diego@exemplo.com' })).status, 201);
  const eu = (await master('/api/auth/eu')).json;
  assert.equal((await novo(`/api/pessoas/${eu.pessoa_id}`)).status, 403);
  assert.equal((await novo(`/api/pessoas/${eu.pessoa_id}`, 'PUT', { complemento: 'x' })).status, 403);
  // CPF de usuário não muda
  assert.equal((await novo(`/api/pessoas/${pid}`, 'PUT', { documento: '529.982.247-25' })).json.documento, '86446422784');
});

test('Receita: converte as respostas da BrasilAPI e do CNPJ.ws', () => {
  const a = deBrasilApi({
    cnpj: '11222333000181', razao_social: 'EMPRESA TESTE LTDA', nome_fantasia: 'TESTE', descricao_situacao_cadastral: 'ATIVA',
    data_inicio_atividade: '2015-03-02', codigo_natureza_juridica: 2062, natureza_juridica: 'Sociedade Empresária Limitada',
    porte: 'MICRO EMPRESA', cnae_fiscal: 6201501, cnae_fiscal_descricao: 'Desenvolvimento de programas',
    cnaes_secundarios: [{ codigo: 6204000, descricao: 'Consultoria em TI' }, { codigo: 0, descricao: '' }],
    capital_social: 10000, descricao_tipo_de_logradouro: 'RUA', logradouro: 'DAS FLORES', numero: '10', bairro: 'CENTRO',
    cep: '74000000', municipio: 'GOIANIA', uf: 'GO', ddd_telefone_1: '6233334444', opcao_pelo_simples: true, opcao_pelo_mei: false,
    qsa: [{ nome_socio: 'FULANO', qualificacao_socio: 'Sócio-Administrador' }],
  });
  assert.equal(a.classificacao, 'ME');
  assert.equal(a.regime_tributario, 'Simples Nacional');
  assert.equal(a.cnae_principal, '6201-5/01');
  assert.equal(a.cnaes_secundarios.length, 1);
  assert.equal(a.logradouro, 'RUA DAS FLORES');
  assert.equal(a.natureza_juridica, '2062 - Sociedade Empresária Limitada');
  assert.equal(a.socios[0].nome, 'FULANO');

  const b = deCnpjWs({
    razao_social: 'OUTRA LTDA', capital_social: '5000.00', porte: { descricao: 'Empresa de Pequeno Porte' },
    natureza_juridica: { id: '2062', descricao: 'Sociedade Empresária Limitada' }, simples: { simples: 'Não', mei: 'Não' },
    socios: [], estabelecimento: {
      cnpj: '11222333000181', situacao_cadastral: 'Ativa', data_inicio_atividade: '2010-01-01', tipo: 'Matriz',
      atividade_principal: { subclasse: '4751201', descricao: 'Comércio de informática' }, atividades_secundarias: [],
      tipo_logradouro: 'Avenida', logradouro: 'Brasil', numero: '1', cep: '74000000', cidade: { nome: 'Goiânia' },
      estado: { sigla: 'GO' }, ddd1: '62', telefone1: '32221111', inscricoes_estaduais: [{ inscricao_estadual: '123', ativo: true }],
    },
  });
  assert.equal(b.classificacao, 'EPP');
  assert.equal(b.regime_tributario, null);
  assert.equal(b.capital_social, 5000);
  assert.equal(b.cnae_principal, '4751-2/01');
  assert.equal(b.inscricao_estadual, '123');
  assert.equal(b.telefone, '6232221111');
});

test('consulta de CNPJ usa a Receita e cai para a segunda fonte', async () => {
  const original = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes('brasilapi')) return new Response('erro', { status: 500 });
    if (String(url).includes('cnpj.ws'))
      return Response.json({ razao_social: 'VIA CNPJWS LTDA', estabelecimento: { cnpj: CNPJ_TESTE, estado: { sigla: 'GO' } } });
    return original(url, opts);
  };
  try {
    const r = await master(`/api/cnpj/${CNPJ_TESTE}`);
    assert.equal(r.status, 200);
    assert.equal(r.json.razao_social, 'VIA CNPJWS LTDA');
    assert.equal((await master('/api/cnpj/11222333000182')).status, 400);
  } finally {
    global.fetch = original;
  }
});

let empresaId;
test('empresa: só o master cadastra e vincula o responsável', async () => {
  const eu = (await master('/api/auth/eu')).json;
  const dados = {
    cnpj: '11.222.333/0001-81', razao_social: 'Empresa Teste Ltda', nome_fantasia: 'Teste', email: 'empresa@teste.com',
    telefone: '6233334444', classificacao: 'ME', regime_tributario: 'Simples Nacional', cnae_principal: '6201-5/01',
    cnae_descricao: 'Desenvolvimento de programas', cep: '74000000', logradouro: 'Rua das Flores', numero: '10',
    bairro: 'Centro', cidade: 'Goiânia', uf: 'GO', responsavel_id: eu.id,
    cnaes_secundarios: [{ codigo: '6204-0/00', descricao: 'Consultoria' }],
  };
  assert.equal((await master('/api/empresas', 'POST', { ...dados, classificacao: 'XYZ' })).status, 400);
  const r = await master('/api/empresas', 'POST', dados);
  assert.equal(r.status, 201);
  empresaId = r.json.id;
  assert.equal(r.json.responsavel_id, eu.id);
  assert.equal(r.json.responsavel_nome, 'Marcos Kennedy de Sá e Souza');
  assert.equal(r.json.razao_social, 'EMPRESA TESTE LTDA');
  assert.equal(r.json.cnaes_secundarios[0].codigo, '6204-0/00');
  assert.equal((await master('/api/empresas', 'POST', dados)).status, 409);
  // A empresa também aparece no cadastro de pessoas jurídicas
  assert.ok((await master('/api/pessoas?tipo=PJ')).json.some((p) => p.empresa_id === empresaId));

  // Usuário com permissões de PJ, mas que não é responsável, não vê a empresa
  const u = await master('/api/usuarios', 'POST', { nome: 'Eva Rocha', cpf: '286.255.878-87', email: 'eva@exemplo.com' });
  await master(`/api/usuarios/${u.json.usuario.id}/permissoes`, 'PUT', {
    permissoes: ['pj.empresas', 'pj.empresas.editar', 'pj.lancamentos', 'pj.lancamentos.editar'],
  });
  const eva = h.cliente();
  await eva('/api/auth/login', 'POST', { login: '28625587887', senha: u.json.senha_temporaria });
  await eva('/api/auth/senha', 'POST', { nova_senha: 'Eva1234567', confirmar_senha: 'Eva1234567' });
  assert.equal((await eva('/api/empresas')).json.length, 0);
  assert.equal((await eva(`/api/empresas/${empresaId}`)).status, 403);
  assert.equal((await eva('/api/empresas', 'POST', { ...dados, cnpj: CNPJ_CLIENTE })).status, 403);

  // Master vincula Eva como responsável: agora ela vê e edita, mas não troca o responsável
  await master(`/api/empresas/${empresaId}`, 'PUT', { ...dados, responsavel_id: u.json.usuario.id });
  assert.equal((await eva('/api/empresas')).json.length, 1);
  assert.equal((await eva(`/api/empresas/${empresaId}`, 'PUT', { ...dados, inscricao_municipal: '777', responsavel_id: u.json.usuario.id })).json.inscricao_municipal, '777');
  assert.equal((await eva(`/api/empresas/${empresaId}`, 'PUT', { ...dados, responsavel_id: eu.id })).status, 403);
  // Sem permissão de faturamento
  assert.equal((await eva(`/api/empresas/${empresaId}/faturamentos`)).status, 403);
  await master(`/api/empresas/${empresaId}`, 'PUT', { ...dados, responsavel_id: eu.id });
});

test('empresa: despesas, tributos, Pix e outras receitas', async () => {
  const url = `/api/empresas/${empresaId}/lancamentos`;
  const mes = '2026-09';
  const add = (b) => master(url, 'POST', { data: `${mes}-10`, ...b });
  assert.equal((await add({ categoria: 'tributos_federais', descricao: 'DAS', valor: 450 })).status, 201);
  assert.equal((await add({ categoria: 'tributos_municipais', descricao: 'ISS', valor: 120 })).status, 201);
  assert.equal((await add({ categoria: 'tributos_estaduais', descricao: 'ICMS', valor: 80 })).status, 201);
  assert.equal((await add({ categoria: 'outros_gastos', descricao: 'Material de escritório', valor: 60 })).status, 201);
  assert.equal((await add({ categoria: 'outras_receitas', descricao: 'Rendimento', valor: 30 })).status, 201);
  assert.equal((await add({ categoria: 'pix', descricao: 'Pix fornecedor', valor: 200 })).status, 400); // falta o sentido
  const pix = await add({ categoria: 'pix', tipo: 'saida', descricao: 'Pix fornecedor', valor: 200, favorecido: 'Fornecedor X' });
  assert.equal(pix.json.tipo, 'saida');
  assert.equal((await add({ categoria: 'inexistente', descricao: 'x', valor: 1 })).status, 400);

  const { json } = await master(`${url}?mes=${mes}`);
  assert.equal(json.itens.length, 6);
  assert.equal(json.totais.tributos, 650);
  assert.equal(json.totais.saidas, 910);
  assert.equal(json.totais.entradas, 30);
  const res = await master.bruto(`/api/empresas/${empresaId}/lancamentos-exportar?mes=${mes}`);
  assert.equal(res.status, 200);
  assert.match(Buffer.from(await res.arrayBuffer()).toString('utf8'), /Tributos federais/);
});

test('faturamento com CNPJ de origem', async () => {
  const url = `/api/empresas/${empresaId}/faturamentos`;
  assert.equal((await master(url, 'POST', { origem_cnpj: '11.444.777/0001-62', origem_nome: 'X', valor: 10, data_emissao: '2026-09-05' })).status, 400);
  // Nome vem do cadastro de pessoas quando o CNPJ já existe
  const f = await master(url, 'POST', { origem_cnpj: '11.444.777/0001-61', valor: 3500, data_emissao: '2026-09-05', numero_nota: '123' });
  assert.equal(f.status, 201);
  assert.equal(f.json.origem_nome, 'CLIENTE EXEMPLO LTDA');
  assert.equal(f.json.status, 'a_receber');
  // CNPJ novo vira pessoa jurídica no cadastro
  const novo = await master(url, 'POST', { origem_cnpj: '04.252.011/0001-10', origem_nome: 'Novo Cliente SA', valor: 1500, data_emissao: '2026-09-20', status: 'recebido', data_recebimento: '2026-09-25' });
  assert.equal(novo.status, 201);
  assert.ok((await master('/api/pessoas?tipo=PJ&busca=04252011')).json.length === 1);

  await master(`${url}/${f.json.id}/receber`, 'POST', { data: '2026-10-01' });
  const { json } = await master(`${url}?mes=2026-09`);
  assert.equal(json.totais.total, 5000);
  assert.equal(json.totais.recebido, 5000);
  assert.equal(json.totais.a_receber, 0);
  await master(`${url}/${f.json.id}/reabrir`, 'POST', {});
  assert.equal((await master(`${url}?mes=2026-09`)).json.totais.a_receber, 3500);
  // Resultado do mês nas despesas considera o faturamento
  const lanc = (await master(`/api/empresas/${empresaId}/lancamentos?mes=2026-09`)).json;
  assert.equal(lanc.totais.faturamento, 5000);
  assert.equal(lanc.totais.resultado, 5000 + 30 - 910);
});

test('links úteis da empresa', async () => {
  const url = `/api/empresas/${empresaId}/links`;
  const r = await master(url, 'POST', { titulo: 'Simples Nacional', url: 'www8.receita.fazenda.gov.br/simplesnacional', categoria: 'Impostos' });
  assert.equal(r.status, 201);
  assert.equal(r.json.url, 'https://www8.receita.fazenda.gov.br/simplesnacional');
  assert.equal((await master(url, 'POST', { titulo: 'Ruim', url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await master(url, 'POST', { titulo: 'Ruim', url: 'semponto' })).status, 400);
  assert.equal((await master(url)).json.length, 1);
});

test('lista de permissões cobre todas as telas, ações e relatórios', async () => {
  const { json } = await master('/api/auth/permissoes');
  const tipos = new Set(json.map((p) => p.tipo));
  assert.deepEqual([...tipos].sort(), ['acao', 'relatorio', 'tela']);
  for (const chave of ['pj.faturamento', 'pj.links', 'pj.lancamentos.exportar', 'pessoas.editar', 'usuarios.editar'])
    assert.ok(json.some((p) => p.chave === chave), chave);
});
