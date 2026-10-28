/* =========================================================
   Pessoa jurídica: empresas, despesas e receitas, faturamento e links
   ========================================================= */

async function opcoesPj() {
  if (!estado.pj) estado.pj = await api('/api/pj/opcoes');
  return estado.pj;
}

async function carregarEmpresas() {
  estado.empresas = await api('/api/empresas');
  const salvo = preferencia.ler('empresaId');
  const ids = estado.empresas.map((e) => String(e.id));
  if (!ids.includes(String(estado.empresaId))) estado.empresaId = ids.includes(salvo) ? Number(salvo) : estado.empresas[0]?.id ?? null;
  return estado.empresas;
}

const empresaAtual = () => estado.empresas.find((e) => e.id === Number(estado.empresaId));

const seletorEmpresa = () =>
  estado.empresas.length > 1
    ? `<select id="seletor-empresa" class="seletor-empresa" aria-label="Empresa">${estado.empresas
        .map((e) => `<option value="${e.id}" ${e.id === Number(estado.empresaId) ? 'selected' : ''}>${esc(e.nome_fantasia || e.razao_social)}</option>`)
        .join('')}</select>`
    : '';

const nomeEmpresa = (e) => esc(e.nome_fantasia || e.razao_social);

function semEmpresa(titulo) {
  tela().innerHTML = `
    <header class="cabecalho"><div><p class="sobretitulo">Pessoa jurídica</p><h1>${titulo}</h1></div></header>
    <section class="bloco"><ul class="lista">${vazio(
      'Nenhuma empresa vinculada a você',
      estado.eu.master ? 'Cadastre a primeira empresa para começar.' : 'O usuário master precisa vincular você como responsável por uma empresa.',
      estado.eu.master ? `<div><a class="btn btn-principal" href="#/empresas/nova">${ICONE.mais}Cadastrar empresa</a></div>` : ''
    )}</ul></section>`;
}

const rotuloClassificacao = (v) => estado.pj?.classificacoes.find((c) => c.valor === v)?.rotulo || v || '';
const nomeCategoriaPj = (chave) => estado.pj?.categorias.find((c) => c.chave === chave)?.nome || chave;

