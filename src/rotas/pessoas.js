// Cadastro de pessoas físicas e jurídicas, contas bancárias e "Meus dados"
const express = require('express');
const db = require('../db');
const { exigir, pode } = require('../auth');
const { validarPessoa, salvarPessoa, porId } = require('../pessoas');
const { erro, texto, digitos } = require('../util');

const r = express.Router();

const TIPOS_CONTA = ['Corrente', 'Poupança', 'Pagamento', 'Salário'];

const vinculos = (id) => ({
  usuario_id: db.prepare('SELECT id FROM usuarios WHERE pessoa_id = ?').get(id)?.id ?? null,
  empresa_id: db.prepare('SELECT id FROM empresas WHERE pessoa_id = ?').get(id)?.id ?? null,
});

const contasDaPessoa = (id) => db.prepare('SELECT * FROM contas_bancarias WHERE pessoa_id = ? ORDER BY id').all(id);

// Pode mexer na pessoa: quem tem permissão de cadastro, ou a própria pessoa em "Meus dados"
const podeEditar = (req, pessoaId) =>
  pode(req.usuario, 'pessoas.editar') || (pode(req.usuario, 'pf.meus_dados') && Number(pessoaId) === req.usuario.pessoa_id);
const podeVer = (req, pessoaId) =>
  pode(req.usuario, 'pessoas') || (pode(req.usuario, 'pf.meus_dados') && Number(pessoaId) === req.usuario.pessoa_id);

// ---------- Pessoas ----------
r.get('/pessoas', exigir('pessoas', 'pj.faturamento.editar'), (req, res) => {
  const tipo = ['PF', 'PJ'].includes(req.query.tipo) ? req.query.tipo : null;
  const busca = texto(req.query.busca);
  const where = [];
  const args = [];
  if (tipo) {
    where.push('p.tipo = ?');
    args.push(tipo);
  }
  if (busca) {
    where.push('(p.nome LIKE ? OR p.nome_fantasia LIKE ? OR p.documento LIKE ? OR p.email LIKE ?)');
    const like = `%${busca}%`;
    args.push(like, like, `%${digitos(busca) || busca}%`, like);
  }
  const lista = db
    .prepare(
      `SELECT p.*, u.id AS usuario_id, e.id AS empresa_id,
              (SELECT COUNT(*) FROM contas_bancarias c WHERE c.pessoa_id = p.id) AS qtd_contas
       FROM pessoas p
       LEFT JOIN usuarios u ON u.pessoa_id = p.id
       LEFT JOIN empresas e ON e.pessoa_id = p.id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY p.nome LIMIT 500`
    )
    .all(...args);
  res.json(lista);
});

r.get('/pessoas/:id', (req, res) => {
  if (!podeVer(req, req.params.id)) return erro(res, 'Você não tem permissão para ver este cadastro', 403);
  const p = porId(req.params.id);
  if (!p) return erro(res, 'Pessoa não encontrada', 404);
  res.json({ ...p, ...vinculos(p.id), contas_bancarias: contasDaPessoa(p.id) });
});

r.post('/pessoas', exigir('pessoas.editar'), (req, res) => {
  const p = validarPessoa(req.body);
  if (p.erro) return erro(res, p.erro);
  if (db.prepare('SELECT 1 FROM pessoas WHERE documento = ?').get(p.documento))
    return erro(res, `Já existe uma pessoa com este ${p.tipo === 'PF' ? 'CPF' : 'CNPJ'}`, 409);
  const salva = salvarPessoa(p);
  res.status(201).json({ ...salva, ...vinculos(salva.id), contas_bancarias: [] });
});

