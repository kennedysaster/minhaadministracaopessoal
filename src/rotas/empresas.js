// Pessoa jurídica: empresas, despesas/receitas, faturamento e links úteis
const express = require('express');
const db = require('../db');
const { exigir, exigirMaster, pode } = require('../auth');
const { validarPessoa, salvarPessoa, porDocumento, porId } = require('../pessoas');
const { consultarCnpj } = require('../receita');
const {
  erro, texto, digitos, hoje, mesAtual, mesValido, dataValida, cnpjValido, valorValido, csv, formatarCnpj,
} = require('../util');

const r = express.Router();

const CLASSIFICACOES = [
  { valor: 'MEI', rotulo: 'MEI (microempreendedor individual)' },
  { valor: 'ME', rotulo: 'ME (microempresa)' },
  { valor: 'EPP', rotulo: 'EPP (empresa de pequeno porte)' },
  { valor: 'DEMAIS', rotulo: 'Demais (médio e grande porte)' },
];
const REGIMES = ['MEI', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real'];

const CATEGORIAS_PJ = [
  { chave: 'outros_gastos', nome: 'Outros gastos', tipo: 'saida', ajuda: 'Despesas do dia a dia da empresa' },
  { chave: 'outras_receitas', nome: 'Outras receitas', tipo: 'entrada', ajuda: 'Entradas que não são faturamento' },
  { chave: 'tributos_federais', nome: 'Tributos federais', tipo: 'saida', ajuda: 'DAS, IRPJ, CSLL, PIS, COFINS, INSS' },
  { chave: 'tributos_estaduais', nome: 'Tributos estaduais', tipo: 'saida', ajuda: 'ICMS, IPVA, taxas estaduais' },
  { chave: 'tributos_municipais', nome: 'Tributos municipais', tipo: 'saida', ajuda: 'ISS, IPTU, alvará, taxas municipais' },
  { chave: 'pix', nome: 'Transferências Pix', tipo: null, ajuda: 'Pix enviados ou recebidos pela empresa' },
];
const categoria = (chave) => CATEGORIAS_PJ.find((c) => c.chave === chave);

// ---------- Leitura de empresa ----------
const SELECT_EMPRESA = `
  SELECT e.*, p.documento AS cnpj, p.nome AS razao_social, p.nome_fantasia, p.email, p.telefone, p.telefone2,
         p.data_nascimento AS data_abertura, p.cep, p.logradouro, p.numero, p.complemento, p.bairro, p.cidade, p.uf,
         p.observacoes, rp.nome AS responsavel_nome
  FROM empresas e
  JOIN pessoas p ON p.id = e.pessoa_id
  LEFT JOIN usuarios ru ON ru.id = e.responsavel_id
  LEFT JOIN pessoas rp ON rp.id = ru.pessoa_id`;

function montar(e) {
  if (!e) return null;
  const json = (s) => {
    try {
      return s ? JSON.parse(s) : [];
    } catch {
      return [];
    }
  };
  return { ...e, cnaes_secundarios: json(e.cnaes_secundarios), socios: json(e.socios) };
}

const acessiveis = (u) =>
  u.master
    ? db.prepare(`${SELECT_EMPRESA} ORDER BY p.nome`).all()
    : db.prepare(`${SELECT_EMPRESA} WHERE e.responsavel_id = ? ORDER BY p.nome`).all(u.id);

// Carrega a empresa da rota e confere se o usuário tem acesso a ela
function carregarEmpresa(req, res, next) {
  const e = db.prepare(`${SELECT_EMPRESA} WHERE e.id = ?`).get(req.params.empresaId);
  if (!e) return erro(res, 'Empresa não encontrada', 404);
  if (!req.usuario.master && e.responsavel_id !== req.usuario.id)
    return erro(res, 'Você não é responsável por esta empresa', 403);
  req.empresa = montar(e);
  next();
}

// ---------- Validação da empresa ----------
function validarEmpresa(b = {}, { master }) {
  const p = validarPessoa({
    tipo: 'PJ',
    documento: b.cnpj,
    nome: b.razao_social,
    nome_fantasia: b.nome_fantasia,
    data_nascimento: b.data_abertura || null,
    email: b.email,
    telefone: b.telefone,
    telefone2: b.telefone2,
    cep: b.cep, logradouro: b.logradouro, numero: b.numero, complemento: b.complemento,
    bairro: b.bairro, cidade: b.cidade, uf: b.uf, observacoes: b.observacoes,
  });
  if (p.erro) return p;
  const e = {};
  e.classificacao = b.classificacao || null;
  if (e.classificacao && !CLASSIFICACOES.some((c) => c.valor === e.classificacao)) return { erro: 'Classificação inválida' };
  e.regime_tributario = b.regime_tributario || null;
  if (e.regime_tributario && !REGIMES.includes(e.regime_tributario)) return { erro: 'Regime tributário inválido' };
  for (const c of ['situacao_cadastral', 'natureza_juridica', 'porte', 'cnae_principal', 'cnae_descricao',
    'matriz_filial', 'inscricao_estadual', 'inscricao_municipal']) e[c] = texto(b[c]) || null;
  e.data_situacao = dataValida(b.data_situacao) ? b.data_situacao : null;
  e.capital_social = b.capital_social === '' || b.capital_social == null ? null : valorValido(b.capital_social);
  e.cnaes_secundarios = JSON.stringify(Array.isArray(b.cnaes_secundarios) ? b.cnaes_secundarios.slice(0, 200) : []);
  e.socios = JSON.stringify(Array.isArray(b.socios) ? b.socios.slice(0, 100) : []);
  e.consultado_em = b.consultado_em || null;
  if (master && 'responsavel_id' in b) {
    e.responsavel_id = b.responsavel_id ? Number(b.responsavel_id) : null;
    if (e.responsavel_id && !db.prepare('SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1').get(e.responsavel_id))
      return { erro: 'Usuário responsável não encontrado ou inativo' };
  }
  return { pessoa: p, empresa: e };
}

const CAMPOS_EMPRESA = ['situacao_cadastral', 'data_situacao', 'natureza_juridica', 'porte', 'classificacao',
  'regime_tributario', 'cnae_principal', 'cnae_descricao', 'cnaes_secundarios', 'capital_social', 'matriz_filial',
  'inscricao_estadual', 'inscricao_municipal', 'socios', 'consultado_em'];

// ---------- Consulta CNPJ na Receita ----------
r.get('/cnpj/:cnpj', exigir('pj.empresas.editar', 'pessoas.editar', 'pj.faturamento.editar'), async (req, res) => {
  if (!cnpjValido(req.params.cnpj)) return erro(res, 'CNPJ inválido. Confira os números.');
  try {
    const dados = await consultarCnpj(req.params.cnpj);
    res.json({ ...dados, consultado_em: new Date().toISOString() });
  } catch (e) {
    erro(res, e.message, e.status || 502);
  }
});

// ---------- Listas de apoio ----------
r.get('/pj/opcoes', (req, res) => {
  res.json({ classificacoes: CLASSIFICACOES, regimes: REGIMES, categorias: CATEGORIAS_PJ });
});

// ---------- Empresas ----------
const telasPj = ['pj.empresas', 'pj.lancamentos', 'pj.faturamento', 'pj.links'];

r.get('/empresas', exigir(...telasPj), (req, res) => {
  res.json(acessiveis(req.usuario).map(montar));
});

r.get('/empresas/:empresaId', exigir(...telasPj), carregarEmpresa, (req, res) => res.json(req.empresa));

// Cadastrar e vincular responsável: somente o master
r.post('/empresas', exigirMaster, (req, res) => {
  const v = validarEmpresa(req.body, { master: true });
  if (v.erro) return erro(res, v.erro);
  const existente = porDocumento(v.pessoa.documento);
  if (existente && db.prepare('SELECT 1 FROM empresas WHERE pessoa_id = ?').get(existente.id))
    return erro(res, 'Esta empresa já está cadastrada', 409);
  let id;
  db.transacao(() => {
    const pessoa = salvarPessoa(v.pessoa, { mesclar: true });
    const cols = ['pessoa_id', 'responsavel_id', ...CAMPOS_EMPRESA];
    const vals = [pessoa.id, v.empresa.responsavel_id ?? null, ...CAMPOS_EMPRESA.map((c) => v.empresa[c] ?? null)];
    id = db.prepare(`INSERT INTO empresas (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals).lastInsertRowid;
  });
  res.status(201).json(montar(db.prepare(`${SELECT_EMPRESA} WHERE e.id = ?`).get(id)));
});

r.put('/empresas/:empresaId', exigir('pj.empresas.editar'), carregarEmpresa, (req, res) => {
  const b = { ...req.body, cnpj: req.empresa.cnpj }; // CNPJ não muda
  if (!req.usuario.master && 'responsavel_id' in (req.body || {}) && Number(req.body.responsavel_id || 0) !== (req.empresa.responsavel_id || 0))
    return erro(res, 'Somente o usuário master vincula o responsável da empresa', 403);
  const v = validarEmpresa(b, { master: req.usuario.master });
  if (v.erro) return erro(res, v.erro);
  db.transacao(() => {
    salvarPessoa(v.pessoa, { id: req.empresa.pessoa_id });
    const campos = [...CAMPOS_EMPRESA];
    if ('responsavel_id' in v.empresa) campos.push('responsavel_id');
    db.prepare(`UPDATE empresas SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...campos.map((c) => v.empresa[c] ?? null), req.empresa.id);
  });
  res.json(montar(db.prepare(`${SELECT_EMPRESA} WHERE e.id = ?`).get(req.empresa.id)));
});

r.delete('/empresas/:empresaId', exigirMaster, carregarEmpresa, (req, res) => {
  db.prepare('DELETE FROM empresas WHERE id = ?').run(req.empresa.id);
  res.status(204).end();
});

// ---------- Despesas e receitas da empresa ----------
function validarLancamento(b = {}) {
  const cat = categoria(b.categoria);
  if (!cat) return { erro: 'Escolha a categoria' };
  const tipo = cat.tipo || (b.tipo === 'entrada' ? 'entrada' : b.tipo === 'saida' ? 'saida' : null);
  if (!tipo) return { erro: 'Informe se o Pix foi enviado ou recebido' };
  const descricao = texto(b.descricao);
  if (!descricao) return { erro: 'Preencha a descrição' };
  const valor = valorValido(b.valor);
  if (valor === null) return { erro: 'Informe um valor maior ou igual a zero' };
  const data = b.data || hoje();
  if (!dataValida(data)) return { erro: 'Data inválida' };
  return { categoria: cat.chave, tipo, descricao, valor, data, favorecido: texto(b.favorecido) || null, observacao: texto(b.observacao) || null };
}

r.get('/empresas/:empresaId/lancamentos', exigir('pj.lancamentos'), carregarEmpresa, (req, res) => {
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');
  const itens = db
    .prepare('SELECT * FROM empresa_lancamentos WHERE empresa_id = ? AND substr(data,1,7) = ? ORDER BY data DESC, id DESC')
    .all(req.empresa.id, mes);
  const porCategoria = CATEGORIAS_PJ.map((c) => ({
    ...c,
    entradas: itens.filter((i) => i.categoria === c.chave && i.tipo === 'entrada').reduce((t, i) => t + i.valor, 0),
    saidas: itens.filter((i) => i.categoria === c.chave && i.tipo === 'saida').reduce((t, i) => t + i.valor, 0),
  }));
  const fat = db
    .prepare('SELECT COALESCE(SUM(valor),0) AS total FROM faturamentos WHERE empresa_id = ? AND substr(data_emissao,1,7) = ?')
    .get(req.empresa.id, mes).total;
  const entradas = itens.filter((i) => i.tipo === 'entrada').reduce((t, i) => t + i.valor, 0);
  const saidas = itens.filter((i) => i.tipo === 'saida').reduce((t, i) => t + i.valor, 0);
  const tributos = itens.filter((i) => i.categoria.startsWith('tributos_')).reduce((t, i) => t + i.valor, 0);
  res.json({ mes, itens, porCategoria, totais: { entradas, saidas, tributos, faturamento: fat, resultado: fat + entradas - saidas } });
});

r.post('/empresas/:empresaId/lancamentos', exigir('pj.lancamentos.editar'), carregarEmpresa, (req, res) => {
  const l = validarLancamento(req.body);
  if (l.erro) return erro(res, l.erro);
  const info = db
    .prepare(
      `INSERT INTO empresa_lancamentos (empresa_id, categoria, tipo, descricao, valor, data, favorecido, observacao, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.empresa.id, l.categoria, l.tipo, l.descricao, l.valor, l.data, l.favorecido, l.observacao, req.usuario.id);
  res.status(201).json(db.prepare('SELECT * FROM empresa_lancamentos WHERE id = ?').get(info.lastInsertRowid));
});

r.put('/empresas/:empresaId/lancamentos/:id', exigir('pj.lancamentos.editar'), carregarEmpresa, (req, res) => {
  const atual = db.prepare('SELECT * FROM empresa_lancamentos WHERE id = ? AND empresa_id = ?').get(req.params.id, req.empresa.id);
  if (!atual) return erro(res, 'Lançamento não encontrado', 404);
  const l = validarLancamento(req.body);
  if (l.erro) return erro(res, l.erro);
  db.prepare(
    'UPDATE empresa_lancamentos SET categoria=?, tipo=?, descricao=?, valor=?, data=?, favorecido=?, observacao=? WHERE id=?'
  ).run(l.categoria, l.tipo, l.descricao, l.valor, l.data, l.favorecido, l.observacao, atual.id);
  res.json(db.prepare('SELECT * FROM empresa_lancamentos WHERE id = ?').get(atual.id));
});

r.delete('/empresas/:empresaId/lancamentos/:id', exigir('pj.lancamentos.editar'), carregarEmpresa, (req, res) => {
  const info = db.prepare('DELETE FROM empresa_lancamentos WHERE id = ? AND empresa_id = ?').run(req.params.id, req.empresa.id);
  if (!info.changes) return erro(res, 'Lançamento não encontrado', 404);
  res.status(204).end();
});

r.get('/empresas/:empresaId/lancamentos-exportar', exigir('pj.lancamentos.exportar'), carregarEmpresa, (req, res) => {
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');
  const itens = db
    .prepare('SELECT * FROM empresa_lancamentos WHERE empresa_id = ? AND substr(data,1,7) = ? ORDER BY data, id')
    .all(req.empresa.id, mes);
  let ent = 0;
  let sai = 0;
  const linhas = itens.map((i) => {
    if (i.tipo === 'entrada') ent += i.valor;
    else sai += i.valor;
    return [csv.data(i.data), csv.cel(categoria(i.categoria)?.nome || i.categoria), csv.cel(i.descricao), csv.cel(i.favorecido),
      i.tipo === 'entrada' ? 'Entrada' : 'Saída', csv.num(i.tipo === 'entrada' ? i.valor : -i.valor)].join(';');
  });
  csv.enviar(res, `empresa-${req.empresa.cnpj}-lancamentos-${mes}.csv`, [
    `${csv.cel(req.empresa.razao_social)};CNPJ ${formatarCnpj(req.empresa.cnpj)};Mês ${mes}`,
    '',
    'Data;Categoria;Descrição;Favorecido;Tipo;Valor (R$)',
    ...linhas,
    '',
    `;;;;Total de entradas;${csv.num(ent)}`,
    `;;;;Total de saídas;${csv.num(-sai)}`,
    `;;;;Saldo;${csv.num(ent - sai)}`,
  ]);
});

// ---------- Faturamento ----------
function validarFaturamento(b = {}) {
  const origem_cnpj = digitos(b.origem_cnpj);
  if (!cnpjValido(origem_cnpj)) return { erro: 'CNPJ de origem inválido. Confira os números.' };
  let origem_nome = texto(b.origem_nome);
  if (!origem_nome) origem_nome = porDocumento(origem_cnpj)?.nome || '';
  if (!origem_nome) return { erro: 'Preencha o nome de quem originou o faturamento (ou busque o CNPJ na Receita)' };
  const valor = valorValido(b.valor);
  if (valor === null || valor === 0) return { erro: 'Informe o valor faturado' };
  if (!dataValida(b.data_emissao)) return { erro: 'Informe a data de emissão' };
  const status = b.status === 'recebido' ? 'recebido' : 'a_receber';
  let data_recebimento = b.data_recebimento || null;
  if (status === 'recebido') {
    data_recebimento = data_recebimento || hoje();
    if (!dataValida(data_recebimento)) return { erro: 'Data de recebimento inválida' };
  } else data_recebimento = null;
  return {
    origem_cnpj, origem_nome: origem_nome.toLocaleUpperCase('pt-BR'), valor, data_emissao: b.data_emissao, status, data_recebimento,
    numero_nota: texto(b.numero_nota) || null, descricao: texto(b.descricao) || null,
  };
}

// Guarda a origem no cadastro de pessoas jurídicas, se ainda não existir
function registrarOrigem(f) {
  if (porDocumento(f.origem_cnpj)) return;
  salvarPessoa({ tipo: 'PJ', documento: f.origem_cnpj, nome: f.origem_nome });
}

const pegarFat = (id, empresaId) => db.prepare('SELECT * FROM faturamentos WHERE id = ? AND empresa_id = ?').get(id, empresaId);

r.get('/empresas/:empresaId/faturamentos', exigir('pj.faturamento'), carregarEmpresa, (req, res) => {
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');
  const itens = db
    .prepare('SELECT * FROM faturamentos WHERE empresa_id = ? AND substr(data_emissao,1,7) = ? ORDER BY data_emissao DESC, id DESC')
    .all(req.empresa.id, mes);
  const total = itens.reduce((t, i) => t + i.valor, 0);
  const recebido = itens.filter((i) => i.status === 'recebido').reduce((t, i) => t + i.valor, 0);
  const anoInicio = `${mes.slice(0, 4)}-01`;
  const acumuladoAno = db
    .prepare('SELECT COALESCE(SUM(valor),0) AS t FROM faturamentos WHERE empresa_id = ? AND substr(data_emissao,1,7) BETWEEN ? AND ?')
    .get(req.empresa.id, anoInicio, mes).t;
  const ultimos12 = db
    .prepare(
      `SELECT COALESCE(SUM(valor),0) AS t FROM faturamentos WHERE empresa_id = ?
       AND data_emissao > date(? || '-01', '-11 months') AND substr(data_emissao,1,7) <= ?`
    )
    .get(req.empresa.id, mes, mes).t;
  res.json({ mes, itens, totais: { total, recebido, a_receber: total - recebido, acumulado_ano: acumuladoAno, ultimos_12_meses: ultimos12 } });
});

r.post('/empresas/:empresaId/faturamentos', exigir('pj.faturamento.editar'), carregarEmpresa, (req, res) => {
  const f = validarFaturamento(req.body);
  if (f.erro) return erro(res, f.erro);
  let id;
  db.transacao(() => {
    registrarOrigem(f);
    id = db
      .prepare(
        `INSERT INTO faturamentos (empresa_id, origem_cnpj, origem_nome, numero_nota, descricao, valor, data_emissao, data_recebimento, status, criado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.empresa.id, f.origem_cnpj, f.origem_nome, f.numero_nota, f.descricao, f.valor, f.data_emissao, f.data_recebimento, f.status, req.usuario.id)
      .lastInsertRowid;
  });
  res.status(201).json(pegarFat(id, req.empresa.id));
});