// ---------- Empresas ----------
async function telaEmpresas() {
  await Promise.all([carregarEmpresas(), opcoesPj()]);
  const lista = estado.empresas;
  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Pessoa jurídica</p><h1>Empresas</h1></div>
      <div class="acoes">${estado.eu.master ? `<a class="btn btn-principal" href="#/empresas/nova">${ICONE.mais}Cadastrar empresa</a>` : ''}</div>
    </header>
    <section class="bloco">
      <ul class="lista">${
        lista.length
          ? lista.map((e) => `<li><a class="item item-link" href="#/empresas/${e.id}">
              <div class="avatar pj" aria-hidden="true">${esc(iniciais(e.nome_fantasia || e.razao_social))}</div>
              <div class="item-principal">
                <div class="item-titulo">${esc(e.razao_social)}</div>
                <div class="item-sub">
                  <span>CNPJ ${fmt.cnpj(e.cnpj)}</span>
                  ${e.nome_fantasia ? `<span>${esc(e.nome_fantasia)}</span>` : ''}
                  <span>Responsável: ${e.responsavel_nome ? esc(e.responsavel_nome) : 'não definido'}</span>
                </div>
              </div>
              <div class="selos">
                ${e.classificacao ? `<span class="selo fixa">${esc(e.classificacao === 'DEMAIS' ? 'Demais' : e.classificacao)}</span>` : ''}
                ${e.regime_tributario ? `<span class="selo">${esc(e.regime_tributario)}</span>` : ''}
                ${e.situacao_cadastral && !/ativa/i.test(e.situacao_cadastral) ? `<span class="selo vencida">${esc(e.situacao_cadastral)}</span>` : ''}
              </div>
              <span class="seta" aria-hidden="true">${ICONE.proximo}</span>
            </a></li>`).join('')
          : vazio('Nenhuma empresa', estado.eu.master ? 'Cadastre a empresa pelo CNPJ: os dados vêm da Receita Federal.' : 'O usuário master precisa vincular você a uma empresa.')
      }</ul>
    </section>`;
}

async function telaEmpresa(id) {
  const nova = id === 'nova';
  if (nova && !estado.eu.master) {
    location.hash = '#/empresas';
    return;
  }
  const [e, pj, usuarios] = await Promise.all([
    nova ? null : api(`/api/empresas/${id}`),
    opcoesPj(),
    estado.eu.master ? api('/api/usuarios') : [],
  ]);
  const editar = nova || pode('pj.empresas.editar');
  estado.empresaForm = { cnaes_secundarios: e?.cnaes_secundarios || [], socios: e?.socios || [], consultado_em: e?.consultado_em || null };
  const v = e || {};
  const opc = { prefixo: 'empresa', somenteLeitura: !editar };

  const ident = [
    { nome: 'razao_social', rotulo: 'Razão social', obrigatorio: true, largura: 4 },
    { nome: 'nome_fantasia', rotulo: 'Nome fantasia', largura: 2 },
    { nome: 'situacao_cadastral', rotulo: 'Situação cadastral', largura: 1 },
    { nome: 'data_abertura', rotulo: 'Data de abertura', tipo: 'date', largura: 1 },
    { nome: 'natureza_juridica', rotulo: 'Natureza jurídica', largura: 2 },
    { nome: 'matriz_filial', rotulo: 'Matriz ou filial', largura: 1 },
    { nome: 'capital_social', rotulo: 'Capital social (R$)', tipo: 'number', passo: '0.01', min: 0, largura: 1 },
  ];
  const classif = [
    { nome: 'classificacao', rotulo: 'Classificação da empresa', tipo: 'select', largura: 2,
      opcoes: [['', 'Selecione'], ...pj.classificacoes.map((c) => [c.valor, c.rotulo])] },
    { nome: 'regime_tributario', rotulo: 'Regime tributário', tipo: 'select', largura: 2,
      opcoes: [['', 'Selecione'], ...pj.regimes.map((r) => [r, r])],
      ajuda: 'A Receita informa só MEI e Simples. Lucro Presumido ou Real, escolha aqui.' },
    { nome: 'porte', rotulo: 'Porte na Receita', largura: 2 },
    { nome: 'cnae_principal', rotulo: 'CNAE principal', largura: 1, placeholder: '0000-0/00' },
    { nome: 'cnae_descricao', rotulo: 'Atividade principal', largura: 3 },
  ];
  const inscr = [
    { nome: 'inscricao_estadual', rotulo: 'Inscrição estadual', largura: 2 },
    { nome: 'inscricao_municipal', rotulo: 'Inscrição municipal', largura: 2 },
  ];
  const contato = [
    { nome: 'email', rotulo: 'E-mail da empresa', tipo: 'email', largura: 2 },
    { nome: 'telefone', rotulo: 'Telefone da empresa', mascara: 'telefone', largura: 1 },
    { nome: 'telefone2', rotulo: 'Outro telefone', mascara: 'telefone', largura: 1 },
  ];
  const ativos = usuarios.filter((u) => u.ativo);
  const responsavel = estado.eu.master
    ? renderCampos([{ nome: 'responsavel_id', rotulo: 'Usuário responsável', tipo: 'select', largura: 4,
        opcoes: [['', 'Sem responsável'], ...ativos.map((u) => [u.id, `${u.nome} (CPF ${fmt.cpf(u.cpf)})`])],
        ajuda: 'O responsável vê e administra esta empresa. Somente o usuário master faz este vínculo.' }], v, opc)
    : `<p class="valor-fixo">${v.responsavel_nome ? esc(v.responsavel_nome) : 'Não definido'}</p><p class="nota">Somente o usuário master altera o responsável.</p>`;

  tela().innerHTML = `
    <header class="cabecalho">
      <div>
        <a class="voltar" href="#/empresas">${ICONE.voltar}Empresas</a>
        <h1>${nova ? 'Cadastrar empresa' : nomeEmpresa(e)}</h1>
        ${e ? `<p class="subtitulo">CNPJ ${fmt.cnpj(e.cnpj)}</p>` : ''}
      </div>
      ${e ? `<div class="acoes">
        ${pode('pj.lancamentos') ? `<button type="button" class="btn btn-leve" data-acao="ir-empresa" data-id="${e.id}" data-rota="empresa-lancamentos">Despesas e receitas</button>` : ''}
        ${pode('pj.faturamento') ? `<button type="button" class="btn btn-leve" data-acao="ir-empresa" data-id="${e.id}" data-rota="faturamento">Faturamento</button>` : ''}
        ${pode('pj.links') ? `<button type="button" class="btn btn-leve" data-acao="ir-empresa" data-id="${e.id}" data-rota="links">Links úteis</button>` : ''}
      </div>` : ''}
    </header>

    <form class="ficha" data-form="empresa" data-id="${e?.id || ''}" novalidate>
      <section class="bloco receita-bloco">
        <div class="bloco-titulo"><h2>CNPJ e Receita Federal</h2></div>
        <div class="linha-receita">
          ${htmlCampo({ nome: 'cnpj', rotulo: 'CNPJ', mascara: 'cnpj', obrigatorio: true, largura: 2, somenteLeitura: !nova }, v.cnpj, opc)}
          ${editar ? `<button type="button" class="btn ${nova ? 'btn-principal' : 'btn-leve'}" data-acao="receita-empresa">${ICONE.buscar}${nova ? 'Buscar dados na Receita' : 'Atualizar pela Receita'}</button>` : ''}
        </div>
        <p class="nota" id="consulta-receita">${consultaTexto()}</p>
      </section>

      <section class="bloco"><div class="bloco-titulo"><h2>Identificação</h2></div>
        <div class="grade-campos">${renderCampos(ident, v, opc)}</div></section>

      <section class="bloco"><div class="bloco-titulo"><h2>Classificação e atividades</h2></div>
        <div class="grade-campos">${renderCampos(classif, v, opc)}</div>
        <div id="cnaes-secundarios">${listaCnaes()}</div>
      </section>

      <section class="bloco"><div class="bloco-titulo"><h2>Inscrições</h2></div>
        <div class="grade-campos">${renderCampos(inscr, v, opc)}</div></section>

      <section class="bloco"><div class="bloco-titulo"><h2>Contato</h2></div>
        <div class="grade-campos">${renderCampos(contato, v, opc)}</div></section>

      <section class="bloco"><div class="bloco-titulo"><h2>Endereço</h2></div>
        <div class="grade-campos">${renderCampos(CAMPOS_ENDERECO(), v, opc)}</div></section>

      <section class="bloco"><div class="bloco-titulo"><h2>Responsável</h2></div>${responsavel}</section>

      <section class="bloco" id="socios">${listaSocios()}</section>

      ${editar ? `<div class="rodape-ficha">
        ${!nova && estado.eu.master ? `<button type="button" class="btn btn-leve perigo-texto" data-acao="excluir-empresa" data-id="${e.id}">Excluir empresa</button>` : ''}
        <button type="submit" class="btn btn-principal">${nova ? 'Cadastrar empresa' : 'Salvar alterações'}</button>
      </div>` : ''}
    </form>`;
}

const consultaTexto = () =>
  estado.empresaForm?.consultado_em
    ? `Dados consultados na Receita em ${new Date(estado.empresaForm.consultado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.`
    : 'Digite o CNPJ e busque na Receita para preencher os dados automaticamente. Precisa de internet.';

function listaCnaes() {
  const l = estado.empresaForm?.cnaes_secundarios || [];
  if (!l.length) return '';
  return `<details class="detalhes"><summary>${plural(l.length, 'atividade secundária', 'atividades secundárias')}</summary>
    <ul class="lista-simples">${l.map((c) => `<li><b>${esc(c.codigo)}</b> ${esc(c.descricao)}</li>`).join('')}</ul></details>`;
}

function listaSocios() {
  const l = estado.empresaForm?.socios || [];
  return `<div class="bloco-titulo"><h2>Quadro de sócios</h2></div>${
    l.length
      ? `<ul class="lista-simples">${l.map((s) => `<li><b>${esc(s.nome)}</b> ${esc(s.qualificacao || '')}</li>`).join('')}</ul>`
      : '<p class="nota">Os sócios aparecem aqui depois da consulta na Receita.</p>'
  }`;
}

formularios.empresa = async (form, dados) => {
  const id = form.dataset.id;
  const corpo = { ...dados, ...estado.empresaForm, capital_social: dados.capital_social === '' ? null : dados.capital_social };
  if (!estado.eu.master) delete corpo.responsavel_id;
  const salva = id
    ? await api(`/api/empresas/${id}`, { method: 'PUT', body: corpo })
    : await api('/api/empresas', { method: 'POST', body: corpo });
  toast(id ? 'Empresa atualizada' : 'Empresa cadastrada');
  estado.empresaId = salva.id;
  preferencia.gravar('empresaId', salva.id);
  if (!id) {
    location.hash = `#/empresas/${salva.id}`;
    return false;
  }
};

// ---------- Despesas e receitas da empresa ----------
async function telaEmpresaLancamentos() {
  await Promise.all([carregarEmpresas(), opcoesPj()]);
  const e = empresaAtual();
  if (!e) return semEmpresa('Despesas e receitas');
  const r = await api(`/api/empresas/${e.id}/lancamentos?mes=${estado.mes}`);
  estado.dados.lancamentosPj = r.itens;
  const filtro = estado.filtroPj || '';
  const t = r.totais;
  const editar = pode('pj.lancamentos.editar');

  const cats = r.porCategoria
    .map((c) => {
      const valor = c.entradas - c.saidas;
      const ativo = filtro === c.chave;
      return `<button type="button" class="cat-pj ${ativo ? 'ativo' : ''}" data-acao="filtro-pj" data-valor="${ativo ? '' : c.chave}" aria-pressed="${ativo}">
        <span>${esc(c.nome)}</span>
        <strong class="${valor > 0 ? 'entrada' : valor < 0 ? 'saida' : ''}">${brl.format(Math.abs(valor))}</strong>
        <small>${esc(c.ajuda)}</small>
      </button>`;
    })
    .join('');

  const itens = r.itens.filter((i) => !filtro || i.categoria === filtro);
  let dataAtual = '';
  const linhas = itens
    .map((i) => {
      let cab = '';
      if (i.data !== dataAtual) {
        dataAtual = i.data;
        cab = `<li class="grupo-data">${maiuscula(paraData(i.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }))}</li>`;
      }
      const ent = i.tipo === 'entrada';
      return `${cab}<li class="item">
        <span class="tipo-marca ${ent ? 'entrada' : 'saida'}" aria-hidden="true"></span>
        <div class="item-principal">
          <div class="item-titulo">${esc(i.descricao)}</div>
          <div class="item-sub"><span>${esc(nomeCategoriaPj(i.categoria))}${i.categoria === 'pix' ? (ent ? ' recebido' : ' enviado') : ''}</span>
            ${i.favorecido ? `<span>${esc(i.favorecido)}</span>` : ''}</div>
        </div>
        <div class="item-valor ${ent ? 'entrada' : 'saida'}">${ent ? '+' : '−'} ${brl.format(i.valor)}</div>
        <div class="item-acoes">${editar ? botoesEditarExcluir('lancamento-pj', i.id) : ''}</div>
      </li>`;
    })
    .join('');

  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">${nomeEmpresa(e)}</p><h1>Despesas e receitas</h1></div>
      <div class="acoes">
        ${seletorEmpresa()}${seletorMes()}
        ${pode('pj.lancamentos.exportar') ? `<a class="btn btn-leve" href="/api/empresas/${e.id}/lancamentos-exportar?mes=${estado.mes}" download>${ICONE.baixar}Exportar para Excel</a>` : ''}
        ${botaoNovo('novo-lancamento-pj', 'Novo lançamento', 'pj.lancamentos.editar')}
      </div>
    </header>
    <div class="totais cinco">
      <div><small>Faturamento</small><strong class="entrada">${brl.format(t.faturamento)}</strong></div>
      <div><small>Outras entradas</small><strong class="entrada">${brl.format(t.entradas)}</strong></div>
      <div><small>Saídas</small><strong class="saida">${brl.format(t.saidas)}</strong></div>
      <div><small>Tributos</small><strong>${brl.format(t.tributos)}</strong></div>
      <div><small>Resultado do mês</small><strong class="${t.resultado < 0 ? 'saida' : ''}">${brl.format(t.resultado)}</strong></div>
    </div>
    <div class="cats-pj" role="group" aria-label="Filtrar por categoria">${cats}</div>
    <section class="bloco">
      ${filtro ? `<p class="nota">Mostrando ${esc(nomeCategoriaPj(filtro))}. <button type="button" class="link-btn" data-acao="filtro-pj" data-valor="">Mostrar todas</button></p>` : ''}
      <ul class="lista">${linhas || vazio(
        r.itens.length ? 'Nada nesta categoria' : `Nenhum lançamento em ${nomeMes(estado.mes)}`,
        'Registre tributos, Pix, outros gastos e outras receitas da empresa.',
        editar && !r.itens.length ? `<div>${botaoNovo('novo-lancamento-pj', 'Novo lançamento')}</div>` : ''
      )}</ul>
    </section>`;
}

function formLancamentoPj(l) {
  const novo = !l;
  const cats = estado.pj.categorias;
  return abrirModal({
    titulo: novo ? 'Novo lançamento da empresa' : 'Editar lançamento',
    botao: novo ? 'Adicionar lançamento' : 'Salvar alterações',
    valores: l || { categoria: estado.filtroPj || 'outros_gastos', tipo: 'saida', data: estado.mes === mesHoje() ? hoje() : `${estado.mes}-01` },
    campos: [
      { nome: 'categoria', rotulo: 'Categoria', tipo: 'select', opcoes: cats.map((c) => [c.chave, c.nome]) },
      { nome: 'tipo', rotulo: 'Sentido do Pix', tipo: 'segmentado', opcoes: [['saida', 'Pix enviado'], ['entrada', 'Pix recebido']], mostrarSe: (d) => d.categoria === 'pix' },
      { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, placeholder: 'Ex.: DAS de outubro' },
      [
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'number', passo: '0.01', min: 0, placeholder: '0,00', obrigatorio: true },
        { nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true },
      ],
      { nome: 'favorecido', rotulo: 'Favorecido ou origem', placeholder: 'Quem recebeu ou enviou (opcional)' },
      { nome: 'observacao', rotulo: 'Observação' },
    ],
    enviar: (d) => {
      const e = empresaAtual();
      return novo
        ? api(`/api/empresas/${e.id}/lancamentos`, { method: 'POST', body: d })
        : api(`/api/empresas/${e.id}/lancamentos/${l.id}`, { method: 'PUT', body: d });
    },
  });
}

// ---------- Faturamento ----------
async function telaFaturamento() {
  await carregarEmpresas();
  const e = empresaAtual();
  if (!e) return semEmpresa('Faturamento');
  const r = await api(`/api/empresas/${e.id}/faturamentos?mes=${estado.mes}`);
  estado.dados.faturamentos = r.itens;
  const t = r.totais;
  const editar = pode('pj.faturamento.editar');
  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">${nomeEmpresa(e)}</p><h1>Faturamento</h1></div>
      <div class="acoes">
        ${seletorEmpresa()}${seletorMes()}
        ${pode('pj.faturamento.exportar') ? `<a class="btn btn-leve" href="/api/empresas/${e.id}/faturamentos-exportar?mes=${estado.mes}" download>${ICONE.baixar}Exportar para Excel</a>` : ''}
        ${editar ? `<a class="btn btn-principal" href="#/faturamento/novo">${ICONE.mais}Incluir faturamento</a>` : ''}
      </div>
    </header>
    <div class="totais cinco">
      <div><small>Faturado no mês</small><strong>${brl.format(t.total)}</strong></div>
      <div><small>Recebido</small><strong class="entrada">${brl.format(t.recebido)}</strong></div>
      <div><small>A receber</small><strong class="${t.a_receber ? 'alerta' : ''}">${brl.format(t.a_receber)}</strong></div>
      <div><small>Acumulado em ${estado.mes.slice(0, 4)}</small><strong>${brl.format(t.acumulado_ano)}</strong></div>
      <div><small>Últimos 12 meses</small><strong>${brl.format(t.ultimos_12_meses)}</strong></div>
    </div>
    <section class="bloco">
      <ul class="lista">${
        r.itens.length
          ? r.itens.map((f) => `<li class="item">
              ${blocoDia(f.data_emissao)}
              <div class="item-principal">
                <div class="item-titulo">${esc(f.origem_nome)}</div>
                <div class="item-sub">
                  <span>CNPJ ${fmt.cnpj(f.origem_cnpj)}</span>
                  ${f.numero_nota ? `<span>Nota ${esc(f.numero_nota)}</span>` : ''}
                  ${f.descricao ? `<span>${esc(f.descricao)}</span>` : ''}
                  ${f.status === 'recebido' ? `<span class="selo paga">Recebido em ${dataBR(f.data_recebimento)}</span>` : '<span class="selo logo">A receber</span>'}
                </div>
              </div>
              <div class="item-valor">${brl.format(f.valor)}</div>
              <div class="item-acoes">${editar ? `
                ${f.status === 'recebido'
                  ? `<button type="button" class="btn btn-leve btn-mini" data-acao="reabrir-fat" data-id="${f.id}">Desfazer recebimento</button>`
                  : `<button type="button" class="btn btn-leve btn-mini" data-acao="receber-fat" data-id="${f.id}">Receber</button>`}
                <a class="icone-btn" href="#/faturamento/${f.id}" aria-label="Editar">${ICONE.editar}</a>
                <button type="button" class="icone-btn excluir" data-acao="excluir-fat" data-id="${f.id}" aria-label="Excluir">${ICONE.excluir}</button>` : ''}
              </div>
            </li>`).join('')
          : vazio(`Nenhum faturamento em ${nomeMes(estado.mes)}`, 'Inclua as notas emitidas com o CNPJ de quem pagou.',
              editar ? `<div><a class="btn btn-principal" href="#/faturamento/novo">${ICONE.mais}Incluir faturamento</a></div>` : '')
      }</ul>
    </section>`;
}

// Página de inclusão (e edição) de faturamento
async function telaFaturamentoForm(id) {
  await carregarEmpresas();
  if (!estado.empresas.length) return semEmpresa('Incluir faturamento');
  if (!pode('pj.faturamento.editar')) {
    location.hash = '#/faturamento';
    return;
  }
  const novo = id === 'novo';
  let f = null;
  if (!novo) {
    f = (estado.dados.faturamentos || []).find((x) => String(x.id) === String(id));
    if (!f) {
      location.hash = '#/faturamento';
      return;
    }
  }
  estado.pessoasPj = await api('/api/pessoas?tipo=PJ').catch(() => []);
  const v = f || { data_emissao: hoje(), status: 'a_receber', empresa_id: estado.empresaId };
  const opc = { prefixo: 'fat' };
  const campos1 = [
    { nome: 'empresa_id', rotulo: 'Empresa que faturou', tipo: 'select', largura: 4, opcoes: estado.empresas.map((e) => [e.id, `${e.nome_fantasia || e.razao_social} (CNPJ ${fmt.cnpj(e.cnpj)})`]), somenteLeitura: !novo },
  ];
  const origem = [
    { nome: 'origem_cnpj', rotulo: 'CNPJ de origem do faturamento', mascara: 'cnpj', obrigatorio: true, largura: 2,
      lista: estado.pessoasPj.map((p) => fmt.cnpj(p.documento)), ajuda: 'Quem pagou ou contratou. Ao completar o CNPJ, o nome é preenchido.' },
    { nome: 'origem_nome', rotulo: 'Razão social da origem', obrigatorio: true, largura: 2 },
  ];
  const nota = [
    { nome: 'numero_nota', rotulo: 'Número da nota fiscal', largura: 1 },
    { nome: 'data_emissao', rotulo: 'Data de emissão', tipo: 'date', obrigatorio: true, largura: 1 },
    { nome: 'valor', rotulo: 'Valor faturado (R$)', tipo: 'number', passo: '0.01', min: 0, obrigatorio: true, largura: 2 },
    { nome: 'descricao', rotulo: 'Descrição do serviço ou produto', largura: 4 },
  ];
  const situacao = [
    { nome: 'status', rotulo: 'Situação', tipo: 'segmentado', largura: 2, opcoes: [['a_receber', 'A receber'], ['recebido', 'Recebido']] },
    { nome: 'data_recebimento', rotulo: 'Data do recebimento', tipo: 'date', largura: 2, mostrarSe: (d) => d.status === 'recebido' },
  ];
  tela().innerHTML = `
    <header class="cabecalho">
      <div>
        <a class="voltar" href="#/faturamento">${ICONE.voltar}Faturamento</a>
        <h1>${novo ? 'Incluir faturamento' : 'Editar faturamento'}</h1>
      </div>
    </header>
    <form class="ficha" data-form="faturamento" data-id="${f?.id || ''}" novalidate>
      <section class="bloco"><div class="grade-campos">${renderCampos(campos1, v, opc)}</div></section>
      <section class="bloco">
        <div class="bloco-titulo"><h2>Origem do faturamento</h2>
          <button type="button" class="btn btn-leve btn-mini" data-acao="receita-origem">${ICONE.buscar}Buscar na Receita</button></div>
        <div class="grade-campos">${renderCampos(origem, v, opc)}</div>
      </section>
      <section class="bloco"><div class="bloco-titulo"><h2>Nota e valor</h2></div>
        <div class="grade-campos">${renderCampos(nota, v, opc)}</div></section>
      <section class="bloco"><div class="bloco-titulo"><h2>Recebimento</h2></div>
        <div class="grade-campos">${renderCampos(situacao, v, opc)}</div></section>
      <div class="rodape-ficha">
        <a class="btn btn-leve" href="#/faturamento">Cancelar</a>
        ${novo ? '<button type="submit" class="btn btn-leve" name="_continuar" value="1">Salvar e incluir outro</button>' : ''}
        <button type="submit" class="btn btn-principal">${novo ? 'Incluir faturamento' : 'Salvar alterações'}</button>
      </div>
    </form>`;
  ligarDependencias($('[data-form=faturamento]'), situacao);
}

// Ao completar o CNPJ de origem, busca o nome no cadastro e, se não achar, na Receita
document.addEventListener('input', async (ev) => {
  const el = ev.target;
  if (el.name !== 'origem_cnpj') return;
  const cnpj = digitos(el.value);
  if (cnpj.length !== 14) return;
  const form = el.closest('form');
  const conhecida = (estado.pessoasPj || []).find((p) => p.documento === cnpj);
  if (conhecida) {
    form.elements.origem_nome.value = conhecida.nome;
    return;
  }
  if (!form.elements.origem_nome.value) buscarOrigemNaReceita(form, true);
});

async function buscarOrigemNaReceita(form, silencioso = false) {
  const cnpj = digitos(form.elements.origem_cnpj.value);
  if (cnpj.length !== 14) {
    if (!silencioso) toast('Digite o CNPJ completo para buscar', { erro: true });
    return;
  }
  try {
    const r = await api(`/api/cnpj/${cnpj}`);
    form.elements.origem_nome.value = r.razao_social;
    toast(`Origem: ${r.razao_social}`);
  } catch (e) {
    if (!silencioso || e.status === 404) toast(e.message, { erro: true });
  }
}

formularios.faturamento = async (form, dados, ev) => {
  const id = form.dataset.id;
  const empresaId = dados.empresa_id || estado.empresaId;
  const continuar = ev.submitter?.name === '_continuar';
  delete dados._continuar;
  if (id) await api(`/api/empresas/${empresaId}/faturamentos/${id}`, { method: 'PUT', body: dados });
  else await api(`/api/empresas/${empresaId}/faturamentos`, { method: 'POST', body: dados });
  estado.empresaId = Number(empresaId);
  preferencia.gravar('empresaId', empresaId);
  toast(id ? 'Faturamento atualizado' : 'Faturamento incluído');
  if (continuar) {
    await telaFaturamentoForm('novo');
    $('[name=origem_cnpj]')?.focus();
  } else {
    estado.mes = dados.data_emissao.slice(0, 7);
    location.hash = '#/faturamento';
  }
  return false;
};

// ---------- Links úteis ----------
async function telaLinks() {
  await carregarEmpresas();
  const e = empresaAtual();
  if (!e) return semEmpresa('Links úteis');
  const links = await api(`/api/empresas/${e.id}/links`);
  estado.dados.links = links;
  const editar = pode('pj.links.editar');
  const grupos = {};
  for (const l of links) (grupos[l.categoria] ||= []).push(l);
  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  };
  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">${nomeEmpresa(e)}</p><h1>Links úteis</h1></div>
      <div class="acoes">${seletorEmpresa()}${botaoNovo('novo-link', 'Novo link', 'pj.links.editar')}</div>
    </header>
    ${links.length
      ? Object.entries(grupos).map(([cat, itens]) => `
        <section class="bloco">
          <div class="bloco-titulo"><h2>${esc(cat)}</h2><span class="contador">${itens.length}</span></div>
          <ul class="lista">${itens.map((l) => `<li class="item">
            <div class="avatar link" aria-hidden="true">${esc(host(l.url).slice(0, 1).toUpperCase())}</div>
            <div class="item-principal">
              <div class="item-titulo">${esc(l.titulo)}</div>
              <div class="item-sub"><span>${esc(host(l.url))}</span>${l.descricao ? `<span>${esc(l.descricao)}</span>` : ''}</div>
            </div>
            <a class="btn btn-leve btn-mini" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${ICONE.abrir}Abrir</a>
            <div class="item-acoes">${editar ? botoesEditarExcluir('link', l.id) : ''}</div>
          </li>`).join('')}</ul>
        </section>`).join('')
      : `<section class="bloco"><ul class="lista">${vazio('Nenhum link cadastrado', 'Guarde os sites que você mais usa: portal do Simples, prefeitura, banco, contabilidade.',
          editar ? `<div>${botaoNovo('novo-link', 'Novo link')}</div>` : '')}</ul></section>`}`;
}

function formLink(l) {
  const novo = !l;
  const usadas = [...new Set((estado.dados.links || []).map((x) => x.categoria))];
  const sugestoes = [...new Set([...usadas, 'Impostos', 'Bancos', 'Prefeitura', 'Governo', 'Contabilidade', 'Fornecedores', 'Clientes'])];
  return abrirModal({
    titulo: novo ? 'Novo link' : 'Editar link',
    botao: novo ? 'Adicionar link' : 'Salvar alterações',
    valores: l || { categoria: 'Geral' },
    campos: [
      { nome: 'titulo', rotulo: 'Nome do site', obrigatorio: true, placeholder: 'Ex.: Portal do Simples Nacional' },
      { nome: 'url', rotulo: 'Endereço', obrigatorio: true, placeholder: 'Ex.: www8.receita.fazenda.gov.br', tipo: 'text' },
      { nome: 'categoria', rotulo: 'Categoria', lista: sugestoes },
      { nome: 'descricao', rotulo: 'Para que serve', placeholder: 'Opcional' },
    ],
    enviar: (d) => {
      const e = empresaAtual();
      return novo
        ? api(`/api/empresas/${e.id}/links`, { method: 'POST', body: d })
        : api(`/api/empresas/${e.id}/links/${l.id}`, { method: 'PUT', body: d });
    },
  });
}

// ---------- Ações ----------
const acharPj = (lista, id) => (estado.dados[lista] || []).find((x) => String(x.id) === String(id));

Object.assign(acoes, {
  'ir-empresa': (el) => {
    estado.empresaId = Number(el.dataset.id);
    preferencia.gravar('empresaId', el.dataset.id);
    location.hash = `#/${el.dataset.rota}`;
    return false;
  },
  'filtro-pj': (el) => { estado.filtroPj = el.dataset.valor; },
  'receita-empresa': async (el) => {
    const form = el.closest('form');
    const cnpj = digitos(form.elements.cnpj.value);
    if (cnpj.length !== 14) {
      toast('Digite o CNPJ completo para buscar', { erro: true });
      return false;
    }
    el.disabled = true;
    try {
      const r = await api(`/api/cnpj/${cnpj}`);
      preencherForm(form, {
        razao_social: r.razao_social, nome_fantasia: r.nome_fantasia, situacao_cadastral: r.situacao_cadastral,
        data_abertura: r.data_abertura, natureza_juridica: r.natureza_juridica, matriz_filial: r.matriz_filial,
        capital_social: r.capital_social, classificacao: r.classificacao, regime_tributario: r.regime_tributario,
        porte: r.porte, cnae_principal: r.cnae_principal, cnae_descricao: r.cnae_descricao,
        inscricao_estadual: r.inscricao_estadual, email: r.email, telefone: r.telefone, cep: r.cep,
        logradouro: r.logradouro, numero: r.numero, complemento: r.complemento, bairro: r.bairro, cidade: r.cidade, uf: r.uf,
      });
      estado.empresaForm = { cnaes_secundarios: r.cnaes_secundarios, socios: r.socios, consultado_em: r.consultado_em };
      $('#cnaes-secundarios').innerHTML = listaCnaes();
      $('#socios').innerHTML = listaSocios();
      $('#consulta-receita').textContent = consultaTexto();
      toast(`Dados de ${r.razao_social} preenchidos. Confira e salve.`);
    } finally {
      el.disabled = false;
    }
    return false;
  },
  'excluir-empresa': async (el) => {
    if (!(await confirmar('Excluir empresa?', 'A empresa, as despesas, o faturamento e os links dela serão apagados. O cadastro de pessoa jurídica continua em Pessoas.'))) return false;
    await api(`/api/empresas/${el.dataset.id}`, { method: 'DELETE' });
    toast('Empresa excluída');
    location.hash = '#/empresas';
    return false;
  },

  'novo-lancamento-pj': async () => {
    await opcoesPj();
    if (!(await formLancamentoPj())) return false;
    toast('Lançamento adicionado');
  },
  'editar-lancamento-pj': async (el) => {
    if (!(await formLancamentoPj(acharPj('lancamentosPj', el.dataset.id)))) return false;
    toast('Lançamento atualizado');
  },
  'excluir-lancamento-pj': async (el) => {
    const l = acharPj('lancamentosPj', el.dataset.id);
    if (!(await confirmar('Excluir lançamento?', `"${esc(l.descricao)}" de ${brl.format(l.valor)} será removido.`))) return false;
    await api(`/api/empresas/${estado.empresaId}/lancamentos/${l.id}`, { method: 'DELETE' });
    toast('Lançamento excluído');
  },

  'receita-origem': async (el) => {
    await buscarOrigemNaReceita(el.closest('form'));
    return false;
  },
  'receber-fat': async (el) => {
    const f = acharPj('faturamentos', el.dataset.id);
    const ok = await abrirModal({
      titulo: 'Registrar recebimento',
      mensagem: `${esc(f.origem_nome)}: <strong>${brl.format(f.valor)}</strong>`,
      botao: 'Confirmar recebimento',
      valores: { data: hoje() },
      campos: [{ nome: 'data', rotulo: 'Data do recebimento', tipo: 'date', obrigatorio: true }],
      enviar: (d) => api(`/api/empresas/${estado.empresaId}/faturamentos/${f.id}/receber`, { method: 'POST', body: d }),
    });
    if (!ok) return false;
    toast('Recebimento registrado');
  },
  'reabrir-fat': async (el) => {
    await api(`/api/empresas/${estado.empresaId}/faturamentos/${el.dataset.id}/reabrir`, { method: 'POST' });
    toast('Faturamento voltou para A receber');
  },
  'excluir-fat': async (el) => {
    const f = acharPj('faturamentos', el.dataset.id);
    if (!(await confirmar('Excluir faturamento?', `${esc(f.origem_nome)}, ${brl.format(f.valor)}, será removido.`))) return false;
    await api(`/api/empresas/${estado.empresaId}/faturamentos/${f.id}`, { method: 'DELETE' });
    toast('Faturamento excluído');
  },

  'novo-link': async () => {
    if (!(await formLink())) return false;
    toast('Link adicionado');
  },
  'editar-link': async (el) => {
    if (!(await formLink(acharPj('links', el.dataset.id)))) return false;
    toast('Link atualizado');
  },
  'excluir-link': async (el) => {
    const l = acharPj('links', el.dataset.id);
    if (!(await confirmar('Excluir link?', `"${esc(l.titulo)}" será removido.`))) return false;
    await api(`/api/empresas/${estado.empresaId}/links/${l.id}`, { method: 'DELETE' });
    toast('Link excluído');
  },
});

document.addEventListener('change', (ev) => {
  if (ev.target.id === 'seletor-empresa') {
    estado.empresaId = Number(ev.target.value);
    estado.filtroPj = '';
    preferencia.gravar('empresaId', ev.target.value);
    render();
  }
});
