// Login, criação de conta e troca de senha
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { validarPessoa, salvarPessoa, porDocumento } = require('../pessoas');
const { PERMISSOES, PADRAO_NOVO_USUARIO } = require('../permissoes');
const { erro, texto, digitos } = require('../util');

const r = express.Router();

// Proteção simples contra tentativa de adivinhar senha: 5 erros = espera de 5 minutos
const tentativas = new Map();
const BLOQUEIO = 5 * 60 * 1000;
function bloqueado(chave) {
  const t = tentativas.get(chave);
  if (!t) return false;
  if (Date.now() - t.ultima > BLOQUEIO) {
    tentativas.delete(chave);
    return false;
  }
  return t.n >= 5;
}
function registrarErro(chave) {
  const t = tentativas.get(chave) || { n: 0 };
  tentativas.set(chave, { n: t.n + 1, ultima: Date.now() });
}

function acharUsuarioPorLogin(login) {
  const l = texto(login);
  if (!l) return null;
  const doc = digitos(l);
  const row = l.includes('@')
    ? db.prepare('SELECT u.* FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id WHERE lower(p.email) = lower(?)').get(l)
    : db.prepare('SELECT u.* FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id WHERE p.documento = ?').get(doc);
  return row || null;
}

const emailEmUso = (email, exceto) =>
  !!db
    .prepare('SELECT 1 FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id WHERE lower(p.email) = lower(?) AND u.id != ?')
    .get(email, exceto || 0);

r.post('/login', (req, res) => {
  const { login, senha } = req.body || {};
  const chave = `${req.ip}|${texto(login).toLowerCase()}`;
  if (bloqueado(chave)) return erro(res, 'Muitas tentativas. Aguarde 5 minutos e tente de novo.', 429);
  const u = acharUsuarioPorLogin(login);
  if (!u || !auth.conferirSenha(senha, u.senha_hash)) {
    registrarErro(chave);
    return erro(res, 'CPF, e-mail ou senha incorretos', 401);
  }
  if (!u.ativo) return erro(res, 'Este usuário está desativado. Fale com o usuário master.', 403);
  tentativas.delete(chave);
  auth.iniciarSessao(res, u.id);
  res.json(auth.carregarUsuario(u.id));
});

r.post('/logout', (req, res) => {
  auth.encerrarSessao(req, res);
  res.status(204).end();
});

// Criar conta pela tela de login: exige nome, CPF, e-mail, telefone, endereço e nascimento
r.post('/cadastro', (req, res) => {
  const b = req.body || {};
  const p = validarPessoa({ ...b, tipo: 'PF', documento: b.cpf }, { exigirContato: true, exigirEndereco: true });
  if (p.erro) return erro(res, p.erro);
  const msgSenha = auth.validarNovaSenha(b.senha);
  if (msgSenha) return erro(res, msgSenha);
  if (b.senha !== b.confirmar_senha) return erro(res, 'As senhas não conferem');

  const pessoa = porDocumento(p.documento);
  if (pessoa && db.prepare('SELECT 1 FROM usuarios WHERE pessoa_id = ?').get(pessoa.id))
    return erro(res, 'Já existe um usuário com este CPF. Use a opção Entrar.', 409);
  if (emailEmUso(p.email)) return erro(res, 'Este e-mail já está em uso por outro usuário', 409);

  let id;
  db.transacao(() => {
    const salva = salvarPessoa(p, { mesclar: true });
    id = db.prepare('INSERT INTO usuarios (pessoa_id, senha_hash) VALUES (?, ?)').run(salva.id, auth.hashSenha(b.senha)).lastInsertRowid;
  });
  auth.definirPermissoes(id, PADRAO_NOVO_USUARIO);
  auth.iniciarSessao(res, id);
  res.status(201).json(auth.carregarUsuario(id));
});

// Quem está logado (usado pelas telas para montar o menu)
r.get('/eu', (req, res) => {
  if (!req.usuario) return erro(res, 'Faça login para continuar', 401);
  res.json(req.usuario);
});

r.post('/senha', (req, res) => {
  if (!req.usuario) return erro(res, 'Faça login para continuar', 401);
  const { senha_atual, nova_senha, confirmar_senha } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  // No primeiro acesso (senha temporária) não precisa repetir a senha atual
  if (!u.trocar_senha && !auth.conferirSenha(senha_atual, u.senha_hash)) return erro(res, 'Senha atual incorreta');
  const msg = auth.validarNovaSenha(nova_senha);
  if (msg) return erro(res, msg);
  if (nova_senha !== confirmar_senha) return erro(res, 'As senhas não conferem');
  if (auth.conferirSenha(nova_senha, u.senha_hash)) return erro(res, 'A nova senha precisa ser diferente da atual');
  auth.definirSenha(u.id, nova_senha);
  // encerra outras sessões e mantém esta
  auth.encerrarSessoesDoUsuario(u.id);
  auth.iniciarSessao(res, u.id);
  res.json(auth.carregarUsuario(u.id));
});

// Lista de permissões do sistema (para a tela de permissões)
r.get('/permissoes', (req, res) => {
  if (!req.usuario) return erro(res, 'Faça login para continuar', 401);
  res.json(PERMISSOES);
});

module.exports = r;
module.exports.emailEmUso = emailEmUso;