r.put('/empresas/:empresaId/faturamentos/:id', exigir('pj.faturamento.editar'), carregarEmpresa, (req, res) => {
  const atual = pegarFat(req.params.id, req.empresa.id);
  if (!atual) return erro(res, 'Faturamento não encontrado', 404);
  const f = validarFaturamento(req.body);
  if (f.erro) return erro(res, f.erro);
  db.transacao(() => {
    registrarOrigem(f);
    db.prepare(
      `UPDATE faturamentos SET origem_cnpj=?, origem_nome=?, numero_nota=?, descricao=?, valor=?, data_emissao=?, data_recebimento=?, status=? WHERE id=?`
    ).run(f.origem_cnpj, f.origem_nome, f.numero_nota, f.descricao, f.valor, f.data_emissao, f.data_recebimento, f.status, atual.id);
  });
  res.json(pegarFat(atual.id, req.empresa.id));
});

r.post('/empresas/:empresaId/faturamentos/:id/receber', exigir('pj.faturamento.editar'), carregarEmpresa, (req, res) => {
  const atual = pegarFat(req.params.id, req.empresa.id);
  if (!atual) return erro(res, 'Faturamento não encontrado', 404);
  const data = dataValida(req.body?.data) ? req.body.data : hoje();
  db.prepare("UPDATE faturamentos SET status = 'recebido', data_recebimento = ? WHERE id = ?").run(data, atual.id);
  res.json(pegarFat(atual.id, req.empresa.id));
});

