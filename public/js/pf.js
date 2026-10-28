/* =========================================================
   Pessoa física: visão geral, finanças, contas, tarefas e meus dados
   ========================================================= */

function situacaoConta(c) {
  if (c.paga) return { classe: 'paga', texto: `Paga em ${dataBR(c.pago_em)}` };
  if (c.vencimento < hoje()) return { classe: 'vencida', texto: 'Vencida' };
  if (c.vencimento <= somarDias(7)) return { classe: 'logo', texto: c.vencimento === hoje() ? 'Vence hoje' : 'Vence logo' };
  return { classe: '', texto: '' };
}

function textoPrazo(t) {
  if (!t.prazo) return { texto: 'Sem prazo', atrasada: false };
  if (t.concluida) return { texto: `Prazo ${dataBR(t.prazo)}`, atrasada: false };
  if (t.prazo < hoje()) return { texto: `Venceu em ${dataBR(t.prazo)}`, atrasada: true };
  if (t.prazo === hoje()) return { texto: 'Para hoje', atrasada: false };
  if (t.prazo === somarDias(1)) return { texto: 'Para amanhã', atrasada: false };
  return { texto: `Prazo ${dataBR(t.prazo)}`, atrasada: false };
}

const nomePrioridade = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

function itemConta(c, compacto = false) {
  const s = situacaoConta(c);
  const editar = pode('pf.contas.editar');
  const acao = !editar
    ? ''
    : c.paga
    ? `<button type="button" class="btn btn-leve btn-mini" data-acao="desfazer-conta" data-id="${c.id}">Desfazer pagamento</button>`
    : `<button type="button" class="btn btn-leve btn-mini" data-acao="pagar-conta" data-id="${c.id}">Pagar</button>`;
  return `<li class="item">
    ${blocoDia(c.vencimento, c.paga ? '' : s.classe)}
    <div class="item-principal">
      <div class="item-titulo">${esc(c.descricao)}</div>
      <div class="item-sub">
        <span>${c.paga ? s.texto : `Vence ${dataBR(c.vencimento)}`}</span>
        ${c.fixa_id ? '<span class="selo fixa">Mensal</span>' : ''}
        ${!c.paga && s.classe ? `<span class="selo ${s.classe}">${s.texto}</span>` : ''}
      </div>
    </div>
    <div class="item-valor">${brl.format(c.valor)}</div>
    <div class="item-acoes">${acao}${compacto || !editar ? '' : botoesEditarExcluir('conta', c.id)}</div>
  </li>`;
}

function itemTarefa(t, compacto = false) {
  const p = textoPrazo(t);
  const editar = pode('pf.tarefas.editar');
  return `<li class="item ${t.concluida ? 'feita' : ''}">
    <input type="checkbox" class="marcar" data-acao="concluir" data-id="${t.id}" ${t.concluida ? 'checked' : ''} ${editar ? '' : 'disabled'}
      aria-label="${t.concluida ? 'Reabrir' : 'Concluir'} ${esc(t.titulo)}" />
    <div class="item-principal">
      <div class="item-titulo">${esc(t.titulo)}</div>
      <div class="item-sub"><span class="${p.atrasada ? 'saida' : ''}">${p.texto}</span></div>
    </div>
    <div>${t.prioridade !== 'media' || !compacto ? `<span class="selo ${t.prioridade}">${nomePrioridade[t.prioridade]}</span>` : ''}</div>
    <div class="item-acoes">${compacto || !editar ? '' : botoesEditarExcluir('tarefa', t.id)}</div>
  </li>`;
}

