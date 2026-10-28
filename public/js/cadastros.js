/* =========================================================
   Cadastros: pessoas físicas e jurídicas, contas bancárias
   ========================================================= */

const TIPOS_CONTA_BANCARIA = [['Corrente', 'Corrente'], ['Poupança', 'Poupança'], ['Pagamento', 'Pagamento'], ['Salário', 'Salário']];

// Formulário de pessoa (usado em Pessoas e em Meus dados)
function fichaPessoa(p, { meus = false, tipoNovo = null } = {}) {
  const tipo = p?.tipo || tipoNovo || 'PF';
  const nova = !p?.id;
  const podeEditar = meus ? pode('pf.meus_dados') : pode('pessoas.editar');
  const docTravado = !nova && (meus || p.usuario_id || p.empresa_id);
  const v = { ...(p || {}), documento: p?.documento || '' };

  const identificacao =
    tipo === 'PF'
      ? [
          { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true, largura: 3, autocomplete: 'name' },
          { nome: 'documento', rotulo: 'CPF', mascara: 'cpf', obrigatorio: true, largura: 1, somenteLeitura: docTravado },
          { nome: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'date', largura: 1 },
          { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 3, obrigatorio: meus || !!p?.usuario_id, autocomplete: 'email' },
          { nome: 'telefone', rotulo: 'Telefone', mascara: 'telefone', largura: 2 },
          { nome: 'telefone2', rotulo: 'Outro telefone', mascara: 'telefone', largura: 2 },
        ]
      : [
          { nome: 'documento', rotulo: 'CNPJ', mascara: 'cnpj', obrigatorio: true, largura: 2, somenteLeitura: docTravado },
          { nome: 'data_nascimento', rotulo: 'Data de abertura', tipo: 'date', largura: 2 },
          { nome: 'nome', rotulo: 'Razão social', obrigatorio: true, largura: 4 },
          { nome: 'nome_fantasia', rotulo: 'Nome fantasia', largura: 4 },
          { nome: 'email', rotulo: 'E-mail', tipo: 'email', largura: 2 },
          { nome: 'telefone', rotulo: 'Telefone', mascara: 'telefone', largura: 1 },
          { nome: 'telefone2', rotulo: 'Outro telefone', mascara: 'telefone', largura: 1 },
        ];
  const opc = { prefixo: 'pessoa', somenteLeitura: !podeEditar };
  const receita =
    tipo === 'PJ' && podeEditar && !docTravado
      ? `<button type="button" class="btn btn-leve" data-acao="receita-pessoa">${ICONE.buscar}Buscar dados na Receita</button>`
      : '';
  const excluir = !nova && !meus && podeEditar && !p.usuario_id && !p.empresa_id
    ? `<button type="button" class="btn btn-leve perigo-texto" data-acao="excluir-pessoa" data-id="${p.id}">Excluir cadastro</button>` : '';

  return `<form class="ficha" data-form="pessoa" data-id="${p?.id || ''}" data-tipo="${tipo}" data-meus="${meus ? 1 : ''}" novalidate>
    <section class="bloco">
      <div class="bloco-titulo"><h2>${tipo === 'PF' ? 'Dados pessoais' : 'Dados da pessoa jurídica'}</h2>${receita}</div>
      ${p?.usuario_id && !meus ? '<p class="nota">Esta pessoa é usuário do sistema. O CPF não pode ser alterado.</p>' : ''}
      ${p?.empresa_id ? `<p class="nota">Esta pessoa jurídica é uma empresa cadastrada. <a href="#/empresas/${p.empresa_id}">Abrir empresa</a></p>` : ''}
      <div class="grade-campos">${renderCampos(identificacao, v, opc)}</div>
    </section>
    <section class="bloco">
      <div class="bloco-titulo"><h2>Endereço</h2></div>
      <div class="grade-campos">${renderCampos(CAMPOS_ENDERECO(), v, opc)}</div>
    </section>
    ${meus ? '' : `<section class="bloco">
      <div class="bloco-titulo"><h2>Observações</h2></div>
      <div class="grade-campos">${renderCampos([{ nome: 'observacoes', rotulo: 'Anotações sobre este cadastro', tipo: 'textarea', largura: 4 }], v, opc)}</div>
    </section>`}
    ${podeEditar ? `<div class="rodape-ficha">${excluir}<button type="submit" class="btn btn-principal">${nova ? 'Cadastrar' : 'Salvar alterações'}</button></div>` : ''}
  </form>`;
}

