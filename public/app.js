const $ = (s) => document.querySelector(s);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (s) => (s ? s.split('-').reverse().join('/') : '');
const hoje = () => new Date().toLocaleDateString('sv-SE');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function aviso(msg) {
  const el = $('#aviso');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (el.hidden = true), 3500);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.erro || 'Erro na requisição');
  return json;
}

const mesAtual = () => $('#mes').value;

// ---------- Resumo ----------
async function carregarResumo() {
  const r = await api(`/api/resumo?mes=${mesAtual()}`);
  $('#r-receitas').textContent = brl.format(r.receitas);
  $('#r-despesas').textContent = brl.format(r.despesas);
  const saldo = $('#r-saldo');
  saldo.textContent = brl.format(r.saldo);
  saldo.className = r.saldo >= 0 ? 'pos' : 'neg';
  $('#r-contas').textContent = brl.format(r.contas.total_aberto);
  $('#r-contas-info').textContent =
    `${r.contas.vencidas} vencida(s) · ${r.contas.proximas} nos próximos 7 dias`;
  $('#r-tarefas').textContent = r.tarefas.pendentes;
  $('#r-tarefas-info').textContent = `${r.tarefas.atrasadas} atrasada(s) · ${r.tarefas.concluidas} concluída(s)`;

  const max = Math.max(...r.porCategoria.map((c) => c.total), 1);
  $('#categorias-barras').innerHTML = r.porCategoria
    .map(
      (c) => `<div class="barra"><span>${esc(c.categoria)}</span>
        <div class="trilho"><div class="cheio" style="width:${(c.total / max) * 100}%"></div></div>
        <span>${brl.format(c.total)}</span></div>`
    )
    .join('');
}

// ---------- Finanças ----------
async function carregarTransacoes() {
  const itens = await api(`/api/transacoes?mes=${mesAtual()}`);
  $('#l-transacoes').innerHTML = itens.length
    ? itens
        .map(
          (t) => `<li>
            <div class="info">
              <div class="titulo">${esc(t.descricao)}</div>
              <div class="meta">${dataBR(t.data)} · ${esc(t.categoria)}</div>
            </div>
            <span class="valor ${t.tipo === 'receita' ? 'pos' : 'neg'}">
              ${t.tipo === 'receita' ? '+' : '−'} ${brl.format(t.valor)}</span>
            <button class="icone" title="Excluir" data-del-transacao="${t.id}">×</button>
          </li>`
        )
        .join('')
    : '<li class="vazio">Nenhum lançamento neste mês</li>';
}

// ---------- Tarefas ----------
async function carregarTarefas() {
  const itens = await api('/api/tarefas');
  const h = hoje();
  $('#l-tarefas').innerHTML = itens.length
    ? itens
        .map((t) => {
          const atrasada = !t.concluida && t.prazo && t.prazo < h;
          return `<li class="${t.concluida ? 'feita' : ''}">
            <input type="checkbox" data-toggle-tarefa="${t.id}" ${t.concluida ? 'checked' : ''} />
            <div class="info">
              <div class="titulo">${esc(t.titulo)}</div>
              <div class="meta">${t.prazo ? 'Prazo: ' + dataBR(t.prazo) : 'Sem prazo'}</div>
            </div>
            ${atrasada ? '<span class="tag atrasada">atrasada</span>' : ''}
            <span class="tag ${t.prioridade}">${t.prioridade === 'media' ? 'média' : t.prioridade}</span>
            <button class="icone" title="Excluir" data-del-tarefa="${t.id}">×</button>
          </li>`;
        })
        .join('')
    : '<li class="vazio">Nenhuma tarefa</li>';
}

// ---------- Contas ----------
async function carregarContas() {
  const itens = await api('/api/contas');
  const h = hoje();
  const em7 = new Date(Date.now() + 7 * 864e5).toLocaleDateString('sv-SE');
  $('#l-contas').innerHTML = itens.length
    ? itens
        .map((c) => {
          let tag = '';
          if (c.paga) tag = `<span class="tag paga">paga ${dataBR(c.pago_em)}</span>`;
          else if (c.vencimento < h) tag = '<span class="tag vencida">vencida</span>';
          else if (c.vencimento <= em7) tag = '<span class="tag proxima">vence logo</span>';
          return `<li>
            <div class="info">
              <div class="titulo">${esc(c.descricao)}</div>
              <div class="meta">Vence ${dataBR(c.vencimento)}</div>
            </div>
            ${tag}
            <span class="valor">${brl.format(c.valor)}</span>
            ${c.paga ? '' : `<button class="secundario" data-pagar="${c.id}">Pagar</button>`}
            <button class="icone" title="Excluir" data-del-conta="${c.id}">×</button>
          </li>`;
        })
        .join('')
    : '<li class="vazio">Nenhuma conta cadastrada</li>';
}

async function atualizarTudo() {
  try {
    await Promise.all([carregarResumo(), carregarTransacoes(), carregarTarefas(), carregarContas()]);
  } catch (e) {
    aviso(e.message);
  }
}

// ---------- Formulários ----------
function ligarForm(id, url, preparar) {
  $(id).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const dados = Object.fromEntries(new FormData(ev.target));
    try {
      await api(url, { method: 'POST', body: preparar ? preparar(dados) : dados });
      ev.target.reset();
      await atualizarTudo();
    } catch (e) {
      aviso(e.message);
    }
  });
}

ligarForm('#f-transacao', '/api/transacoes', (d) => ({ ...d, data: d.data || hoje() }));
ligarForm('#f-tarefa', '/api/tarefas', (d) => ({ ...d, prazo: d.prazo || null }));
ligarForm('#f-conta', '/api/contas');

// ---------- Ações nas listas ----------
document.addEventListener('click', async (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.delTransacao) {
      if (!confirm('Excluir este lançamento?')) return;
      await api(`/api/transacoes/${b.dataset.delTransacao}`, { method: 'DELETE' });
    } else if (b.dataset.delTarefa) {
      await api(`/api/tarefas/${b.dataset.delTarefa}`, { method: 'DELETE' });
    } else if (b.dataset.delConta) {
      if (!confirm('Excluir esta conta?')) return;
      await api(`/api/contas/${b.dataset.delConta}`, { method: 'DELETE' });
    } else if (b.dataset.pagar) {
      await api(`/api/contas/${b.dataset.pagar}/pagar`, { method: 'POST' });
    } else return;
    await atualizarTudo();
  } catch (e) {
    aviso(e.message);
  }
});

document.addEventListener('change', async (ev) => {
  const id = ev.target.dataset.toggleTarefa;
  if (!id) return;
  try {
    await api(`/api/tarefas/${id}`, { method: 'PATCH', body: { concluida: ev.target.checked } });
    await atualizarTudo();
  } catch (e) {
    aviso(e.message);
  }
});

$('#mes').value = hoje().slice(0, 7);
$('#mes').addEventListener('change', atualizarTudo);
atualizarTudo();