r.put('/pessoas/:id', (req, res) => {
  if (!podeEditar(req, req.params.id)) return erro(res, 'Você não tem permissão para alterar este cadastro', 403);
  const atual = porId(req.params.id);
  if (!atual) return erro(res, 'Pessoa não encontrada', 404);
  const v = vinculos(atual.id);
  // Tipo nunca muda; documento de usuário ou empresa também não
  const documento = v.usuario_id || v.empresa_id ? atual.documento : req.body?.documento ?? atual.documento;
  const p = validarPessoa({ ...atual, ...req.body, tipo: atual.tipo, documento });
  if (p.erro) return erro(res, p.erro);
  if (v.usuario_id && !p.email) return erro(res, 'Usuários precisam ter e-mail');
  if (v.usuario_id && require('./auth').emailEmUso(p.email, v.usuario_id))
    return erro(res, 'Este e-mail já está em uso por outro usuário', 409);
  try {
    const salva = salvarPessoa(p, { id: atual.id });
    res.json({ ...salva, ...v, contas_bancarias: contasDaPessoa(salva.id) });
  } catch (e) {
    erro(res, e.message, e.status || 400);
  }
});

r.delete('/pessoas/:id', exigir('pessoas.editar'), (req, res) => {
  const p = porId(req.params.id);
  if (!p) return erro(res, 'Pessoa não encontrada', 404);
  const v = vinculos(p.id);
  if (v.usuario_id) return erro(res, 'Esta pessoa é um usuário do sistema e não pode ser excluída. Desative o usuário.');
  if (v.empresa_id) return erro(res, 'Esta pessoa jurídica é uma empresa cadastrada. Exclua a empresa primeiro.');
  db.prepare('DELETE FROM pessoas WHERE id = ?').run(p.id);
  res.status(204).end();
});

// ---------- Contas bancárias ----------
function validarContaBancaria(b = {}) {
  const banco = texto(b.banco);
  if (!banco) return { erro: 'Preencha o banco' };
  const tipo = TIPOS_CONTA.includes(b.tipo) ? b.tipo : 'Corrente';
  const agencia = texto(b.agencia) || null;
  const conta = texto(b.conta) || null;
  const chave_pix = texto(b.chave_pix) || null;
  if (!conta && !chave_pix) return { erro: 'Informe a conta ou uma chave Pix' };
  return { banco, tipo, agencia, conta, chave_pix, observacao: texto(b.observacao) || null };
}

r.post('/pessoas/:id/contas-bancarias', (req, res) => {
  if (!podeEditar(req, req.params.id)) return erro(res, 'Você não tem permissão para alterar este cadastro', 403);
  if (!porId(req.params.id)) return erro(res, 'Pessoa não encontrada', 404);
  const c = validarContaBancaria(req.body);
  if (c.erro) return erro(res, c.erro);
  const info = db
    .prepare('INSERT INTO contas_bancarias (pessoa_id, banco, agencia, conta, tipo, chave_pix, observacao) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.params.id, c.banco, c.agencia, c.conta, c.tipo, c.chave_pix, c.observacao);
  res.status(201).json(db.prepare('SELECT * FROM contas_bancarias WHERE id = ?').get(info.lastInsertRowid));
});

r.put('/pessoas/:id/contas-bancarias/:cid', (req, res) => {
  if (!podeEditar(req, req.params.id)) return erro(res, 'Você não tem permissão para alterar este cadastro', 403);
  const atual = db.prepare('SELECT * FROM contas_bancarias WHERE id = ? AND pessoa_id = ?').get(req.params.cid, req.params.id);
  if (!atual) return erro(res, 'Conta bancária não encontrada', 404);
  const c = validarContaBancaria(req.body);
  if (c.erro) return erro(res, c.erro);
  db.prepare('UPDATE contas_bancarias SET banco=?, agencia=?, conta=?, tipo=?, chave_pix=?, observacao=? WHERE id=?')
    .run(c.banco, c.agencia, c.conta, c.tipo, c.chave_pix, c.observacao, atual.id);
  res.json(db.prepare('SELECT * FROM contas_bancarias WHERE id = ?').get(atual.id));
});

r.delete('/pessoas/:id/contas-bancarias/:cid', (req, res) => {
  if (!podeEditar(req, req.params.id)) return erro(res, 'Você não tem permissão para alterar este cadastro', 403);
  const info = db.prepare('DELETE FROM contas_bancarias WHERE id = ? AND pessoa_id = ?').run(req.params.cid, req.params.id);
  if (!info.changes) return erro(res, 'Conta bancária não encontrada', 404);
  res.status(204).end();
});

module.exports = r;
module.exports.TIPOS_CONTA = TIPOS_CONTA;