r.post('/empresas/:empresaId/faturamentos/:id/reabrir', exigir('pj.faturamento.editar'), carregarEmpresa, (req, res) => {
  const atual = pegarFat(req.params.id, req.empresa.id);
  if (!atual) return erro(res, 'Faturamento não encontrado', 404);
  db.prepare("UPDATE faturamentos SET status = 'a_receber', data_recebimento = NULL WHERE id = ?").run(atual.id);
  res.json(pegarFat(atual.id, req.empresa.id));
});

r.delete('/empresas/:empresaId/faturamentos/:id', exigir('pj.faturamento.editar'), carregarEmpresa, (req, res) => {
  const info = db.prepare('DELETE FROM faturamentos WHERE id = ? AND empresa_id = ?').run(req.params.id, req.empresa.id);
  if (!info.changes) return erro(res, 'Faturamento não encontrado', 404);
  res.status(204).end();
});

r.get('/empresas/:empresaId/faturamentos-exportar', exigir('pj.faturamento.exportar'), carregarEmpresa, (req, res) => {
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');
  const itens = db
    .prepare('SELECT * FROM faturamentos WHERE empresa_id = ? AND substr(data_emissao,1,7) = ? ORDER BY data_emissao, id')
    .all(req.empresa.id, mes);
  const total = itens.reduce((t, i) => t + i.valor, 0);
  csv.enviar(res, `empresa-${req.empresa.cnpj}-faturamento-${mes}.csv`, [
    `${csv.cel(req.empresa.razao_social)};CNPJ ${formatarCnpj(req.empresa.cnpj)};Mês ${mes}`,
    '',
    'Emissão;Nota;CNPJ de origem;Origem;Descrição;Situação;Recebimento;Valor (R$)',
    ...itens.map((i) =>
      [csv.data(i.data_emissao), csv.cel(i.numero_nota), formatarCnpj(i.origem_cnpj), csv.cel(i.origem_nome), csv.cel(i.descricao),
        i.status === 'recebido' ? 'Recebido' : 'A receber', csv.data(i.data_recebimento), csv.num(i.valor)].join(';')
    ),
    '',
    `;;;;;;Total faturado;${csv.num(total)}`,
  ]);
});