function secaoContasBancarias(p, meus = false) {
  if (!p?.id) return '';
  const editar = meus ? pode('pf.meus_dados') : pode('pessoas.editar');
  estado.dados.contasBancarias = p.contas_bancarias || [];
  const itens = estado.dados.contasBancarias;
  return `<section class="bloco" style="margin-top:20px" data-pessoa="${p.id}">
    <div class="bloco-titulo"><h2>Contas bancárias</h2>${editar ? `<button type="button" class="btn btn-leve btn-mini" data-acao="nova-conta-bancaria" data-pessoa="${p.id}">${ICONE.mais}Adicionar conta</button>` : ''}</div>
    <ul class="lista">${
      itens.length
        ? itens.map((c) => `<li class="item">
            <div class="banco-sigla" aria-hidden="true">${esc(c.banco.slice(0, 2).toUpperCase())}</div>
            <div class="item-principal">
              <div class="item-titulo">${esc(c.banco)}</div>
              <div class="item-sub">
                <span>${esc(c.tipo)}</span>
                ${c.agencia || c.conta ? `<span>Ag. ${esc(c.agencia || '-')}  Conta ${esc(c.conta || '-')}</span>` : ''}
                ${c.chave_pix ? `<span>Pix: ${esc(c.chave_pix)}</span>` : ''}
              </div>
            </div>
            <div></div>
            <div class="item-acoes">${editar ? botoesEditarExcluir('conta-bancaria', c.id) : ''}</div>
          </li>`).join('')
        : vazio('Nenhuma conta bancária', 'Cadastre bancos, agências e chaves Pix.')
    }</ul>
  </section>`;
}

