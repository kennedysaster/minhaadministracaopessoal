// Login, sessões e permissões
const crypto = require('crypto');
const db = require('./db');
const { PERMISSOES, CHAVES } = require('./permissoes');
const { salvarPessoa, validarPessoa } = require('./pessoas');
const { erro } = require('./util');

const COOKIE = 'sessao';
const DURACAO_SESSAO = 7 * 24 * 60 * 60 * 1000; // 7 dias

// ---------- Senhas ----------
function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(senha), sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

function conferirSenha(senha, guardado) {
  if (!guardado) return false;
  const [alg, salHex, hashHex] = guardado.split('$');
  if (alg !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const obtido = crypto.scryptSync(String(senha), Buffer.from(salHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(esperado, obtido);
}

function validarNovaSenha(senha) {
  const s = String(senha || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha';
  return null;
}

// Senha temporária fácil de digitar (sem 0/O, 1/l)
function senhaTemporaria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const todos = letras + letras.toUpperCase() + numeros;
  let s = letras[crypto.randomInt(letras.length)] + numeros[crypto.randomInt(numeros.length)];
  while (s.length < 10) s += todos[crypto.randomInt(todos.length)];
  return s;
}

// ---------- Sessões ----------
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function lerCookie(req, nome) {
  const cab = req.headers.cookie || '';
  for (const parte of cab.split(';')) {
    const i = parte.indexOf('=');
    if (i > -1 && parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function iniciarSessao(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)').run(
    hashToken(token), usuarioId, Date.now() + DURACAO_SESSAO
  );
  db.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?").run(usuarioId);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DURACAO_SESSAO / 1000}`);
}

function encerrarSessao(req, res) {
  const token = lerCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(hashToken(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function encerrarSessoesDoUsuario(usuarioId) {
  db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(usuarioId);
}

// ---------- Usuário ----------
function carregarUsuario(id) {
  const u = db
    .prepare(
      `SELECT u.id, u.pessoa_id, u.master, u.ativo, u.trocar_senha, u.ultimo_acesso, u.criado_em,
              p.nome, p.documento AS cpf, p.email, p.telefone, p.data_nascimento
       FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id WHERE u.id = ?`
    )
    .get(id);
  if (!u) return null;
  u.master = !!u.master;
  u.ativo = !!u.ativo;
  u.trocar_senha = !!u.trocar_senha;
  u.permissoes = u.master
    ? PERMISSOES.map((p) => p.chave)
    : db.prepare('SELECT chave FROM usuario_permissoes WHERE usuario_id = ?').all(id).map((r) => r.chave).filter((c) => CHAVES.has(c));
  return u;
}

const pode = (u, chave) => !!u && (u.master || u.permissoes.includes(chave));

function definirPermissoes(usuarioId, chaves) {
  const validas = [...new Set(chaves)].filter((c) => CHAVES.has(c));
  db.transacao(() => {
    db.prepare('DELETE FROM usuario_permissoes WHERE usuario_id = ?').run(usuarioId);
    const ins = db.prepare('INSERT INTO usuario_permissoes (usuario_id, chave) VALUES (?, ?)');
    for (const c of validas) ins.run(usuarioId, c);
  });
}

function definirSenha(usuarioId, senha, { trocar = false } = {}) {
  db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = ? WHERE id = ?').run(hashSenha(senha), trocar ? 1 : 0, usuarioId);
}

// ---------- Middlewares ----------
function autenticar(req, res, next) {
  req.usuario = null;
  const token = lerCookie(req, COOKIE);
  if (token) {
    const s = db.prepare('SELECT * FROM sessoes WHERE token_hash = ?').get(hashToken(token));
    if (s && s.expira_em > Date.now()) {
      const u = carregarUsuario(s.usuario_id);
      if (u && u.ativo) req.usuario = u;
      // renova a sessão uma vez por dia de uso
      if (s.expira_em - Date.now() < DURACAO_SESSAO - 864e5) {
        db.prepare('UPDATE sessoes SET expira_em = ? WHERE token_hash = ?').run(Date.now() + DURACAO_SESSAO, s.token_hash);
      }
    } else if (s) {
      db.prepare('DELETE FROM sessoes WHERE token_hash = ?').run(s.token_hash);
    }
  }
  next();
}

function exigirLogin(req, res, next) {
  if (!req.usuario) return erro(res, 'Faça login para continuar', 401);
  if (req.usuario.trocar_senha) return erro(res, 'Crie uma nova senha para continuar', 403);
  next();
}

// Exige ao menos uma das permissões informadas
const exigir = (...chaves) => (req, res, next) => {
  if (!req.usuario) return erro(res, 'Faça login para continuar', 401);
  if (chaves.some((c) => pode(req.usuario, c))) return next();
  return erro(res, 'Você não tem permissão para esta ação. Peça ao usuário master para liberar.', 403);
};

function exigirMaster(req, res, next) {
  if (!req.usuario?.master) return erro(res, 'Somente o usuário master pode fazer isso', 403);
  next();
}

// ---------- Usuário master inicial ----------
const MASTER = {
  tipo: 'PF',
  nome: 'Marcos Kennedy de Sá e Souza',
  documento: '71596372168',
  data_nascimento: '1979-11-10',
  email: 'kennedysaster@gmail.com',
};

// Cria o master na primeira execução. Devolve a senha temporária quando cria.
function garantirMaster() {
  if (db.prepare('SELECT 1 FROM usuarios WHERE master = 1').get()) return null;
  const p = validarPessoa(MASTER);
  if (p.erro) throw new Error(p.erro);
  const senha = senhaTemporaria();
  db.transacao(() => {
    const pessoa = salvarPessoa(p, { mesclar: true });
    const existente = db.prepare('SELECT id FROM usuarios WHERE pessoa_id = ?').get(pessoa.id);
    let id;
    if (existente) {
      id = existente.id;
      db.prepare('UPDATE usuarios SET master = 1, ativo = 1 WHERE id = ?').run(id);
    } else {
      id = db.prepare('INSERT INTO usuarios (pessoa_id, master) VALUES (?, 1)').run(pessoa.id).lastInsertRowid;
    }
    db.prepare('UPDATE usuarios SET senha_hash = ?, trocar_senha = 1 WHERE id = ?').run(hashSenha(senha), id);
    // Dados pessoais criados antes do login passam a ser do master
    for (const t of ['transacoes', 'tarefas', 'contas', 'contas_fixas']) {
      db.prepare(`UPDATE ${t} SET usuario_id = ? WHERE usuario_id IS NULL`).run(id);
    }
  });
  return senha;
}

module.exports = {
  hashSenha, conferirSenha, validarNovaSenha, senhaTemporaria, iniciarSessao, encerrarSessao,
  encerrarSessoesDoUsuario, carregarUsuario, pode, definirPermissoes, definirSenha, autenticar,
  exigirLogin, exigir, exigirMaster, garantirMaster, MASTER,
};