function graficoHistorico(historico, campos = { a: 'receitas', b: 'despesas' }, legendas = ['Receitas', 'Despesas']) {
  const L = 560, A = 196, base = 166, alt = 150;
  const max = Math.max(1, ...historico.flatMap((h) => [h[campos.a], h[campos.b]]));
  const grupo = L / historico.length;
  const bw = Math.min(24, grupo / 3.2);
  const barras = historico
    .map((h, i) => {
      const cx = grupo * i + grupo / 2;
      const ha = (h[campos.a] / max) * alt;
      const hb = (h[campos.b] / max) * alt;
      return `<g>
        <title>${nomeMes(h.mes)}: ${legendas[0].toLowerCase()} ${brl.format(h[campos.a])}, ${legendas[1].toLowerCase()} ${brl.format(h[campos.b])}</title>
        <rect class="barra-entrada" x="${cx - bw - 2}" y="${base - ha}" width="${bw}" height="${Math.max(ha, 1.5)}" rx="4"/>
        <rect class="barra-saida" x="${cx + 2}" y="${base - hb}" width="${bw}" height="${Math.max(hb, 1.5)}" rx="4"/>
        <text class="eixo ${h.mes === estado.mes ? 'ativo' : ''}" x="${cx}" y="${A - 8}" text-anchor="middle">${mesCurto(h.mes)}</text>
      </g>`;
    })
    .join('');
  return `<div class="grafico">
    <div class="legenda"><span><i style="background:var(--entrada)"></i>${legendas[0]}</span><span><i style="background:var(--saida)"></i>${legendas[1]}</span></div>
    <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="${legendas[0]} e ${legendas[1].toLowerCase()} dos últimos 6 meses">
      <line class="base" x1="0" x2="${L}" y1="${base + 0.5}" y2="${base + 0.5}"/>${barras}
    </svg></div>`;
}

function valorGrande(v) {
  const txt = brl.format(v);
  const i = txt.lastIndexOf(',');
  return `${esc(txt.slice(0, i))}<span class="centavos">${esc(txt.slice(i))}</span>`;
}

