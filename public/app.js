/* =========================================================
   Minha Administração — telas do painel
   ========================================================= */

// ---------- Utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => new Date().toLocaleDateString('sv-SE');
const mesHoje = () => hoje().slice(0, 7);
const paraData = (s) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d || 1);
};
const dataBR = (s) => (s ? s.split('-').reverse().join('/') : '');
const maiuscula = (s) => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
const nomeMes = (mes) => paraData(mes).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
const mesCurto = (mes) => paraData(mes).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
const somarMeses = (mes, n) => {
  const d = paraData(mes);
  d.setMonth(d.getMonth() + n);
  return d.toLocaleDateString('sv-SE').slice(0, 7);
};
const somarDias = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const soma = (lista, f = (x) => x.valor) => lista.reduce((t, x) => t + f(x), 0);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const ICONE = {
  editar: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  excluir: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  mais: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  baixar: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  anterior: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  proximo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
};

// ---------- Estado ----------
const estado = {
  mes: mesHoje(),
  filtro: { tipo: 'todos', categoria: '', busca: '' },
  abaContas: 'abertas',
  abaTarefas: 'pendentes',
  dados: { transacoes: [], contas: [], fixas: [], tarefas: [], categorias: [] },
};

// ---------- API ----------
async function api(url, opcoes = {}) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opcoes,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique se o painel está rodando (npm start).');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.erro || 'Não foi possível concluir a ação');
  return json;
}

// ---------- Avisos ----------
function toast(msg, { erro = false, acao } = {}) {
  const el = $('#toast');
  el.className = 'toast' + (erro ? ' erro' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (acao) {
    const b = document.createElement('button');
    b.textContent = acao.texto;
    b.onclick = async () => {
      el.hidden = true;
      await acao.fn();
    };
    el.appendChild(b);
  }
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), acao ? 6000 : 3500);
}

