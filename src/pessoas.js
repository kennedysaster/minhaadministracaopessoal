// Validação e gravação do cadastro de pessoas (físicas e jurídicas)
const db = require('./db');
const { texto, digitos, dataValida, cpfValido, cnpjValido, emailValido } = require('./util');

const CAMPOS = [
  'tipo', 'nome', 'nome_fantasia', 'documento', 'data_nascimento', 'email', 'telefone', 'telefone2',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'observacoes',
];
const CAMPOS_ENDERECO = ['cep', 'logradouro', 'numero', 'bairro', 'cidade', 'uf'];

// Coloca maiúscula no início de cada palavra, mantendo "de", "da", "e"... em minúsculas
function nomeProprio(s) {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return texto(s)
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');
}

/**
 * Valida os dados de uma pessoa.
 * opcoes.exigirContato: e-mail, telefone e nascimento obrigatórios (cadastro de usuário)
 * opcoes.exigirEndereco: endereço completo obrigatório
 */
function validarPessoa(b = {}, opcoes = {}) {
  const tipo = b.tipo === 'PJ' ? 'PJ' : 'PF';
  const p = { tipo };
  p.documento = digitos(b.documento ?? b.cpf ?? b.cnpj);
  if (tipo === 'PF' && !cpfValido(p.documento)) return { erro: 'CPF inválido. Confira os números.' };
  if (tipo === 'PJ' && !cnpjValido(p.documento)) return { erro: 'CNPJ inválido. Confira os números.' };

  p.nome = tipo === 'PF' ? nomeProprio(b.nome) : texto(b.nome).toLocaleUpperCase('pt-BR');
  if (p.nome.length < 3) return { erro: tipo === 'PF' ? 'Preencha o nome completo' : 'Preencha a razão social' };
  p.nome_fantasia = texto(b.nome_fantasia) || null;

  p.data_nascimento = b.data_nascimento || null;
  if (p.data_nascimento && !dataValida(p.data_nascimento)) return { erro: 'Data inválida' };
  if (tipo === 'PF' && p.data_nascimento && p.data_nascimento > new Date().toLocaleDateString('sv-SE'))
    return { erro: 'A data de nascimento não pode ser no futuro' };

  p.email = texto(b.email).toLowerCase() || null;
  if (p.email && !emailValido(p.email)) return { erro: 'E-mail inválido' };
  p.telefone = digitos(b.telefone) || null;
  if (p.telefone && (p.telefone.length < 10 || p.telefone.length > 11)) return { erro: 'Telefone deve ter DDD e 8 ou 9 dígitos' };
  p.telefone2 = digitos(b.telefone2) || null;

  p.cep = digitos(b.cep) || null;
  if (p.cep && p.cep.length !== 8) return { erro: 'CEP deve ter 8 números' };
  for (const c of ['logradouro', 'numero', 'complemento', 'bairro', 'cidade']) p[c] = texto(b[c]) || null;
  p.uf = texto(b.uf).toUpperCase() || null;
  if (p.uf && !/^[A-Z]{2}$/.test(p.uf)) return { erro: 'UF deve ter 2 letras (ex.: GO)' };
  p.observacoes = texto(b.observacoes) || null;

  if (opcoes.exigirContato) {
    if (!p.email) return { erro: 'Preencha o e-mail' };
    if (!p.telefone) return { erro: 'Preencha o telefone' };
    if (!p.data_nascimento) return { erro: 'Preencha a data de nascimento' };
  }
  if (opcoes.exigirEndereco) {
    const falta = CAMPOS_ENDERECO.find((c) => !p[c]);
    if (falta) return { erro: 'Preencha o endereço completo (CEP, rua, número, bairro, cidade e UF)' };
  }
  return p;
}

const porDocumento = (doc) => db.prepare('SELECT * FROM pessoas WHERE documento = ?').get(digitos(doc));
const porId = (id) => db.prepare('SELECT * FROM pessoas WHERE id = ?').get(id);

// Cria ou atualiza (pelo documento). Campos vazios não apagam dados já cadastrados quando "mesclar" é true.
function salvarPessoa(p, { id, mesclar = false } = {}) {
  const existente = id ? porId(id) : porDocumento(p.documento);
  if (existente) {
    const outro = porDocumento(p.documento);
    if (outro && outro.id !== existente.id) throw Object.assign(new Error('Já existe outra pessoa com este documento'), { status: 409 });
    const dados = {};
    for (const c of CAMPOS) dados[c] = mesclar && (p[c] == null || p[c] === '') ? existente[c] : p[c] ?? null;
    db.prepare(
      `UPDATE pessoas SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')}, atualizado_em = datetime('now') WHERE id = ?`
    ).run(...CAMPOS.map((c) => dados[c]), existente.id);
    return porId(existente.id);
  }
  const info = db
    .prepare(`INSERT INTO pessoas (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map(() => '?').join(', ')})`)
    .run(...CAMPOS.map((c) => p[c] ?? null));
  return porId(info.lastInsertRowid);
}

module.exports = { validarPessoa, salvarPessoa, porDocumento, porId, nomeProprio, CAMPOS };
