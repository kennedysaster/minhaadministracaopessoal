/* Tela de login e criação de conta */

const CAMPOS_CADASTRO = [
  { nome: 'nome', rotulo: 'Nome completo', obrigatorio: true, largura: 4, autocomplete: 'name' },
  { nome: 'cpf', rotulo: 'CPF', mascara: 'cpf', obrigatorio: true, largura: 2 },
  { nome: 'data_nascimento', rotulo: 'Data de nascimento', tipo: 'date', obrigatorio: true, largura: 2, autocomplete: 'bday' },
  { nome: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, largura: 2, autocomplete: 'email' },
  { nome: 'telefone', rotulo: 'Telefone', mascara: 'telefone', obrigatorio: true, largura: 2, autocomplete: 'tel' },
  ...CAMPOS_ENDERECO(true),
  { nome: 'senha', rotulo: 'Senha', tipo: 'password', obrigatorio: true, largura: 2, autocomplete: 'new-password', ajuda: 'Pelo menos 8 caracteres, com letras e números' },
  { nome: 'confirmar_senha', rotulo: 'Repita a senha', tipo: 'password', obrigatorio: true, largura: 2, autocomplete: 'new-password' },
];

$('#campos-cadastro').innerHTML = renderCampos(CAMPOS_CADASTRO, {}, { prefixo: 'cad' });

function mostrarAba(qual) {
  const entrar = qual === 'entrar';
  $('#aba-entrar').setAttribute('aria-selected', entrar);
  $('#aba-criar').setAttribute('aria-selected', !entrar);
  $('#aba-entrar').setAttribute('aria-pressed', entrar);
  $('#aba-criar').setAttribute('aria-pressed', !entrar);
  $('#form-entrar').hidden = !entrar;
  $('#form-criar').hidden = entrar;
  (entrar ? $('#login') : $('#cad-nome')).focus();
}
$('#aba-entrar').onclick = () => mostrarAba('entrar');
$('#aba-criar').onclick = () => mostrarAba('criar');
mostrarAba(location.hash === '#criar' ? 'criar' : 'entrar');

async function enviar(form, url) {
  const erro = $('.erro-form', form);
  const botao = $('button[type=submit]', form);
  erro.hidden = true;
  botao.disabled = true;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.erro || 'Não foi possível entrar');
    location.href = '/';
  } catch (e) {
    erro.textContent = e.message.startsWith('Failed') ? 'Sem conexão com o servidor. Verifique se o painel está rodando.' : e.message;
    erro.hidden = false;
  } finally {
    botao.disabled = false;
  }
}

$('#form-entrar').onsubmit = (ev) => {
  ev.preventDefault();
  enviar(ev.target, '/api/auth/login');
};
$('#form-criar').onsubmit = (ev) => {
  ev.preventDefault();
  enviar(ev.target, '/api/auth/cadastro');
};

// Já logado? vai direto para o painel
fetch('/api/auth/eu').then((r) => {
  if (r.ok) location.href = '/';
});
