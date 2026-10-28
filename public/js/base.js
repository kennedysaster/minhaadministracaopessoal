/* =========================================================
   Base: utilidades, API, avisos, modal, campos e máscaras
   ========================================================= */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const hoje = () => new Date().toLocaleDateString('sv-SE');
const mesHoje = () => hoje().slice(0, 7);
const paraData = (s) => {
  const [a, m, d] = s.split('-').map(Number);
  return new Date(a, m - 1, d || 1);
};
const dataBR = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
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
const digitos = (s) => String(s ?? '').replace(/\D/g, '');

// ---------- Formatação de documentos ----------
const fmt = {
  cpf: (s) => digitos(s).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4'),
  cnpj: (s) => digitos(s).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'),
  doc: (s) => (digitos(s).length === 14 ? fmt.cnpj(s) : fmt.cpf(s)),
  cep: (s) => digitos(s).replace(/^(\d{5})(\d{3})$/, '$1-$2'),
  tel: (s) => {
    const d = digitos(s);
    if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    return d;
  },
};

// Máscara enquanto digita
const MASCARAS = {
  cpf: (d) => d.slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'),
  cnpj: (d) =>
    d.slice(0, 14).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2'),
  cep: (d) => d.slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2'),
  telefone: (d) => {
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  },
};
const mascarar = (tipo, v) => (MASCARAS[tipo] ? MASCARAS[tipo](digitos(v)) : v);

document.addEventListener('input', (ev) => {
  const el = ev.target;
  const m = el.dataset?.mascara;
  if (m && MASCARAS[m]) {
    el.value = mascarar(m, el.value);
    if (m === 'cep' && digitos(el.value).length === 8) buscarCep(el);
  }
});

// Completa o endereço pelo CEP (ViaCEP), preenchendo os campos do mesmo formulário
async function buscarCep(input) {
  const form = input.closest('form');
  if (!form || input.dataset.ultimoCep === digitos(input.value)) return;
  input.dataset.ultimoCep = digitos(input.value);
  try {
    const r = await fetch(`https://viacep.com.br/ws/${digitos(input.value)}/json/`);
    const j = await r.json();
    if (j.erro) return toast('CEP não encontrado. Preencha o endereço manualmente.', { erro: true });
    const pares = { logradouro: j.logradouro, bairro: j.bairro, cidade: j.localidade, uf: j.uf };
    for (const [nome, valor] of Object.entries(pares)) {
      const el = form.elements[nome];
      if (el && valor && !el.readOnly) el.value = valor;
    }
    form.elements.numero?.focus();
  } catch {
    // sem internet: o usuário digita o endereço
  }
}

const ICONE = {
  editar: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  excluir: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  mais: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  baixar: '<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  buscar: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>',
  abrir: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  voltar: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  anterior: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  proximo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
};

// ---------- Estado compartilhado ----------
const estado = {
  eu: null,
  mes: mesHoje(),
  filtro: { tipo: 'todos', categoria: '', busca: '' },
  abaContas: 'abertas',
  abaTarefas: 'pendentes',
  abaPessoas: 'PF',
  buscaPessoas: '',
  empresaId: null,
  empresas: [],
  pj: null, // opções de PJ (categorias, classificações, regimes)
  dados: { transacoes: [], contas: [], fixas: [], tarefas: [], categorias: [] },
};

const pode = (chave) => !!estado.eu && (estado.eu.master || estado.eu.permissoes.includes(chave));

// Guarda pequenas preferências no navegador (empresa escolhida)
const preferencia = {
  ler: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  gravar: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* navegador sem armazenamento */
    }
  },
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
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    location.href = '/login';
    throw new Error('Sua sessão terminou. Entre novamente.');
  }
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.erro || 'Não foi possível concluir a ação'), { status: res.status });
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
  toast.t = setTimeout(() => (el.hidden = true), acao ? 6000 : 4000);
}

// ---------- Campos de formulário ----------
/**
 * Campo: { nome, rotulo, tipo, opcoes:[[valor, texto]], obrigatorio, mascara, largura (1-4),
 *          ajuda, placeholder, somenteLeitura, min, max, passo, lista, mostrarSe(dados) }
 */
