/* =========================================================
   Administração: usuários e permissões
   ========================================================= */

const NOME_TIPO_PERMISSAO = { tela: 'Tela', acao: 'Ação', relatorio: 'Relatório' };

async function telaUsuarios() {
  const lista = await api('/api/usuarios');
  estado.dados.usuarios = lista;
  tela().innerHTML = `
    <header class="cabecalho">
      <div><p class="sobretitulo">Administração</p><h1>Usuários</h1></div>
      <div class="acoes">${botaoNovo('novo-usuario', 'Novo usuário', 'usuarios.editar')}</div>
    </header>
    <section class="bloco">
      <ul class="lista">${lista.map((u) => `<li><a class="item item-link" href="#/usuarios/${u.id}">
        <div class="avatar ${u.ativo ? '' : 'inativo'}" aria-hidden="true">${esc(iniciais(u.nome))}</div>
        <div class="item-principal">
          <div class="item-titulo">${esc(u.nome)}</div>
          <div class="item-sub">
            <span>CPF ${fmt.cpf(u.cpf)}</span><span>${esc(u.email || '')}</span>
            <span>${u.ultimo_acesso ? `Último acesso ${dataBR(u.ultimo_acesso)}` : 'Nunca acessou'}</span>
          </div>
        </div>
        <div class="selos">
          ${u.master ? '<span class="selo fixa">Master</span>' : `<span class="selo">${plural(u.qtd_permissoes, 'permissão', 'permissões')}</span>`}
          ${!u.ativo ? '<span class="selo vencida">Inativo</span>' : ''}
          ${u.ativo && u.trocar_senha ? '<span class="selo logo">Aguardando primeiro acesso</span>' : ''}
        </div>
        <span class="seta" aria-hidden="true">${ICONE.proximo}</span>
      </a></li>`).join('')}</ul>
    </section>`;
}

async function telaUsuario(id) {
  const [u, permissoes] = await Promise.all([api(`/api/usuarios/${id}`), api('/api/auth/permissoes')]);
  estado.usuarioAberto = u;
  const ehEu = u.id === estado.eu.id;
  const editarDados = pode('usuarios.editar') && (!u.master || estado.eu.master);
  const editarPerm = estado.eu.master;
  const marcadas = new Set(u.permissoes);
  const grupos = {};
  for (const p of permissoes) (grupos[p.grupo] ||= []).push(p);

  const dados = [
    { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true, largura: 3 },
    { nome: 'documento', rotulo: 'CPF', mascara: 'cpf', largura: 1, somenteLeitura: true },
    { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, largura: 2 },
    { nome: 'telefone', rotulo: 'Telefone', mascara: 'telefone', largura: 1 },
    { nome: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'date', largura: 1 },
  ];

  const blocosPerm = Object.entries(grupos)
    .map(([grupo, itens]) => `
      <fieldset class="grupo-perm" ${u.master || !editarPerm ? 'disabled' : ''}>
        <legend>${esc(grupo)}</legend>
        ${editarPerm && !u.master ? `<div class="perm-atalhos">
          <button type="button" class="link-btn" data-acao="marcar-grupo" data-grupo="${esc(grupo)}" data-valor="1">Marcar todas</button>
          <button type="button" class="link-btn" data-acao="marcar-grupo" data-grupo="${esc(grupo)}" data-valor="">Desmarcar todas</button>
        </div>` : ''}
        ${itens.map((p) => `<label class="perm">
          <input type="checkbox" name="perm" value="${p.chave}" data-grupo="${esc(grupo)}" ${u.master || marcadas.has(p.chave) ? 'checked' : ''} />
          <span class="perm-texto">${esc(p.rotulo)}</span>
          <span class="selo tipo-${p.tipo}">${NOME_TIPO_PERMISSAO[p.tipo]}</span>
        </label>`).join('')}
      </fieldset>`)
    .join('');

  tela().innerHTML = `
    <header class="cabecalho">
      <div>
        <a class="voltar" href="#/usuarios">${ICONE.voltar}Usuários</a>
        <h1>${esc(u.nome)}</h1>
        <p class="subtitulo">${u.master ? 'Usuário master' : 'Usuário'}${u.ativo ? '' : ', inativo'}</p>
      </div>
      <div class="acoes">
        ${pode('usuarios.editar') && !ehEu && (!u.master || estado.eu.master)
          ? `<button type="button" class="btn btn-leve" data-acao="redefinir-senha" data-id="${u.id}">Gerar senha temporária</button>
             <button type="button" class="btn btn-leve ${u.ativo ? 'perigo-texto' : ''}" data-acao="ativar-usuario" data-id="${u.id}" data-valor="${u.ativo ? '' : '1'}">${u.ativo ? 'Desativar usuário' : 'Reativar usuário'}</button>`
          : ''}
      </div>
    </header>

    <form class="ficha" data-form="usuario" data-id="${u.id}" novalidate>
      <section class="bloco">
        <div class="bloco-titulo"><h2>Dados do usuário</h2><a href="#/pessoas/${u.pessoa_id}">${pode('pessoas') ? 'Ver cadastro completo' : ''}</a></div>
        <div class="grade-campos">${renderCampos(dados, { ...u.pessoa }, { prefixo: 'usuario', somenteLeitura: !editarDados })}</div>
        ${editarDados ? '<div class="rodape-ficha"><button type="submit" class="btn btn-principal">Salvar dados</button></div>' : ''}
      </section>
    </form>

    <form class="ficha" data-form="permissoes" data-id="${u.id}" novalidate>
      <section class="bloco">
        <div class="bloco-titulo"><h2>Permissões</h2></div>
        ${editarPerm ? `<label class="perm perm-master">
            <input type="checkbox" name="master" value="1" ${u.master ? 'checked' : ''} ${ehEu ? 'disabled' : ''} data-acao-change="master" />
            <span class="perm-texto"><strong>Usuário master</strong><br /><small>Acesso total, cadastra empresas, vincula responsáveis e define permissões.</small></span>
          </label>` : ''}
        <p class="nota">${u.master
          ? 'O usuário master tem todas as permissões, inclusive as que forem criadas no futuro.'
          : editarPerm ? 'Marque o que este usuário pode ver e fazer. Toda tela, ação ou relatório novo do sistema aparece aqui.' : 'Somente o usuário master altera permissões.'}</p>
        <div class="grade-perm">${blocosPerm}</div>
        ${editarPerm ? '<div class="rodape-ficha"><button type="submit" class="btn btn-principal">Salvar permissões</button></div>' : ''}
      </section>
    </form>

    ${u.empresas.length ? `<section class="bloco" style="margin-top:20px">
      <div class="bloco-titulo"><h2>Empresas sob responsabilidade</h2></div>
      <ul class="lista">${u.empresas.map((e) => `<li><a class="item item-link" href="#/empresas/${e.id}">
        <div class="avatar pj" aria-hidden="true">${esc(iniciais(e.nome))}</div>
        <div class="item-principal"><div class="item-titulo">${esc(e.nome)}</div><div class="item-sub"><span>CNPJ ${fmt.cnpj(e.documento)}</span></div></div>
        <div></div><span class="seta" aria-hidden="true">${ICONE.proximo}</span></a></li>`).join('')}</ul>
    </section>` : ''}`;
}