// ---------- Visão geral ----------
async function telaInicio() {
  const r = await api(`/api/resumo?mes=${estado.mes}`);
  estado.dados.contas = r.proximasContas;
  estado.dados.tarefas = r.proximasTarefas;
  const maxCat = Math.max(1, ...r.porCategoria.map((c) => c.total));
  const primeiroNome = estado.eu.nome.split(' ')[0];

  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Olá, ${esc(primeiroNome)}</p><h1>Visão geral</h1></div>
      <div class="acoes">${seletorMes()}${botaoNovo('novo-lancamento', 'Novo lançamento', 'pf.financas.editar')}</div>
    </header>

    <section class="destaque" aria-label="Saldo do mês">
      <div>
        <p class="destaque-rotulo">Saldo de ${nomeMes(r.mes)}</p>
        <p class="saldo ${r.saldo < 0 ? 'saida' : ''}">${valorGrande(r.saldo)}</p>
        <div class="fluxo">
          <div><small>Receitas</small><strong class="entrada">${brl.format(r.receitas)}</strong></div>
          <div><small>Despesas</small><strong class="saida">${brl.format(r.despesas)}</strong></div>
          <div><small>Contas em aberto</small><strong>${brl.format(r.contas.total_aberto)}</strong></div>
        </div>
      </div>
      ${graficoHistorico(r.historico)}
    </section>

    ${r.contas.vencidas && pode('pf.contas')
      ? `<div class="aviso-faixa" role="alert">Você tem ${plural(r.contas.vencidas, 'conta vencida', 'contas vencidas')}.<a href="#/contas">Ver contas</a></div>`
      : ''}

    <div class="duas-colunas">
      ${pode('pf.contas') ? `<section class="bloco">
        <div class="bloco-titulo"><h2>Próximos vencimentos</h2><a href="#/contas">Todas as contas</a></div>
        <ul class="lista">${r.proximasContas.length ? r.proximasContas.map((c) => itemConta(c, true)).join('') : vazio('Nenhuma conta em aberto', 'Tudo pago por aqui.')}</ul>
      </section>` : ''}
      ${pode('pf.tarefas') ? `<section class="bloco">
        <div class="bloco-titulo"><h2>Tarefas pendentes</h2><a href="#/tarefas">Todas as tarefas</a></div>
        <ul class="lista">${r.proximasTarefas.length ? r.proximasTarefas.map((t) => itemTarefa(t, true)).join('') : vazio('Nenhuma tarefa pendente', 'Crie uma tarefa para não esquecer de nada.')}</ul>
      </section>` : ''}
    </div>

    <section class="bloco" style="margin-top:20px">
      <div class="bloco-titulo"><h2>Para onde foi o dinheiro em ${mesCurto(r.mes)}</h2>${pode('pf.financas') ? '<a href="#/financas">Ver lançamentos</a>' : ''}</div>
      ${r.porCategoria.length
        ? `<div class="categorias">${r.porCategoria.map((c) => `<div class="categoria"><span>${esc(c.categoria)}</span>
            <div class="trilho"><div class="cheio" style="width:${(c.total / maxCat) * 100}%"></div></div>
            <span class="num">${brl.format(c.total)}</span></div>`).join('')}</div>`
        : '<p class="vazio">Nenhuma despesa lançada neste mês.</p>'}
    </section>`;
}

// ---------- Finanças ----------
async function telaFinancas() {
  const [itens, categorias] = await Promise.all([api(`/api/transacoes?mes=${estado.mes}`), api('/api/categorias')]);
  estado.dados.transacoes = itens;
  estado.dados.categorias = categorias;
  const receitas = soma(itens.filter((t) => t.tipo === 'receita'));
  const despesas = soma(itens.filter((t) => t.tipo === 'despesa'));
  const f = estado.filtro;
  const usadas = [...new Set(itens.map((t) => t.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (f.categoria && !usadas.includes(f.categoria)) f.categoria = '';

  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Pessoa física</p><h1>Finanças</h1></div>
      <div class="acoes">
        ${seletorMes()}
        ${pode('pf.financas.exportar') ? `<a class="btn btn-leve" href="/api/exportar?mes=${estado.mes}" download>${ICONE.baixar}Exportar para Excel</a>` : ''}
        ${botaoNovo('novo-lancamento', 'Novo lançamento', 'pf.financas.editar')}
      </div>
    </header>
    <div class="totais">
      <div><small>Receitas</small><strong class="entrada">${brl.format(receitas)}</strong></div>
      <div><small>Despesas</small><strong class="saida">${brl.format(despesas)}</strong></div>
      <div><small>Saldo</small><strong class="${receitas - despesas < 0 ? 'saida' : ''}">${brl.format(receitas - despesas)}</strong></div>
    </div>
    <section class="bloco">
      <div class="barra-filtros">
        <div class="abas" role="group" aria-label="Tipo">
          ${[['todos', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas']]
            .map(([v, t]) => `<button type="button" data-acao="filtro-tipo" data-valor="${v}" aria-pressed="${f.tipo === v}">${t}</button>`).join('')}
        </div>
        <select id="filtro-categoria" aria-label="Categoria">
          <option value="">Todas as categorias</option>
          ${usadas.map((c) => `<option ${c === f.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <input id="busca" class="campo-busca" type="search" placeholder="Buscar lançamento" value="${esc(f.busca)}" aria-label="Buscar lançamento" />
      </div>
      <ul class="lista" id="lista-lancamentos"></ul>
    </section>`;
  desenharLancamentos();
}

function desenharLancamentos() {
  const f = estado.filtro;
  const todos = estado.dados.transacoes;
  const busca = f.busca.trim().toLocaleLowerCase('pt-BR');
  const itens = todos.filter(
    (t) => (f.tipo === 'todos' || t.tipo === f.tipo) && (!f.categoria || t.categoria === f.categoria) &&
      (!busca || t.descricao.toLocaleLowerCase('pt-BR').includes(busca))
  );
  const ul = $('#lista-lancamentos');
  if (!ul) return;
  if (!todos.length) {
    ul.innerHTML = vazio(`Nenhum lançamento em ${nomeMes(estado.mes)}`, 'Registre receitas e despesas para acompanhar seu saldo.',
      pode('pf.financas.editar') ? `<div>${botaoNovo('novo-lancamento', 'Novo lançamento')}</div>` : '');
    return;
  }
  if (!itens.length) {
    ul.innerHTML = vazio('Nada encontrado', 'Mude os filtros ou a busca para ver outros lançamentos.');
    return;
  }
  const editar = pode('pf.financas.editar');
  let dataAtual = '';
  ul.innerHTML = itens
    .map((t) => {
      let cab = '';
      if (t.data !== dataAtual) {
        dataAtual = t.data;
        const rotulo = paraData(t.data).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
        cab = `<li class="grupo-data">${t.data === hoje() ? 'Hoje' : maiuscula(rotulo)}</li>`;
      }
      const receita = t.tipo === 'receita';
      return `${cab}<li class="item">
        <span class="tipo-marca ${receita ? 'entrada' : 'saida'}" aria-hidden="true"></span>
        <div class="item-principal">
          <div class="item-titulo">${esc(t.descricao)}</div>
          <div class="item-sub"><span>${esc(t.categoria)}</span>${t.conta_id ? '<span class="selo paga">Conta paga</span>' : ''}</div>
        </div>
        <div class="item-valor ${receita ? 'entrada' : 'saida'}">${receita ? '+' : '−'} ${brl.format(t.valor)}</div>
        <div class="item-acoes">${editar ? botoesEditarExcluir('lancamento', t.id) : ''}</div>
      </li>`;
    })
    .join('');
}

// ---------- Contas ----------
async function telaContas() {
  const [contas, fixas] = await Promise.all([api('/api/contas'), api('/api/contas-fixas')]);
  estado.dados.contas = contas;
  estado.dados.fixas = fixas;
  const editar = pode('pf.contas.editar');
  const abertas = contas.filter((c) => !c.paga);
  const pagas = contas.filter((c) => c.paga).sort((a, b) => (b.pago_em || '').localeCompare(a.pago_em || ''));
  const vencidas = abertas.filter((c) => c.vencimento < hoje());
  const pagasNoMes = pagas.filter((c) => (c.pago_em || '').startsWith(mesHoje()));
  const aba = estado.abaContas;

  let lista;
  if (aba === 'abertas') {
    lista = abertas.length ? abertas.map((c) => itemConta(c)).join('')
      : vazio('Nenhuma conta em aberto', 'Cadastre as contas do mês para receber os alertas de vencimento.', editar ? `<div>${botaoNovo('nova-conta', 'Nova conta')}</div>` : '');
  } else if (aba === 'pagas') {
    lista = pagas.length ? pagas.map((c) => itemConta(c)).join('') : vazio('Nenhuma conta paga ainda', 'As contas que você pagar aparecem aqui.');
  } else {
    lista = fixas.length
      ? fixas.map((f) => `<li class="item">
          <div class="dia"><b>${f.dia}</b><small>dia</small></div>
          <div class="item-principal">
            <div class="item-titulo">${esc(f.descricao)}</div>
            <div class="item-sub"><span>Todo dia ${f.dia}</span>${f.ativa ? '' : '<span class="selo">Pausada</span>'}</div>
          </div>
          <div class="item-valor">${brl.format(f.valor)}</div>
          <div class="item-acoes">${editar ? `<button type="button" class="btn btn-leve btn-mini" data-acao="pausar-fixa" data-id="${f.id}">${f.ativa ? 'Pausar' : 'Retomar'}</button>${botoesEditarExcluir('fixa', f.id)}` : ''}</div>
        </li>`).join('')
      : vazio('Nenhuma conta fixa', 'Luz, internet, aluguel: cadastre uma vez e ela aparece todo mês em Contas.', editar ? `<div>${botaoNovo('nova-fixa', 'Nova conta fixa')}</div>` : '');
  }

  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Pessoa física</p><h1>Contas</h1></div>
      <div class="acoes">
        ${editar ? '<button type="button" class="btn btn-leve" data-acao="nova-fixa">Nova conta fixa</button>' : ''}
        ${botaoNovo('nova-conta', 'Nova conta', 'pf.contas.editar')}
      </div>
    </header>
    <div class="totais">
      <div><small>Em aberto</small><strong>${brl.format(soma(abertas))}</strong></div>
      <div><small>Vencidas</small><strong class="${vencidas.length ? 'saida' : ''}">${brl.format(soma(vencidas))}</strong></div>
      <div><small>Pago em ${mesCurto(mesHoje())}</small><strong class="entrada">${brl.format(soma(pagasNoMes))}</strong></div>
    </div>
    <section class="bloco">
      <div class="barra-filtros">
        <div class="abas" role="group" aria-label="Mostrar">
          ${[['abertas', 'Em aberto', abertas.length], ['pagas', 'Pagas', pagas.length], ['fixas', 'Fixas mensais', fixas.length]]
            .map(([v, t, n]) => `<button type="button" data-acao="aba-contas" data-valor="${v}" aria-pressed="${aba === v}">${t}<span class="contador">${n}</span></button>`).join('')}
        </div>
      </div>
      <ul class="lista">${lista}</ul>
    </section>`;
}

// ---------- Tarefas ----------
async function telaTarefas() {
  const itens = await api('/api/tarefas');
  estado.dados.tarefas = itens;
  const pendentes = itens.filter((t) => !t.concluida);
  const feitas = itens.filter((t) => t.concluida);
  const aba = estado.abaTarefas;
  const mostrar = aba === 'pendentes' ? pendentes : feitas;
  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Pessoa física</p><h1>Tarefas</h1></div>
      <div class="acoes">${botaoNovo('nova-tarefa', 'Nova tarefa', 'pf.tarefas.editar')}</div>
    </header>
    <section class="bloco">
      <div class="barra-filtros">
        <div class="abas" role="group" aria-label="Mostrar">
          ${[['pendentes', 'Pendentes', pendentes.length], ['concluidas', 'Concluídas', feitas.length]]
            .map(([v, t, n]) => `<button type="button" data-acao="aba-tarefas" data-valor="${v}" aria-pressed="${aba === v}">${t}<span class="contador">${n}</span></button>`).join('')}
        </div>
      </div>
      <ul class="lista">${
        mostrar.length ? mostrar.map((t) => itemTarefa(t)).join('')
        : aba === 'pendentes'
        ? vazio('Nenhuma tarefa pendente', 'Anote o que precisa resolver e defina um prazo.', pode('pf.tarefas.editar') ? `<div>${botaoNovo('nova-tarefa', 'Nova tarefa')}</div>` : '')
        : vazio('Nenhuma tarefa concluída', 'Marque uma tarefa como feita e ela aparece aqui.')
      }</ul>
    </section>`;
}

// ---------- Meus dados ----------
async function telaMeusDados() {
  const p = await api(`/api/pessoas/${estado.eu.pessoa_id}`);
  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Pessoa física</p><h1>Meus dados</h1></div>
      <div class="acoes"><button type="button" class="btn btn-leve" data-acao="minha-senha">Trocar minha senha</button></div>
    </header>
    ${fichaPessoa(p, { meus: true })}
    ${secaoContasBancarias(p, true)}`;
}

// ---------- Formulários ----------
function formLancamento(t) {
  const novo = !t;
  return abrirModal({
    titulo: novo ? 'Novo lançamento' : 'Editar lançamento',
    botao: novo ? 'Adicionar lançamento' : 'Salvar alterações',
    valores: t || { tipo: 'despesa', data: estado.mes === mesHoje() ? hoje() : `${estado.mes}-01` },
    campos: [
      { nome: 'tipo', rotulo: 'Tipo', tipo: 'segmentado', opcoes: [['despesa', 'Despesa'], ['receita', 'Receita']] },
      { nome: 'descricao', rotulo: 'Descrição', placeholder: 'Ex.: Supermercado', obrigatorio: true },
      [
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'number', passo: '0.01', min: 0, placeholder: '0,00', obrigatorio: true },
        { nome: 'data', rotulo: 'Data', tipo: 'date', obrigatorio: true },
      ],
      { nome: 'categoria', rotulo: 'Categoria', placeholder: 'Ex.: Alimentação', lista: estado.dados.categorias },
    ],
    enviar: (d) => (novo ? api('/api/transacoes', { method: 'POST', body: d }) : api(`/api/transacoes/${t.id}`, { method: 'PUT', body: d })),
  });
}

