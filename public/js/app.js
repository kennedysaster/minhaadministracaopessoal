/* =========================================================
   Menu, navegação e inicialização
   ========================================================= */

const IC = {
  inicio: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  financas: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14.5h2"/>',
  contas: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  tarefas: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  dados: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  empresas: '<path d="M4 20V6l8-3v17M12 9h8v11M7 9h2M7 13h2M15 13h2M15 16h2"/>',
  lancamentos: '<path d="M4 7h16M4 12h10M4 17h7"/><path d="M17 14v6M14 17h6"/>',
  faturamento: '<path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z"/><path d="M12 7v8M14 8.5c-.5-.6-1.2-1-2-1-1.1 0-2 .7-2 1.6 0 2 4 1.2 4 3.2 0 .9-.9 1.7-2 1.7-.9 0-1.7-.4-2.1-1"/>',
  links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M3 19c1-3.5 3.3-5 6-5s5 1.5 6 5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c1.6.6 2.6 2.2 3 5"/>',
  usuarios: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2"/>',
};

const MENU = [
  { grupo: 'Pessoa física', itens: [
    { rota: 'inicio', rotulo: 'Visão geral', perm: 'pf.visao', icone: 'inicio' },
    { rota: 'financas', rotulo: 'Finanças', perm: 'pf.financas', icone: 'financas' },
    { rota: 'contas', rotulo: 'Contas', perm: 'pf.contas', icone: 'contas' },
    { rota: 'tarefas', rotulo: 'Tarefas', perm: 'pf.tarefas', icone: 'tarefas' },
    { rota: 'meus-dados', rotulo: 'Meus dados', perm: 'pf.meus_dados', icone: 'dados' },
  ] },
  { grupo: 'Pessoa jurídica', itens: [
    { rota: 'empresas', rotulo: 'Empresas', perm: 'pj.empresas', icone: 'empresas' },
    { rota: 'empresa-lancamentos', rotulo: 'Despesas e receitas', perm: 'pj.lancamentos', icone: 'lancamentos' },
    { rota: 'faturamento', rotulo: 'Faturamento', perm: 'pj.faturamento', icone: 'faturamento' },
    { rota: 'links', rotulo: 'Links úteis', perm: 'pj.links', icone: 'links' },
  ] },
  { grupo: 'Cadastros', itens: [{ rota: 'pessoas', rotulo: 'Pessoas', perm: 'pessoas', icone: 'pessoas' }] },
  { grupo: 'Administração', itens: [{ rota: 'usuarios', rotulo: 'Usuários', perm: 'usuarios', icone: 'usuarios' }] },
];

const ROTAS = {
  inicio: { perm: 'pf.visao', tela: telaInicio },
  financas: { perm: 'pf.financas', tela: telaFinancas },
  contas: { perm: 'pf.contas', tela: telaContas },
  tarefas: { perm: 'pf.tarefas', tela: telaTarefas },
  'meus-dados': { perm: 'pf.meus_dados', tela: telaMeusDados },
  empresas: { perm: 'pj.empresas', tela: (a) => (a[0] ? telaEmpresa(a[0]) : telaEmpresas()) },
  'empresa-lancamentos': { perm: 'pj.lancamentos', tela: telaEmpresaLancamentos },
  faturamento: { perm: 'pj.faturamento', tela: (a) => (a[0] ? telaFaturamentoForm(a[0]) : telaFaturamento()) },
  links: { perm: 'pj.links', tela: telaLinks },
  pessoas: { perm: 'pessoas', tela: (a) => (a[0] ? telaPessoa(a[0]) : telaPessoas()) },
  usuarios: { perm: 'usuarios', tela: (a) => (a[0] ? telaUsuario(a[0]) : telaUsuarios()) },
};

const itensPermitidos = () => MENU.flatMap((g) => g.itens).filter((i) => pode(i.perm));