formularios.usuario = async (form, dados) => {
  await api(`/api/usuarios/${form.dataset.id}`, { method: 'PUT', body: dados });
  toast('Dados do usuário salvos');
  if (Number(form.dataset.id) === estado.eu.id) {
    estado.eu = await api('/api/auth/eu');
    desenharUsuarioMenu();
  }
};

formularios.permissoes = async (form) => {
  const permissoes = $$('input[name=perm]:checked', form).map((i) => i.value);
  const masterEl = form.elements.master;
  const corpo = { permissoes };
  if (masterEl && !masterEl.disabled) corpo.master = masterEl.checked;
  await api(`/api/usuarios/${form.dataset.id}/permissoes`, { method: 'PUT', body: corpo });
  toast('Permissões salvas');
};

// Ao marcar "Usuário master", todas as caixas ficam marcadas e travadas
document.addEventListener('change', (ev) => {
  if (ev.target.dataset.acaoChange === 'master') {
    const form = ev.target.closest('form');
    const ativo = ev.target.checked;
    $$('.grupo-perm', form).forEach((fs) => (fs.disabled = ativo));
    if (ativo) $$('input[name=perm]', form).forEach((i) => (i.checked = true));
  }
});

Object.assign(acoes, {
  'novo-usuario': async () => {
    let criado;
    const ok = await abrirModal({
      titulo: 'Novo usuário',
      mensagem: 'O usuário também entra no cadastro de pessoas físicas. Uma senha temporária será gerada.',
      campos: [
        { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true },
        [
          { nome: 'cpf', rotulo: 'CPF', mascara: 'cpf', obrigatorio: true },
          { nome: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'date' },
        ],
        { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true },
        { nome: 'telefone', rotulo: 'Telefone', mascara: 'telefone' },
      ],
      botao: 'Criar usuário',
      enviar: async (d) => {
        criado = await api('/api/usuarios', { method: 'POST', body: d });
        return true;
      },
    });
    if (!ok) return false;
    await mostrarSenhaTemporaria(criado.usuario.nome, criado.senha_temporaria);
    location.hash = `#/usuarios/${criado.usuario.id}`;
    return false;
  },
  'redefinir-senha': async (el) => {
    const u = estado.usuarioAberto;
    if (!(await confirmar('Gerar senha temporária?', `A senha atual de ${esc(u.nome)} deixa de funcionar e as sessões abertas são encerradas.`, 'Gerar senha'))) return false;
    const r = await api(`/api/usuarios/${el.dataset.id}/redefinir-senha`, { method: 'POST' });
    await mostrarSenhaTemporaria(u.nome, r.senha_temporaria);
  },
  'ativar-usuario': async (el) => {
    const ativar = !!el.dataset.valor;
    const u = estado.usuarioAberto;
    if (!ativar && !(await confirmar('Desativar usuário?', `${esc(u.nome)} não conseguirá mais entrar no sistema. Os dados dele são mantidos.`, 'Desativar'))) return false;
    await api(`/api/usuarios/${el.dataset.id}`, { method: 'PUT', body: { ativo: ativar } });
    toast(ativar ? 'Usuário reativado' : 'Usuário desativado');
  },
  'marcar-grupo': (el) => {
    $$(`input[name=perm][data-grupo="${CSS.escape(el.dataset.grupo)}"]`).forEach((i) => (i.checked = !!el.dataset.valor));
    return false;
  },
});