// ---------- Modal ----------
function htmlCampo(c, v) {
  const valor = v ?? c.padrao ?? '';
  const id = `campo-${c.nome}`;
  if (c.tipo === 'segmentado') {
    return `<div class="campo"><span class="sr" id="${id}">${esc(c.rotulo)}</span>
      <div class="segmentado" role="radiogroup" aria-labelledby="${id}">
        ${c.opcoes
          .map(
            ([val, txt]) =>
              `<label><input type="radio" name="${c.nome}" value="${val}" ${val === valor ? 'checked' : ''} /><span>${esc(txt)}</span></label>`
          )
          .join('')}
      </div></div>`;
  }
  let input;
  if (c.tipo === 'select') {
    input = `<select id="${id}" name="${c.nome}">${c.opcoes
      .map(([val, txt]) => `<option value="${val}" ${val === valor ? 'selected' : ''}>${esc(txt)}</option>`)
      .join('')}</select>`;
  } else {
    const extras = [
      c.obrigatorio ? 'required' : '',
      c.min != null ? `min="${c.min}"` : '',
      c.max != null ? `max="${c.max}"` : '',
      c.passo ? `step="${c.passo}"` : '',
      c.lista ? `list="${id}-lista"` : '',
      c.placeholder ? `placeholder="${esc(c.placeholder)}"` : '',
      c.tipo === 'number' ? 'inputmode="decimal"' : '',
      'autocomplete="off"',
    ].join(' ');
    input = `<input id="${id}" name="${c.nome}" type="${c.tipo || 'text'}" value="${esc(valor)}" ${extras} />`;
    if (c.lista) input += `<datalist id="${id}-lista">${c.lista.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
  }
  return `<div class="campo"><label for="${id}">${esc(c.rotulo)}</label>${input}${
    c.ajuda ? `<span class="ajuda">${esc(c.ajuda)}</span>` : ''
  }</div>`;
}

// Abre o modal. Com "campos" vira formulário; sem campos, vira confirmação.
function abrirModal({ titulo, campos = [], valores = {}, mensagem = '', botao = 'Salvar', perigo = false, enviar }) {
  const modal = $('#modal');
  const form = $('#modal-form');
  const erroEl = $('#modal-erro');
  const ok = $('#modal-ok');
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML =
    (mensagem ? `<p>${mensagem}</p>` : '') +
    campos
      .map((c) =>
        Array.isArray(c)
          ? `<div class="linha-campos">${c.map((x) => htmlCampo(x, valores[x.nome])).join('')}</div>`
          : htmlCampo(c, valores[c.nome])
      )
      .join('');
  erroEl.hidden = true;
  ok.textContent = botao;
  ok.className = 'btn ' + (perigo ? 'btn-perigo' : 'btn-principal');

  return new Promise((resolve) => {
    const fechar = (r) => {
      form.onsubmit = null;
      $('#modal-cancelar').onclick = null;
      modal.onclose = null;
      if (modal.open) modal.close();
      resolve(r);
    };
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const dados = Object.fromEntries(new FormData(form));
      ok.disabled = true;
      try {
        const r = enviar ? await enviar(dados) : true;
        fechar(r ?? true);
      } catch (e) {
        erroEl.textContent = e.message;
        erroEl.hidden = false;
      } finally {
        ok.disabled = false;
      }
    };
    $('#modal-cancelar').onclick = () => fechar(false);
    modal.onclose = () => fechar(false);
    modal.showModal();
    const primeiro = $('#modal-corpo input:not([type=radio]), #modal-corpo select', modal);
    (primeiro || ok).focus();
  });
}

const confirmar = (titulo, mensagem, botao = 'Excluir') =>
  abrirModal({ titulo, mensagem, botao, perigo: true });

// ---------- Pedaços de interface ----------
const seletorMes = () => `
  <div class="seletor-mes">
    <button type="button" data-acao="mudar-mes" data-delta="-1" aria-label="Mês anterior">${ICONE.anterior}</button>
    <span aria-live="polite">${maiuscula(nomeMes(estado.mes))}</span>
    <button type="button" data-acao="mudar-mes" data-delta="1" aria-label="Próximo mês">${ICONE.proximo}</button>
  </div>`;

const blocoDia = (data, classe = '') => {
  const d = paraData(data);
  return `<div class="dia ${classe}"><b>${d.getDate()}</b><small>${d
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace('.', '')}</small></div>`;
};

const botoesEditarExcluir = (tipo, id) => `
  <button type="button" class="icone-btn" data-acao="editar-${tipo}" data-id="${id}" aria-label="Editar">${ICONE.editar}</button>
  <button type="button" class="icone-btn excluir" data-acao="excluir-${tipo}" data-id="${id}" aria-label="Excluir">${ICONE.excluir}</button>`;

const vazio = (titulo, texto, botao) =>
  `<li class="vazio"><strong>${titulo}</strong>${texto}${botao || ''}</li>`;

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
  const acoes = c.paga
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
    <div class="item-acoes">${acoes}${compacto ? '' : botoesEditarExcluir('conta', c.id)}</div>
  </li>`;
}

function itemTarefa(t, compacto = false) {
  const p = textoPrazo(t);
  return `<li class="item ${t.concluida ? 'feita' : ''}">
    <input type="checkbox" class="marcar" data-acao="concluir" data-id="${t.id}" ${t.concluida ? 'checked' : ''}
      aria-label="${t.concluida ? 'Reabrir' : 'Concluir'} ${esc(t.titulo)}" />
    <div class="item-principal">
      <div class="item-titulo">${esc(t.titulo)}</div>
      <div class="item-sub"><span class="${p.atrasada ? 'saida' : ''}">${p.texto}</span></div>
    </div>
    <div>${t.prioridade !== 'media' || !compacto ? `<span class="selo ${t.prioridade}">${nomePrioridade[t.prioridade]}</span>` : ''}</div>
    <div class="item-acoes">${compacto ? '' : botoesEditarExcluir('tarefa', t.id)}</div>
  </li>`;
}

function graficoHistorico(historico) {
  const L = 560, A = 196, base = 166, alt = 150;
  const max = Math.max(1, ...historico.flatMap((h) => [h.receitas, h.despesas]));
  const grupo = L / historico.length;
  const bw = Math.min(24, grupo / 3.2);
  const barras = historico
    .map((h, i) => {
      const cx = grupo * i + grupo / 2;
      const hr = (h.receitas / max) * alt;
      const hd = (h.despesas / max) * alt;
      const ativo = h.mes === estado.mes;
      return `<g>
        <title>${nomeMes(h.mes)}: receitas ${brl.format(h.receitas)}, despesas ${brl.format(h.despesas)}</title>
        <rect class="barra-entrada" x="${cx - bw - 2}" y="${base - hr}" width="${bw}" height="${Math.max(hr, 1.5)}" rx="4"/>
        <rect class="barra-saida" x="${cx + 2}" y="${base - hd}" width="${bw}" height="${Math.max(hd, 1.5)}" rx="4"/>
        <text class="eixo ${ativo ? 'ativo' : ''}" x="${cx}" y="${A - 8}" text-anchor="middle">${mesCurto(h.mes)}</text>
      </g>`;
    })
    .join('');
  return `<div class="grafico">
    <div class="legenda"><span><i style="background:var(--entrada)"></i>Receitas</span><span><i style="background:var(--saida)"></i>Despesas</span></div>
    <svg viewBox="0 0 ${L} ${A}" role="img" aria-label="Receitas e despesas dos últimos 6 meses">
      <line class="base" x1="0" x2="${L}" y1="${base + 0.5}" y2="${base + 0.5}"/>
      ${barras}
    </svg></div>`;
}

function valorGrande(v) {
  const txt = brl.format(v);
  const i = txt.lastIndexOf(',');
  return `${esc(txt.slice(0, i))}<span class="centavos">${esc(txt.slice(i))}</span>`;
}

// =========================================================
// Telas
// =========================================================
const tela = () => $('#tela');

async function telaInicio() {
  const r = await api(`/api/resumo?mes=${estado.mes}`);
  estado.dados.contas = r.proximasContas;
  estado.dados.tarefas = r.proximasTarefas;
  const maxCat = Math.max(1, ...r.porCategoria.map((c) => c.total));

  tela().innerHTML = `
    <header class="cabecalho">
      <h1>Visão geral</h1>
      <div class="acoes">
        ${seletorMes()}
        <button type="button" class="btn btn-principal" data-acao="novo-lancamento">${ICONE.mais}Novo lançamento</button>
      </div>
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

    ${
      r.contas.vencidas
        ? `<div class="aviso-faixa" role="alert">Você tem ${plural(r.contas.vencidas, 'conta vencida', 'contas vencidas')}.
           <a href="#/contas">Ver contas</a></div>`
        : ''
    }

    <div class="duas-colunas">
      <section class="bloco">
        <div class="bloco-titulo"><h2>Próximos vencimentos</h2><a href="#/contas">Todas as contas</a></div>
        <ul class="lista">${
          r.proximasContas.length
            ? r.proximasContas.map((c) => itemConta(c, true)).join('')
            : vazio('Nenhuma conta em aberto', 'Tudo pago por aqui.')
        }</ul>
      </section>
      <section class="bloco">
        <div class="bloco-titulo"><h2>Tarefas pendentes</h2><a href="#/tarefas">Todas as tarefas</a></div>
        <ul class="lista">${
          r.proximasTarefas.length
            ? r.proximasTarefas.map((t) => itemTarefa(t, true)).join('')
            : vazio('Nenhuma tarefa pendente', 'Crie uma tarefa para não esquecer de nada.')
        }</ul>
      </section>
    </div>

    <section class="bloco" style="margin-top:20px">
      <div class="bloco-titulo"><h2>Para onde foi o dinheiro em ${mesCurto(r.mes)}</h2><a href="#/financas">Ver lançamentos</a></div>
      ${
        r.porCategoria.length
          ? `<div class="categorias">${r.porCategoria
              .map(
                (c) => `<div class="categoria"><span>${esc(c.categoria)}</span>
                  <div class="trilho"><div class="cheio" style="width:${(c.total / maxCat) * 100}%"></div></div>
                  <span class="num">${brl.format(c.total)}</span></div>`
              )
              .join('')}</div>`
          : '<p class="vazio">Nenhuma despesa lançada neste mês.</p>'
      }
    </section>`;
}

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
      <h1>Finanças</h1>
      <div class="acoes">
        ${seletorMes()}
        <a class="btn btn-leve" href="/api/exportar?mes=${estado.mes}" download>${ICONE.baixar}Exportar para Excel</a>
        <button type="button" class="btn btn-principal" data-acao="novo-lancamento">${ICONE.mais}Novo lançamento</button>
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
            .map(([v, t]) => `<button type="button" data-acao="filtro-tipo" data-valor="${v}" aria-pressed="${f.tipo === v}">${t}</button>`)
            .join('')}
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
    (t) =>
      (f.tipo === 'todos' || t.tipo === f.tipo) &&
      (!f.categoria || t.categoria === f.categoria) &&
      (!busca || t.descricao.toLocaleLowerCase('pt-BR').includes(busca))
  );
  const ul = $('#lista-lancamentos');
  if (!todos.length) {
    ul.innerHTML = vazio(
      `Nenhum lançamento em ${nomeMes(estado.mes)}`,
      'Registre receitas e despesas para acompanhar seu saldo.',
      `<div><button type="button" class="btn btn-principal" data-acao="novo-lancamento">${ICONE.mais}Novo lançamento</button></div>`
    );
    return;
  }
  if (!itens.length) {
    ul.innerHTML = vazio('Nada encontrado', 'Mude os filtros ou a busca para ver outros lançamentos.');
    return;
  }
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
        <div class="item-acoes">${botoesEditarExcluir('lancamento', t.id)}</div>
      </li>`;
    })
    .join('');
}

async function telaContas() {
  const [contas, fixas] = await Promise.all([api('/api/contas'), api('/api/contas-fixas')]);
  estado.dados.contas = contas;
  estado.dados.fixas = fixas;
  const abertas = contas.filter((c) => !c.paga);
  const pagas = contas.filter((c) => c.paga).sort((a, b) => (b.pago_em || '').localeCompare(a.pago_em || ''));
  const vencidas = abertas.filter((c) => c.vencimento < hoje());
  const pagasNoMes = pagas.filter((c) => (c.pago_em || '').startsWith(mesHoje()));
  const aba = estado.abaContas;

  let lista;
  if (aba === 'abertas') {
    lista = abertas.length
      ? abertas.map((c) => itemConta(c)).join('')
      : vazio('Nenhuma conta em aberto', 'Cadastre as contas do mês para receber os alertas de vencimento.',
          `<div><button type="button" class="btn btn-principal" data-acao="nova-conta">${ICONE.mais}Nova conta</button></div>`);
  } else if (aba === 'pagas') {
    lista = pagas.length ? pagas.map((c) => itemConta(c)).join('') : vazio('Nenhuma conta paga ainda', 'As contas que você pagar aparecem aqui.');
  } else {
    lista = fixas.length
      ? fixas
          .map(
            (f) => `<li class="item">
              <div class="dia"><b>${f.dia}</b><small>dia</small></div>
              <div class="item-principal">
                <div class="item-titulo">${esc(f.descricao)}</div>
                <div class="item-sub"><span>Todo dia ${f.dia}</span>${f.ativa ? '' : '<span class="selo">Pausada</span>'}</div>
              </div>
              <div class="item-valor">${brl.format(f.valor)}</div>
              <div class="item-acoes">
                <button type="button" class="btn btn-leve btn-mini" data-acao="pausar-fixa" data-id="${f.id}">${f.ativa ? 'Pausar' : 'Retomar'}</button>
                ${botoesEditarExcluir('fixa', f.id)}
              </div>
            </li>`
          )
          .join('')
      : vazio('Nenhuma conta fixa', 'Luz, internet, aluguel: cadastre uma vez e ela aparece todo mês em Contas.',
          `<div><button type="button" class="btn btn-principal" data-acao="nova-fixa">${ICONE.mais}Nova conta fixa</button></div>`);
  }

  tela().innerHTML = `
    <header class="cabecalho">
      <h1>Contas</h1>
      <div class="acoes">
        <button type="button" class="btn btn-leve" data-acao="nova-fixa">Nova conta fixa</button>
        <button type="button" class="btn btn-principal" data-acao="nova-conta">${ICONE.mais}Nova conta</button>
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
            .map(([v, t, n]) => `<button type="button" data-acao="aba-contas" data-valor="${v}" aria-pressed="${aba === v}">${t}<span class="contador">${n}</span></button>`)
            .join('')}
        </div>
      </div>
      <ul class="lista">${lista}</ul>
    </section>`;
}

async function telaTarefas() {
  const itens = await api('/api/tarefas');
  estado.dados.tarefas = itens;
  const pendentes = itens.filter((t) => !t.concluida);
  const feitas = itens.filter((t) => t.concluida);
  const aba = estado.abaTarefas;
  const mostrar = aba === 'pendentes' ? pendentes : feitas;

  tela().innerHTML = `
    <header class="cabecalho">
      <h1>Tarefas</h1>
      <div class="acoes"><button type="button" class="btn btn-principal" data-acao="nova-tarefa">${ICONE.mais}Nova tarefa</button></div>
    </header>
    <section class="bloco">
      <div class="barra-filtros">
        <div class="abas" role="group" aria-label="Mostrar">
          ${[['pendentes', 'Pendentes', pendentes.length], ['concluidas', 'Concluídas', feitas.length]]
            .map(([v, t, n]) => `<button type="button" data-acao="aba-tarefas" data-valor="${v}" aria-pressed="${aba === v}">${t}<span class="contador">${n}</span></button>`)
            .join('')}
        </div>
      </div>
      <ul class="lista">${
        mostrar.length
          ? mostrar.map((t) => itemTarefa(t)).join('')
          : aba === 'pendentes'
          ? vazio('Nenhuma tarefa pendente', 'Anote o que precisa resolver e defina um prazo.',
              `<div><button type="button" class="btn btn-principal" data-acao="nova-tarefa">${ICONE.mais}Nova tarefa</button></div>`)
          : vazio('Nenhuma tarefa concluída', 'Marque uma tarefa como feita e ela aparece aqui.')
      }</ul>
    </section>`;
}

// =========================================================
// Formulários
// =========================================================
function formLancamento(t) {
  const novo = !t;
  const dataPadrao = estado.mes === mesHoje() ? hoje() : `${estado.mes}-01`;
  return abrirModal({
    titulo: novo ? 'Novo lançamento' : 'Editar lançamento',
    botao: novo ? 'Adicionar lançamento' : 'Salvar alterações',
    valores: t || { tipo: 'despesa', data: dataPadrao },
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
        { nome: 'dia', rotulo: 'Dia do vencimento', tipo: 'number', min: 1, max: 31, passo: '1', obrigatorio: true,
          ajuda: 'Em meses mais curtos, vence no último dia.' },
      ],
    ],
    enviar: (d) =>
      novo
        ? api('/api/contas-fixas', { method: 'POST', body: d })
        : api(`/api/contas-fixas/${f.id}`, { method: 'PUT', body: { ...d, ativa: f.ativa } }),
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
    enviar: (d) =>
      novo
        ? api('/api/tarefas', { method: 'POST', body: d })
        : api(`/api/tarefas/${t.id}`, { method: 'PUT', body: { ...d, concluida: t.concluida } }),
  });
}

// =========================================================
// Ações (cliques)
// =========================================================
const achar = (lista, id) => estado.dados[lista].find((x) => String(x.id) === String(id));

const acoes = {
  'mudar-mes': (el) => { estado.mes = somarMeses(estado.mes, Number(el.dataset.delta)); },
  'filtro-tipo': (el) => { estado.filtro.tipo = el.dataset.valor; },
  'aba-contas': (el) => { estado.abaContas = el.dataset.valor; },
  'aba-tarefas': (el) => { estado.abaTarefas = el.dataset.valor; },

  'novo-lancamento': async () => {
    if (!estado.dados.categorias.length) estado.dados.categorias = await api('/api/categorias');
    if (await formLancamento()) toast('Lançamento adicionado');
    else return false;
  },
  'editar-lancamento': async (el) => {
    if (await formLancamento(achar('transacoes', el.dataset.id))) toast('Lançamento atualizado');
    else return false;
  },
  'excluir-lancamento': async (el) => {
    const t = achar('transacoes', el.dataset.id);
    const extra = t.conta_id ? ' A conta ligada a ele volta a ficar em aberto.' : '';
    if (!(await confirmar('Excluir lançamento?', `"${esc(t.descricao)}" de ${brl.format(t.valor)} será removido.${extra}`))) return false;
    await api(`/api/transacoes/${t.id}`, { method: 'DELETE' });
    toast('Lançamento excluído');
  },

  'nova-conta': async () => {
    if (await formConta()) { estado.abaContas = 'abertas'; toast('Conta adicionada'); }
    else return false;
  },
  'editar-conta': async (el) => {
    if (await formConta(achar('contas', el.dataset.id))) toast('Conta atualizada');
    else return false;
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
      acao: {
        texto: 'Desfazer',
        fn: async () => {
          await api(`/api/contas/${c.id}/desfazer`, { method: 'POST' });
          toast('Pagamento desfeito');
          render();
        },
      },
    });
  },
  'desfazer-conta': async (el) => {
    const c = achar('contas', el.dataset.id);
    if (!(await confirmar('Desfazer pagamento?', `A conta volta para Em aberto e o lançamento de ${brl.format(c.valor)} sai de Finanças.`, 'Desfazer pagamento'))) return false;
    await api(`/api/contas/${c.id}/desfazer`, { method: 'POST' });
    toast('Pagamento desfeito');
  },

  'nova-fixa': async () => {
    if (await formFixa()) { estado.abaContas = 'fixas'; toast('Conta fixa adicionada'); }
    else return false;
  },
  'editar-fixa': async (el) => {
    if (await formFixa(achar('fixas', el.dataset.id))) toast('Conta fixa atualizada');
    else return false;
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
    if (await formTarefa()) { estado.abaTarefas = 'pendentes'; toast('Tarefa adicionada'); }
    else return false;
  },
  'editar-tarefa': async (el) => {
    if (await formTarefa(achar('tarefas', el.dataset.id))) toast('Tarefa atualizada');
    else return false;
  },
  'excluir-tarefa': async (el) => {
    const t = achar('tarefas', el.dataset.id);
    if (!(await confirmar('Excluir tarefa?', `"${esc(t.titulo)}" será removida.`))) return false;
    await api(`/api/tarefas/${t.id}`, { method: 'DELETE' });
    toast('Tarefa excluída');
  },
};

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('button[data-acao]');
  if (!el || !acoes[el.dataset.acao]) return;
  try {
    const r = await acoes[el.dataset.acao](el);
    if (r !== false) await render();
  } catch (e) {
    toast(e.message, { erro: true });
  }
});

// Concluir / reabrir tarefa
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.dataset.acao === 'concluir') {
    const id = el.dataset.id;
    const concluida = el.checked;
    try {
      await api(`/api/tarefas/${id}`, { method: 'PATCH', body: { concluida } });
      await render();
      toast(concluida ? 'Tarefa concluída' : 'Tarefa reaberta', {
        acao: {
          texto: 'Desfazer',
          fn: async () => {
            await api(`/api/tarefas/${id}`, { method: 'PATCH', body: { concluida: !concluida } });
            render();
          },
        },
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

// =========================================================
// Navegação
// =========================================================
const rotas = { inicio: telaInicio, financas: telaFinancas, contas: telaContas, tarefas: telaTarefas };
const titulos = { inicio: 'Visão geral', financas: 'Finanças', contas: 'Contas', tarefas: 'Tarefas' };
let rotaAnterior = '';

async function render() {
  const rota = rotas[location.hash.replace('#/', '')] ? location.hash.replace('#/', '') : 'inicio';
  document.querySelectorAll('.menu nav a').forEach((a) => {
    if (a.dataset.rota === rota) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${titulos[rota]} | Minha Administração`;
  try {
    await rotas[rota]();
  } catch (e) {
    tela().innerHTML = `<div class="bloco vazio"><strong>Não foi possível carregar esta tela</strong>${esc(e.message)}</div>`;
  }
  if (rota !== rotaAnterior) {
    rotaAnterior = rota;
    window.scrollTo(0, 0);
  }
}

window.addEventListener('hashchange', render);
render();