function desenharMenu() {
  const nav = $('#menu-nav');
  nav.innerHTML = MENU.map((g) => {
    const itens = g.itens.filter((i) => pode(i.perm));
    if (!itens.length) return '';
    return `<div class="menu-grupo"><p class="menu-grupo-nome">${g.grupo}</p>${itens
      .map((i) => `<a href="#/${i.rota}" data-rota="${i.rota}"><svg viewBox="0 0 24 24" aria-hidden="true">${IC[i.icone]}</svg><span>${i.rotulo}</span></a>`)
      .join('')}</div>`;
  }).join('');
  desenharUsuarioMenu();
}

function desenharUsuarioMenu() {
  const u = estado.eu;
  $('#menu-usuario').innerHTML = `
    <div class="avatar pequeno" aria-hidden="true">${esc(iniciais(u.nome))}</div>
    <div class="menu-usuario-nome"><strong>${esc(u.nome.split(' ').slice(0, 2).join(' '))}</strong><small>${u.master ? 'Usuário master' : 'Usuário'}</small></div>
    <button type="button" class="icone-btn claro" data-acao="minha-senha" aria-label="Trocar minha senha" title="Trocar minha senha">
      <svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/></svg></button>
    <button type="button" class="icone-btn claro" data-acao="sair" aria-label="Sair" title="Sair">
      <svg viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/></svg></button>`;
}

let rotaAnterior = '';

async function render() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  let nome = partes[0];
  const permitidos = itensPermitidos();
  if (!ROTAS[nome] || !pode(ROTAS[nome].perm)) {
    if (!permitidos.length) {
      tela().innerHTML = `<section class="bloco vazio sem-acesso"><strong>Seu acesso ainda não foi liberado</strong>
        O usuário master precisa marcar as permissões do seu usuário. Depois disso, entre novamente.</section>`;
      return;
    }
    nome = permitidos[0].rota;
    if (location.hash !== `#/${nome}`) {
      history.replaceState(null, '', `#/${nome}`);
    }
  }
  $$('#menu-nav a').forEach((a) => (a.dataset.rota === nome ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const item = MENU.flatMap((g) => g.itens).find((i) => i.rota === nome);
  document.title = `${item?.rotulo || 'Painel'} | Minha Administração`;
  document.body.classList.remove('menu-aberto');
  try {
    await ROTAS[nome].tela(partes.slice(1));
  } catch (e) {
    tela().innerHTML = `<div class="bloco vazio"><strong>Não foi possível carregar esta tela</strong>${esc(e.message)}</div>`;
  }
  const chave = partes.join('/');
  if (chave !== rotaAnterior) {
    rotaAnterior = chave;
    window.scrollTo(0, 0);
  }
}

// Cliques em botões com data-acao
document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('button[data-acao]');
  if (!el || !acoes[el.dataset.acao]) return;
  ev.preventDefault();
  try {
    const r = await acoes[el.dataset.acao](el);
    if (r !== false) await render();
  } catch (e) {
    toast(e.message, { erro: true });
  }
});

// Envio de formulários das telas (data-form)
document.addEventListener('submit', async (ev) => {
  const form = ev.target;
  const nome = form.dataset?.form;
  if (!nome || !formularios[nome]) return;
  ev.preventDefault();
  const botoes = $$('button[type=submit]', form);
  botoes.forEach((b) => (b.disabled = true));
  try {
    const dados = Object.fromEntries(new FormData(form));
    const r = await formularios[nome](form, dados, ev);
    if (r !== false) await render();
  } catch (e) {
    toast(e.message, { erro: true });
  } finally {
    botoes.forEach((b) => (b.disabled = false));
  }
});

Object.assign(acoes, {
  sair: async () => {
    await api('/api/auth/logout', { method: 'POST' });
    location.href = '/login';
    return false;
  },
  'abrir-menu': () => {
    document.body.classList.toggle('menu-aberto');
    return false;
  },
});

window.addEventListener('hashchange', render);

(async function iniciar() {
  try {
    estado.eu = await api('/api/auth/eu');
  } catch {
    location.href = '/login';
    return;
  }
  if (estado.eu.trocar_senha) await trocarSenha(true);
  desenharMenu();
  await render();
})();