function formConta(c) {
  const novo = !c;
  return abrirModal({
    titulo: novo ? 'Nova conta' : 'Editar conta',
    botao: novo ? 'Adicionar conta' : 'Salvar alterações',
    valores: c || {},
    mensagem: c && c.paga ? 'Esta conta já foi paga. O lançamento em Finanças também será atualizado.' : '',
    campos: [
      { nome: 'descricao', rotulo: 'Conta', placeholder: 'Ex.: Conta de luz', obrigatorio: true },
      [
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'number', passo: '0.01', min: 0, placeholder: '0,00', obrigatorio: true },
        { nome: 'vencimento', rotulo: 'Vencimento', tipo: 'date', obrigatorio: true },
      ],
    ],
    enviar: (d) => (novo ? api('/api/contas', { method: 'POST', body: d }) : api(`/api/contas/${c.id}`, { method: 'PUT', body: d })),
  });
}

function formFixa(f) {
  const novo = !f;
  return abrirModal({
    titulo: novo ? 'Nova conta fixa' : 'Editar conta fixa',
    botao: novo ? 'Adicionar conta fixa' : 'Salvar alterações',
    valores: f || { dia: 10 },
    mensagem: novo
      ? 'Ela será criada automaticamente em Contas todo mês. Se o dia de vencimento deste mês já passou, começa no mês que vem.'
      : 'As alterações valem para os próximos meses. Contas já criadas não mudam.',
    campos: [
      { nome: 'descricao', rotulo: 'Conta', placeholder: 'Ex.: Internet', obrigatorio: true },
      [
        { nome: 'valor', rotulo: 'Valor (R$)', tipo: 'number', passo: '0.01', min: 0, placeholder: '0,00', obrigatorio: true },
        { nome: 'dia', rotulo: 'Dia do vencimento', tipo: 'number', min: 1, max: 31, passo: '1', obrigatorio: true, ajuda: 'Em meses mais curtos, vence no último dia.' },
      ],
    ],
    enviar: (d) => novo ? api('/api/contas-fixas', { method: 'POST', body: d }) : api(`/api/contas-fixas/${f.id}`, { method: 'PUT', body: { ...d, ativa: f.ativa } }),
  });
}

