// Usuários e permissões
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { exigir, exigirMaster } = auth;
const { validarPessoa, salvarPessoa, porDocumento, porId } = require('../pessoas');
const { PADRAO_NOVO_USUARIO, CHAVES } = require('../permissoes');
const { erro } = require('../util');
const { emailEmUso } = require('./auth');

const r = express.Router();

const LISTA = `
  SELECT u.id, u.master, u.ativo, u.trocar_senha, u.ultimo_acesso, u.criado_em, u.pessoa_id,
         p.nome, p.documento AS cpf, p.email, p.telefone,
         (SELECT COUNT(*) FROM usuario_permissoes up WHERE up.usuario_id = u.id) AS qtd_permissoes
  FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id`;

r.get('/', exigir('usuarios', 'pj.empresas.editar'), (req, res) => {
  res.json(db.prepare(`${LISTA} ORDER BY u.master DESC, u.ativo DESC, p.nome`).all());
});

r.get('/:id', exigir('usuarios'), (req, res) => {
  const u = auth.carregarUsuario(req.params.id);
  if (!u) return erro(res, 'Usuário não encontrado', 404);
  const pessoa = porId(u.pessoa_id);
  const empresas = db
    .prepare('SELECT e.id, p.nome, p.documento FROM empresas e JOIN pessoas p ON p.id = e.pessoa_id WHERE e.responsavel_id = ? ORDER BY p.nome')
    .all(u.id);
  res.json({ ...u, pessoa, empresas });
});

// Novo usuário: nome, CPF e e-mail obrigatórios; já vira uma pessoa física no cadastro
r.post('/', exigir('usuarios.editar'), (req, res) => {
  const b = req.body || {};
  const p = validarPessoa({ ...b, tipo: 'PF', documento: b.cpf ?? b.documento });
  if (p.erro) return erro(res, p.erro);
  if (!p.email) return erro(res, 'Preencha o e-mail');
  const existente = porDocumento(p.documento);
  if (existente && db.prepare('SELECT 1 FROM usuarios WHERE pessoa_id = ?').get(existente.id))
    return erro(res, 'Já existe um usuário com este CPF', 409);
  if (emailEmUso(p.email)) return erro(res, 'Este e-mail já está em uso por outro usuário', 409);

  const senha = auth.senhaTemporaria();
  let id;
  db.transacao(() => {
    const pessoa = salvarPessoa(p, { mesclar: true });
    id = db
      .prepare('INSERT INTO usuarios (pessoa_id, senha_hash, trocar_senha) VALUES (?, ?, 1)')
      .run(pessoa.id, auth.hashSenha(senha)).lastInsertRowid;
  });
  // Só o master escolhe as permissões; os demais criam com o padrão
  const perms = req.usuario.master && Array.isArray(b.permissoes) ? b.permissoes : PADRAO_NOVO_USUARIO;
  auth.definirPermissoes(id, perms);
  res.status(201).json({ usuario: auth.carregarUsuario(id), senha_temporaria: senha });
});

// Altera dados pessoais e ativo/inativo
r.put('/:id', exigir('usuarios.editar'), (req, res) => {
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!alvo) return erro(res, 'Usuário não encontrado', 404);
  if (alvo.master && !req.usuario.master) return erro(res, 'Somente o master altera os dados de outro master', 403);
  const b = req.body || {};
  const pessoaAtual = porId(alvo.pessoa_id);
  // O CPF de um usuário não muda
  const p = validarPessoa({ ...pessoaAtual, ...b, tipo: 'PF', documento: pessoaAtual.documento });
  if (p.erro) return erro(res, p.erro);
  if (!p.email) return erro(res, 'Preencha o e-mail');
  if (emailEmUso(p.email, alvo.id)) return erro(res, 'Este e-mail já está em uso por outro usuário', 409);

  let ativo = alvo.ativo;
  if ('ativo' in b) {
    ativo = b.ativo ? 1 : 0;
    if (!ativo && alvo.id === req.usuario.id) return erro(res, 'Você não pode desativar o seu próprio usuário');
  }
  db.transacao(() => {
    salvarPessoa(p, { id: alvo.pessoa_id });
    db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(ativo, alvo.id);
  });
  if (!ativo) auth.encerrarSessoesDoUsuario(alvo.id);
  res.json(auth.carregarUsuario(alvo.id));
});

// Permissões e perfil master: somente o master
r.put('/:id/permissoes', exigirMaster, (req, res) => {
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!alvo) return erro(res, 'Usuário não encontrado', 404);
  const b = req.body || {};
  if (!Array.isArray(b.permissoes)) return erro(res, 'Envie a lista de permissões');
  const invalida = b.permissoes.find((c) => !CHAVES.has(c));
  if (invalida) return erro(res, `Permissão desconhecida: ${invalida}`);
  let master = alvo.master;
  if ('master' in b) {
    master = b.master ? 1 : 0;
    if (!master && alvo.id === req.usuario.id) return erro(res, 'Você não pode tirar o perfil master de si mesmo');
  }
  db.transacao(() => {
    db.prepare('UPDATE usuarios SET master = ? WHERE id = ?').run(master, alvo.id);
  });
  auth.definirPermissoes(alvo.id, b.permissoes);
  res.json(auth.carregarUsuario(alvo.id));
});

r.post('/:id/redefinir-senha', exigir('usuarios.editar'), (req, res) => {
  const alvo = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!alvo) return erro(res, 'Usuário não encontrado', 404);
  if (alvo.master && !req.usuario.master) return erro(res, 'Somente o master redefine a senha de outro master', 403);
  if (alvo.id === req.usuario.id) return erro(res, 'Para trocar a sua senha, use Minha senha no menu');
  const senha = auth.senhaTemporaria();
  auth.definirSenha(alvo.id, senha, { trocar: true });
  auth.encerrarSessoesDoUsuario(alvo.id);
  res.json({ senha_temporaria: senha });
});

module.exports = r;