// ---------- Lista de pessoas ----------
async function telaPessoas() {
  const tipo = estado.abaPessoas;
  const busca = estado.buscaPessoas;
  const lista = await api(`/api/pessoas?tipo=${tipo}&busca=${encodeURIComponent(busca)}`);
  const editar = pode('pessoas.editar');
  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Cadastros</p><h1>Pessoas</h1></div>
      <div class="acoes">
        ${editar ? `<a class="btn btn-leve" href="#/pessoas/nova-pj">Nova pessoa jurídica</a>
        <a class="btn btn-principal" href="#/pessoas/nova-pf">${ICONE.mais}Nova pessoa física</a>` : ''}
      </div>
    </header>
    <section class="bloco">
      <div class="barra-filtros">
        <div class="abas" role="group" aria-label="Tipo de pessoa">
          <button type="button" data-acao="aba-pessoas" data-valor="PF" aria-pressed="${tipo === 'PF'}">Pessoas físicas</button>
          <button type="button" data-acao="aba-pessoas" data-valor="PJ" aria-pressed="${tipo === 'PJ'}">Pessoas jurídicas</button>
        </div>
        <input id="busca-pessoas" class="campo-busca" type="search" value="${esc(busca)}"
          placeholder="Buscar por nome, ${tipo === 'PF' ? 'CPF' : 'CNPJ'} ou e-mail" aria-label="Buscar pessoa" />
      </div>
      <ul class="lista">${
        lista.length
          ? lista.map((p) => `<li><a class="item item-link" href="#/pessoas/${p.id}">
              <div class="avatar ${p.tipo === 'PJ' ? 'pj' : ''}" aria-hidden="true">${esc(iniciais(p.nome_fantasia || p.nome))}</div>
              <div class="item-principal">
                <div class="item-titulo">${esc(p.nome)}</div>
                <div class="item-sub">
                  <span>${fmt.doc(p.documento)}</span>
                  ${p.email ? `<span>${esc(p.email)}</span>` : ''}
                  ${p.cidade ? `<span>${esc(p.cidade)}${p.uf ? '/' + esc(p.uf) : ''}</span>` : ''}
                </div>
              </div>
              <div class="selos">
                ${p.usuario_id ? '<span class="selo fixa">Usuário</span>' : ''}
                ${p.empresa_id ? '<span class="selo paga">Empresa</span>' : ''}
                ${p.qtd_contas ? `<span class="selo">${plural(p.qtd_contas, 'conta', 'contas')}</span>` : ''}
              </div>
              <span class="seta" aria-hidden="true">${ICONE.proximo}</span>
            </a></li>`).join('')
          : vazio(busca ? 'Nada encontrado' : `Nenhuma pessoa ${tipo === 'PF' ? 'física' : 'jurídica'} cadastrada`,
              busca ? 'Tente outro nome ou número.' : 'Cadastre clientes, fornecedores e contatos.')
      }</ul>
    </section>`;
}

const iniciais = (nome) =>
  String(nome || '?').split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÁ-Ú]/.test(p)).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

async function telaPessoa(id) {
  let p = null;
  let tipoNovo = null;
  if (id === 'nova-pf' || id === 'nova-pj') tipoNovo = id === 'nova-pf' ? 'PF' : 'PJ';
  else p = await api(`/api/pessoas/${id}`);
  const tipo = p?.tipo || tipoNovo;
  tela().innerHTML = `
    <header class="cabecalho">
      <div>
        <a class="voltar" href="#/pessoas">${ICONE.voltar}Pessoas</a>
        <h1>${p ? esc(p.nome_fantasia || p.nome) : tipo === 'PF' ? 'Nova pessoa física' : 'Nova pessoa jurídica'}</h1>
        ${p ? `<p class="subtitulo">${tipo === 'PF' ? 'CPF' : 'CNPJ'} ${fmt.doc(p.documento)}</p>` : ''}
      </div>
    </header>
    ${fichaPessoa(p, { tipoNovo })}
    ${secaoContasBancarias(p)}`;
}

// ---------- Ações ----------
let temporizadorBusca;
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'busca-pessoas') {
    estado.buscaPessoas = ev.target.value;
    clearTimeout(temporizadorBusca);
    temporizadorBusca = setTimeout(async () => {
      const pos = ev.target.selectionStart;
      await render();
      const el = $('#busca-pessoas');
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    }, 350);
  }
});

function formContaBancaria(pessoaId, c) {
  const nova = !c;
  return abrirModal({
    titulo: nova ? 'Nova conta bancária' : 'Editar conta bancária',
    botao: nova ? 'Adicionar conta' : 'Salvar alterações',
    valores: c || { tipo: 'Corrente' },
    campos: [
      { nome: 'banco', rotulo: 'Banco', placeholder: 'Ex.: Banco do Brasil', obrigatorio: true,
        lista: ['Banco do Brasil', 'Caixa Econômica Federal', 'Itaú', 'Bradesco', 'Santander', 'Nubank', 'Inter', 'Sicoob', 'Sicredi', 'C6 Bank', 'Mercado Pago', 'PagBank'] },
      [
        { nome: 'agencia', rotulo: 'Agência' },
        { nome: 'conta', rotulo: 'Conta com dígito' },
      ],
      [
        { nome: 'tipo', rotulo: 'Tipo de conta', tipo: 'select', opcoes: TIPOS_CONTA_BANCARIA },
        { nome: 'chave_pix', rotulo: 'Chave Pix', placeholder: 'CPF, e-mail, telefone ou aleatória' },
      ],
      { nome: 'observacao', rotulo: 'Observação' },
    ],
    enviar: (d) =>
      nova
        ? api(`/api/pessoas/${pessoaId}/contas-bancarias`, { method: 'POST', body: d })
        : api(`/api/pessoas/${pessoaId}/contas-bancarias/${c.id}`, { method: 'PUT', body: d }),
  });
}

const pessoaDaTela = () => $('[data-pessoa]')?.dataset.pessoa;

Object.assign(acoes, {
  'aba-pessoas': (el) => {
    estado.abaPessoas = el.dataset.valor;
    estado.buscaPessoas = '';
  },
  'nova-conta-bancaria': async (el) => {
    if (!(await formContaBancaria(el.dataset.pessoa))) return false;
    toast('Conta bancária adicionada');
  },
  'editar-conta-bancaria': async (el) => {
    const c = estado.dados.contasBancarias.find((x) => String(x.id) === el.dataset.id);
    if (!(await formContaBancaria(pessoaDaTela(), c))) return false;
    toast('Conta bancária atualizada');
  },
  'excluir-conta-bancaria': async (el) => {
    const c = estado.dados.contasBancarias.find((x) => String(x.id) === el.dataset.id);
    if (!(await confirmar('Excluir conta bancária?', `A conta do ${esc(c.banco)} será removida.`))) return false;
    await api(`/api/pessoas/${pessoaDaTela()}/contas-bancarias/${c.id}`, { method: 'DELETE' });
    toast('Conta bancária excluída');
  },
  'excluir-pessoa': async (el) => {
    if (!(await confirmar('Excluir cadastro?', 'O cadastro e as contas bancárias desta pessoa serão removidos.'))) return false;
    await api(`/api/pessoas/${el.dataset.id}`, { method: 'DELETE' });
    toast('Cadastro excluído');
    location.hash = '#/pessoas';
    return false;
  },
  'receita-pessoa': async (el) => {
    const form = el.closest('form');
    const cnpj = digitos(form.elements.documento.value);
    if (cnpj.length !== 14) {
      toast('Digite o CNPJ completo para buscar', { erro: true });
      return false;
    }
    el.disabled = true;
    try {
      const r = await api(`/api/cnpj/${cnpj}`);
      preencherForm(form, {
        nome: r.razao_social, nome_fantasia: r.nome_fantasia, data_nascimento: r.data_abertura, email: r.email,
        telefone: r.telefone, cep: r.cep, logradouro: r.logradouro, numero: r.numero, complemento: r.complemento,
        bairro: r.bairro, cidade: r.cidade, uf: r.uf,
      });
      toast(`Dados de ${r.razao_social} preenchidos pela Receita`);
    } finally {
      el.disabled = false;
    }
    return false;
  },
});

// Preenche campos de um formulário (só os que vierem com valor)
function preencherForm(form, valores, { sobrescrever = true } = {}) {
  for (const [nome, valor] of Object.entries(valores)) {
    const el = form.elements[nome];
    if (!el || valor == null || valor === '') continue;
    if (!sobrescrever && el.value) continue;
    el.value = el.dataset?.mascara ? mascarar(el.dataset.mascara, valor) : valor;
  }
}

formularios.pessoa = async (form, dados) => {
  const id = form.dataset.id;
  const meus = !!form.dataset.meus;
  const corpo = { ...dados, tipo: form.dataset.tipo };
  const salva = id
    ? await api(`/api/pessoas/${id}`, { method: 'PUT', body: corpo })
    : await api('/api/pessoas', { method: 'POST', body: corpo });
  if (meus) {
    estado.eu = await api('/api/auth/eu');
    desenharUsuarioMenu();
  }
  toast(id ? 'Cadastro atualizado' : 'Pessoa cadastrada');
  if (!id) {
    location.hash = `#/pessoas/${salva.id}`;
    return false;
  }
};