function htmlCampo(c, v, { prefixo = 'campo', somenteLeitura = false } = {}) {
  const valor = v ?? c.padrao ?? '';
  const id = `${prefixo}-${c.nome}`;
  const leitura = somenteLeitura || c.somenteLeitura;
  const largura = `larg-${c.largura || 2}`;
  if (c.tipo === 'segmentado') {
    return `<div class="campo ${largura}" data-campo="${c.nome}"><span class="sr" id="${id}">${esc(c.rotulo)}</span>
      <div class="segmentado" role="radiogroup" aria-labelledby="${id}">
        ${c.opcoes
          .map(
            ([val, txt]) =>
              `<label><input type="radio" name="${c.nome}" value="${val}" ${val === valor ? 'checked' : ''} ${leitura ? 'disabled' : ''} /><span>${esc(txt)}</span></label>`
          )
          .join('')}
      </div></div>`;
  }
  let input;
  if (c.tipo === 'select') {
    input = `<select id="${id}" name="${c.nome}" ${leitura ? 'disabled' : ''}>${c.opcoes
      .map(([val, txt]) => `<option value="${esc(val)}" ${String(val) === String(valor) ? 'selected' : ''}>${esc(txt)}</option>`)
      .join('')}</select>`;
    if (leitura) input += `<input type="hidden" name="${c.nome}" value="${esc(valor)}" />`;
  } else if (c.tipo === 'textarea') {
    input = `<textarea id="${id}" name="${c.nome}" rows="3" ${leitura ? 'readonly' : ''} placeholder="${esc(c.placeholder || '')}">${esc(valor)}</textarea>`;
  } else {
    const mostrado = c.mascara ? mascarar(c.mascara, valor) : valor;
    const extras = [
      c.obrigatorio ? 'required aria-required="true"' : '',
      c.min != null ? `min="${c.min}"` : '',
      c.max != null ? `max="${c.max}"` : '',
      c.passo ? `step="${c.passo}"` : '',
      c.lista ? `list="${id}-lista"` : '',
      c.placeholder ? `placeholder="${esc(c.placeholder)}"` : '',
      c.mascara ? `data-mascara="${c.mascara}" inputmode="numeric"` : '',
      c.tipo === 'number' ? 'inputmode="decimal"' : '',
      `autocomplete="${c.autocomplete || 'off'}"`,
      leitura ? 'readonly' : '',
    ].join(' ');
    input = `<input id="${id}" name="${c.nome}" type="${c.tipo || 'text'}" value="${esc(mostrado)}" ${extras} />`;
    if (c.lista) input += `<datalist id="${id}-lista">${c.lista.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>`;
  }
  const marca = c.obrigatorio && !leitura ? ' <span class="obrig" aria-hidden="true">*</span>' : '';
  return `<div class="campo ${largura}" data-campo="${c.nome}"><label for="${id}">${esc(c.rotulo)}${marca}</label>${input}${
    c.ajuda ? `<span class="ajuda">${esc(c.ajuda)}</span>` : ''
  }</div>`;
}

const renderCampos = (campos, valores = {}, opcoes) => campos.map((c) => htmlCampo(c, valores[c.nome], opcoes)).join('');

// Mostra/esconde campos que dependem de outros (mostrarSe)
function ligarDependencias(form, campos) {
  const deps = campos.flat().filter((c) => c.mostrarSe);
  if (!deps.length) return;
  const atualizar = () => {
    const dados = Object.fromEntries(new FormData(form));
    for (const c of deps) {
      const el = form.querySelector(`[data-campo="${c.nome}"]`);
      if (el) el.hidden = !c.mostrarSe(dados);
    }
  };
  form.addEventListener('change', atualizar);
  atualizar();
}

// Campos de endereço usados em pessoas, empresas e cadastro
const CAMPOS_ENDERECO = (obrigatorio = false) => [
  { nome: 'cep', rotulo: 'CEP', mascara: 'cep', largura: 1, obrigatorio, ajuda: 'Digite o CEP para completar o endereço' },
  { nome: 'logradouro', rotulo: 'Rua / avenida', largura: 3, obrigatorio },
  { nome: 'numero', rotulo: 'Número', largura: 1, obrigatorio },
  { nome: 'complemento', rotulo: 'Complemento', largura: 1 },
  { nome: 'bairro', rotulo: 'Bairro', largura: 2, obrigatorio },
  { nome: 'cidade', rotulo: 'Cidade', largura: 3, obrigatorio },
  { nome: 'uf', rotulo: 'UF', largura: 1, obrigatorio, placeholder: 'GO' },
];