// ---------- Links úteis ----------
function validarLink(b = {}) {
  const titulo = texto(b.titulo);
  if (!titulo) return { erro: 'Preencha o nome do site' };
  let url = texto(b.url);
  if (!url) return { erro: 'Preencha o endereço do site' };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) throw new Error();
    url = u.toString();
  } catch {
    return { erro: 'Endereço do site inválido' };
  }
  return { titulo, url, categoria: texto(b.categoria) || 'Geral', descricao: texto(b.descricao) || null };
}

r.get('/empresas/:empresaId/links', exigir('pj.links'), carregarEmpresa, (req, res) => {
  res.json(db.prepare('SELECT * FROM links WHERE empresa_id = ? ORDER BY categoria, titulo').all(req.empresa.id));
});

r.post('/empresas/:empresaId/links', exigir('pj.links.editar'), carregarEmpresa, (req, res) => {
  const l = validarLink(req.body);
  if (l.erro) return erro(res, l.erro);
  const info = db
    .prepare('INSERT INTO links (empresa_id, titulo, url, categoria, descricao, criado_por) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.empresa.id, l.titulo, l.url, l.categoria, l.descricao, req.usuario.id);
  res.status(201).json(db.prepare('SELECT * FROM links WHERE id = ?').get(info.lastInsertRowid));
});

r.put('/empresas/:empresaId/links/:id', exigir('pj.links.editar'), carregarEmpresa, (req, res) => {
  const atual = db.prepare('SELECT * FROM links WHERE id = ? AND empresa_id = ?').get(req.params.id, req.empresa.id);
  if (!atual) return erro(res, 'Link não encontrado', 404);
  const l = validarLink(req.body);
  if (l.erro) return erro(res, l.erro);
  db.prepare('UPDATE links SET titulo=?, url=?, categoria=?, descricao=? WHERE id=?').run(l.titulo, l.url, l.categoria, l.descricao, atual.id);
  res.json(db.prepare('SELECT * FROM links WHERE id = ?').get(atual.id));
});

r.delete('/empresas/:empresaId/links/:id', exigir('pj.links.editar'), carregarEmpresa, (req, res) => {
  const info = db.prepare('DELETE FROM links WHERE id = ? AND empresa_id = ?').run(req.params.id, req.empresa.id);
  if (!info.changes) return erro(res, 'Link não encontrado', 404);
  res.status(204).end();
});

module.exports = r;
module.exports.CATEGORIAS_PJ = CATEGORIAS_PJ;