function formTarefa(t) {
  const novo = !t;
  return abrirModal({
    titulo: novo ? 'Nova tarefa' : 'Editar tarefa',
    botao: novo ? 'Adicionar tarefa' : 'Salvar alterações',
    valores: t || { prioridade: 'media' },
    campos: [
      { nome: 'titulo', rotulo: 'Tarefa', placeholder: 'Ex.: Renovar a CNH', obrigatorio: true },
      [
        { nome: 'prazo', rotulo: 'Prazo', tipo: 'date', ajuda: 'Opcional' },
        { nome: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: [['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']] },
      ],
    ],
    enviar: (d) => novo ? api('/api/tarefas', { method: 'POST', body: d }) : api(`/api/tarefas/${t.id}`, { method: 'PUT', body: { ...d, concluida: t.concluida } }),
  });
}

// ---------- Ações ----------
const achar = (lista, id) => estado.dados[lista].find((x) => String(x.id) === String(id));

Object.assign(acoes, {
  'mudar-mes': (el) => { estado.mes = somarMeses(estado.mes, Number(el.dataset.delta)); },
  'filtro-tipo': (el) => { estado.filtro.tipo = el.dataset.valor; },
  'aba-contas': (el) => { estado.abaContas = el.dataset.valor; },
  'aba-tarefas': (el) => { estado.abaTarefas = el.dataset.valor; },
  'minha-senha': async () => {
    if (await trocarSenha(false)) toast('Senha alterada');
    return false;
  },

  'novo-lancamento': async () => {
    if (!estado.dados.categorias.length) estado.dados.categorias = await api('/api/categorias');
    if (!(await formLancamento())) return false;
    toast('Lançamento adicionado');
  },
  'editar-lancamento': async (el) => {
    if (!(await formLancamento(achar('transacoes', el.dataset.id)))) return false;
    toast('Lançamento atualizado');
  },
  'excluir-lancamento': async (el) => {
    const t = achar('transacoes', el.dataset.id);
    const extra = t.conta_id ? ' A conta ligada a ele volta a ficar em aberto.' : '';
    if (!(await confirmar('Excluir lançamento?', `"${esc(t.descricao)}" de ${brl.format(t.valor)} será removido.${extra}`))) return false;
    await api(`/api/transacoes/${t.id}`, { method: 'DELETE' });
    toast('Lançamento excluído');
  },

  'nova-conta': async () => {
    if (!(await formConta())) return false;
    estado.abaContas = 'abertas';
    toast('Conta adicionada');
  },
  'editar-conta': async (el) => {
    if (!(await formConta(achar('contas', el.dataset.id)))) return false;
    toast('Conta atualizada');
  },
  'excluir-conta': async (el) => {
    const c = achar('contas', el.dataset.id);
    const extra = c.paga ? ' O lançamento do pagamento continua em Finanças.' : '';
    if (!(await confirmar('Excluir conta?', `"${esc(c.descricao)}" será removida.${extra}`))) return false;
    await api(`/api/contas/${c.id}`, { method: 'DELETE' });
    toast('Conta excluída');
  },
  'pagar-conta': async (el) => {
    const c = achar('contas', el.dataset.id);
    const ok = await abrirModal({
      titulo: `Pagar ${c.descricao}`,
      mensagem: `A despesa de <strong>${brl.format(c.valor)}</strong> vai entrar em Finanças, na categoria Contas.`,
      botao: 'Confirmar pagamento',
      valores: { data: hoje() },
      campos: [{ nome: 'data', rotulo: 'Data do pagamento', tipo: 'date', obrigatorio: true }],
      enviar: (d) => api(`/api/contas/${c.id}/pagar`, { method: 'POST', body: d }),
    });
    if (!ok) return false;
    toast(`${c.descricao} paga`, {
      acao: { texto: 'Desfazer', fn: async () => { await api(`/api/contas/${c.id}/desfazer`, { method: 'POST' }); toast('Pagamento desfeito'); render(); } },
    });
  },
  'desfazer-conta': async (el) => {
    const c = achar('contas', el.dataset.id);
    if (!(await confirmar('Desfazer pagamento?', `A conta volta para Em aberto e o lançamento de ${brl.format(c.valor)} sai de Finanças.`, 'Desfazer pagamento'))) return false;
    await api(`/api/contas/${c.id}/desfazer`, { method: 'POST' });
    toast('Pagamento desfeito');
  },

  'nova-fixa': async () => {
    if (!(await formFixa())) return false;
    estado.abaContas = 'fixas';
    toast('Conta fixa adicionada');
  },
  'editar-fixa': async (el) => {
    if (!(await formFixa(achar('fixas', el.dataset.id)))) return false;
    toast('Conta fixa atualizada');
  },
  'excluir-fixa': async (el) => {
    const f = achar('fixas', el.dataset.id);
    if (!(await confirmar('Excluir conta fixa?', `"${esc(f.descricao)}" deixará de ser criada todo mês. As contas já criadas continuam na lista.`))) return false;
    await api(`/api/contas-fixas/${f.id}`, { method: 'DELETE' });
    toast('Conta fixa excluída');
  },
  'pausar-fixa': async (el) => {
    const f = achar('fixas', el.dataset.id);
    await api(`/api/contas-fixas/${f.id}`, { method: 'PUT', body: { ...f, ativa: !f.ativa } });
    toast(f.ativa ? `${f.descricao} pausada` : `${f.descricao} retomada`);
  },

  'nova-tarefa': async () => {
    if (!(await formTarefa())) return false;
    estado.abaTarefas = 'pendentes';
    toast('Tarefa adicionada');
  },
  'editar-tarefa': async (el) => {
    if (!(await formTarefa(achar('tarefas', el.dataset.id)))) return false;
    toast('Tarefa atualizada');
  },
  'excluir-tarefa': async (el) => {
    const t = achar('tarefas', el.dataset.id);
    if (!(await confirmar('Excluir tarefa?', `"${esc(t.titulo)}" será removida.`))) return false;
    await api(`/api/tarefas/${t.id}`, { method: 'DELETE' });
    toast('Tarefa excluída');
  },
});

// Concluir tarefa e filtros que reagem a "change" e "input"
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.dataset.acao === 'concluir') {
    const id = el.dataset.id;
    const concluida = el.checked;
    try {
      await api(`/api/tarefas/${id}`, { method: 'PATCH', body: { concluida } });
      await render();
      toast(concluida ? 'Tarefa concluída' : 'Tarefa reaberta', {
        acao: { texto: 'Desfazer', fn: async () => { await api(`/api/tarefas/${id}`, { method: 'PATCH', body: { concluida: !concluida } }); render(); } },
      });
    } catch (e) {
      el.checked = !concluida;
      toast(e.message, { erro: true });
    }
  } else if (el.id === 'filtro-categoria') {
    estado.filtro.categoria = el.value;
    desenharLancamentos();
  }
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'busca') {
    estado.filtro.busca = ev.target.value;
    desenharLancamentos();
  }
});