// ---------- Modal ----------
function abrirModal({ titulo, campos = [], valores = {}, mensagem = '', botao = 'Salvar', perigo = false, enviar, semCancelar = false, largo = false }) {
  const modal = $('#modal');
  const form = $('#modal-form');
  const erroEl = $('#modal-erro');
  const ok = $('#modal-ok');
  modal.classList.toggle('largo', largo);
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML =
    (mensagem ? `<p>${mensagem}</p>` : '') +
    campos
      .map((c) =>
        Array.isArray(c)
          ? `<div class="linha-campos">${c.map((x) => htmlCampo(x, valores[x.nome], { prefixo: 'modal' })).join('')}</div>`
          : htmlCampo(c, valores[c.nome], { prefixo: 'modal' })
      )
      .join('');
  erroEl.hidden = true;
  ok.textContent = botao;
  ok.className = 'btn ' + (perigo ? 'btn-perigo' : 'btn-principal');
  $('#modal-cancelar').hidden = semCancelar;
  ligarDependencias(form, campos);

  return new Promise((resolve) => {
    const fechar = (r) => {
      form.onsubmit = null;
      $('#modal-cancelar').onclick = null;
      modal.oncancel = null;
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
    modal.oncancel = (ev) => {
      if (semCancelar) ev.preventDefault();
    };
    // O evento "close" chega depois; se outro modal já abriu, ele não é deste
    modal.onclose = () => {
      if (!modal.open) fechar(false);
    };
    modal.showModal();
    const primeiro = $('#modal-corpo input:not([type=radio]):not([readonly]), #modal-corpo select', modal);
    (primeiro || ok).focus();
  });
}

const confirmar = (titulo, mensagem, botao = 'Excluir') => abrirModal({ titulo, mensagem, botao, perigo: true });

// Mostra uma senha temporária para o usuário anotar
function mostrarSenhaTemporaria(nome, senha) {
  return abrirModal({
    titulo: 'Senha temporária',
    mensagem: `Passe esta senha para <strong>${esc(nome)}</strong>. No primeiro acesso o sistema vai pedir uma senha nova.
      <span class="senha-temp">${esc(senha)}</span>Ela não será mostrada de novo.`,
    botao: 'Anotei a senha',
    semCancelar: true,
  });
}

// Trocar a senha (obrigatório no primeiro acesso)
function trocarSenha(obrigatorio = false) {
  const campos = [
    ...(obrigatorio ? [] : [{ nome: 'senha_atual', rotulo: 'Senha atual', tipo: 'password', obrigatorio: true, autocomplete: 'current-password' }]),
    { nome: 'nova_senha', rotulo: 'Nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password', ajuda: 'Pelo menos 8 caracteres, com letras e números' },
    { nome: 'confirmar_senha', rotulo: 'Repita a nova senha', tipo: 'password', obrigatorio: true, autocomplete: 'new-password' },
  ];
  return abrirModal({
    titulo: obrigatorio ? 'Crie a sua senha' : 'Trocar senha',
    mensagem: obrigatorio ? 'Você entrou com uma senha temporária. Crie uma senha só sua para continuar.' : '',
    campos,
    botao: 'Salvar senha',
    semCancelar: obrigatorio,
    enviar: async (d) => {
      estado.eu = await api('/api/auth/senha', { method: 'POST', body: d });
      return true;
    },
  });
}

// ---------- Pedaços de interface ----------
const seletorMes = () => `
  <div class="seletor-mes">
    <button type="button" data-acao="mudar-mes" data-delta="-1" aria-label="Mês anterior">${ICONE.anterior}</button>
    <span aria-live="polite">${maiuscula(nomeMes(estado.mes))}</span>
    <button type="button" data-acao="mudar-mes" data-delta="1" aria-label="Próximo mês">${ICONE.proximo}</button>
  </div>`;

const blocoDia = (data, classe = '') => {
  const d = paraData(data);
  return `<div class="dia ${classe}"><b>${d.getDate()}</b><small>${d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</small></div>`;
};

const botoesEditarExcluir = (tipo, id, { editar = true, excluir = true } = {}) =>
  (editar ? `<button type="button" class="icone-btn" data-acao="editar-${tipo}" data-id="${id}" aria-label="Editar">${ICONE.editar}</button>` : '') +
  (excluir ? `<button type="button" class="icone-btn excluir" data-acao="excluir-${tipo}" data-id="${id}" aria-label="Excluir">${ICONE.excluir}</button>` : '');

const vazio = (titulo, texto, botao) => `<li class="vazio"><strong>${titulo}</strong>${texto}${botao || ''}</li>`;

const botaoNovo = (acao, texto, perm) =>
  !perm || pode(perm) ? `<button type="button" class="btn btn-principal" data-acao="${acao}">${ICONE.mais}${texto}</button>` : '';

const tela = () => $('#tela');

// Ações e formulários registrados pelas telas
const acoes = {};
const formularios = {};
