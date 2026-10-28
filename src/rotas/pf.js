// Pessoa física: finanças, contas e tarefas pessoais.
// Cada usuário vê e altera somente os próprios dados.
const express = require('express');
const db = require('../db');
const { exigir } = require('../auth');
const {
  fmt, hoje, mesAtual, dataValida, mesValido, texto, erro, somarMeses, ultimoDia, valorValido, csv,
} = require('../util');

const r = express.Router();
const meu = (tabela, id, uid) => db.prepare(`SELECT * FROM ${tabela} WHERE id = ? AND usuario_id = ?`).get(id, uid);

// ---------- Validações ----------
function validarTransacao(b = {}) {
  const descricao = texto(b.descricao);
  if (!descricao) return { erro: 'Preencha a descrição' };
  const valor = valorValido(b.valor);
  if (valor === null) return { erro: 'Informe um valor maior ou igual a zero' };
  if (!['receita', 'despesa'].includes(b.tipo)) return { erro: 'Escolha receita ou despesa' };
  const data = b.data || hoje();
  if (!dataValida(data)) return { erro: 'Data inválida' };
  return { descricao, valor, tipo: b.tipo, categoria: texto(b.categoria) || 'Outros', data };
}

function validarTarefa(b = {}) {
  const titulo = texto(b.titulo);
  if (!titulo) return { erro: 'Preencha o título da tarefa' };
  const prazo = b.prazo || null;
  if (prazo && !dataValida(prazo)) return { erro: 'Prazo inválido' };
  const prioridade = b.prioridade || 'media';
  if (!['baixa', 'media', 'alta'].includes(prioridade)) return { erro: 'Prioridade inválida' };
  return { titulo, prazo, prioridade };
}

function validarConta(b = {}) {
  const descricao = texto(b.descricao);
  if (!descricao) return { erro: 'Preencha o nome da conta' };
  const valor = valorValido(b.valor);
  if (valor === null) return { erro: 'Informe um valor maior ou igual a zero' };
  if (!dataValida(b.vencimento)) return { erro: 'Informe a data de vencimento' };
  return { descricao, valor, vencimento: b.vencimento };
}

function validarFixa(b = {}) {
  const descricao = texto(b.descricao);
  if (!descricao) return { erro: 'Preencha o nome da conta' };
  const valor = valorValido(b.valor);
  if (valor === null) return { erro: 'Informe um valor maior ou igual a zero' };
  const dia = Number(b.dia);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { erro: 'O dia de vencimento deve ser de 1 a 31' };
  return { descricao, valor, dia };
}

// ---------- Contas fixas: gera as contas do mês ----------
// Cada conta fixa ativa gera uma conta por mês, uma única vez.
// Se o usuário excluir a conta gerada, ela não volta naquele mês.
function gerarContasFixas(mes = mesAtual()) {
  const fixas = db.prepare('SELECT * FROM contas_fixas WHERE ativa = 1 AND inicio <= ?').all(mes);
  if (!fixas.length) return;
  const jaGerada = db.prepare('SELECT 1 FROM contas_fixas_geradas WHERE fixa_id = ? AND mes = ?');
  const marcar = db.prepare('INSERT INTO contas_fixas_geradas (fixa_id, mes) VALUES (?, ?)');
  const criar = db.prepare('INSERT INTO contas (descricao, valor, vencimento, fixa_id, usuario_id) VALUES (?, ?, ?, ?, ?)');
  db.transacao(() => {
    for (const f of fixas) {
      if (jaGerada.get(f.id, mes)) continue;
      const dia = Math.min(f.dia, ultimoDia(mes));
      criar.run(f.descricao, f.valor, `${mes}-${String(dia).padStart(2, '0')}`, f.id, f.usuario_id);
      marcar.run(f.id, mes);
    }
  });
}

// ---------- Transações ----------
r.get('/transacoes', exigir('pf.financas'), (req, res) => {
  const { mes } = req.query;
  if (mes && !mesValido(mes)) return erro(res, 'Mês inválido');
  const uid = req.usuario.id;
  res.json(
    mes
      ? db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? AND substr(data,1,7) = ? ORDER BY data DESC, id DESC').all(uid, mes)
      : db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? ORDER BY data DESC, id DESC').all(uid)
  );
});

r.post('/transacoes', exigir('pf.financas.editar'), (req, res) => {
  const t = validarTransacao(req.body);
  if (t.erro) return erro(res, t.erro);
  const info = db
    .prepare('INSERT INTO transacoes (descricao, valor, tipo, categoria, data, usuario_id) VALUES (?, ?, ?, ?, ?, ?)')
    .run(t.descricao, t.valor, t.tipo, t.categoria, t.data, req.usuario.id);
  res.status(201).json(meu('transacoes', info.lastInsertRowid, req.usuario.id));
});

r.put('/transacoes/:id', exigir('pf.financas.editar'), (req, res) => {
  const uid = req.usuario.id;
  if (!meu('transacoes', req.params.id, uid)) return erro(res, 'Lançamento não encontrado', 404);
  const t = validarTransacao(req.body);
  if (t.erro) return erro(res, t.erro);
  db.prepare('UPDATE transacoes SET descricao=?, valor=?, tipo=?, categoria=?, data=? WHERE id=? AND usuario_id=?')
    .run(t.descricao, t.valor, t.tipo, t.categoria, t.data, req.params.id, uid);
  res.json(meu('transacoes', req.params.id, uid));
});

r.delete('/transacoes/:id', exigir('pf.financas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const t = meu('transacoes', req.params.id, uid);
  if (!t) return erro(res, 'Lançamento não encontrado', 404);
  db.transacao(() => {
    db.prepare('DELETE FROM transacoes WHERE id = ?').run(t.id);
    // Lançamento de pagamento de conta: a conta volta a ficar em aberto
    if (t.conta_id) db.prepare('UPDATE contas SET paga = 0, pago_em = NULL WHERE id = ? AND usuario_id = ?').run(t.conta_id, uid);
  });
  res.status(204).end();
});

r.get('/categorias', exigir('pf.financas'), (req, res) => {
  const padrao = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Contas', 'Outros'];
  const usadas = db.prepare('SELECT DISTINCT categoria FROM transacoes WHERE usuario_id = ?').all(req.usuario.id).map((x) => x.categoria);
  res.json([...new Set([...padrao, ...usadas])].sort((a, b) => a.localeCompare(b, 'pt-BR')));
});

r.get('/exportar', exigir('pf.financas.exportar'), (req, res) => {
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');
  const linhas = db
    .prepare('SELECT * FROM transacoes WHERE usuario_id = ? AND substr(data,1,7) = ? ORDER BY data ASC, id ASC')
    .all(req.usuario.id, mes);
  let receitas = 0;
  let despesas = 0;
  const corpo = linhas.map((t) => {
    if (t.tipo === 'receita') receitas += t.valor;
    else despesas += t.valor;
    return [csv.data(t.data), csv.cel(t.descricao), csv.cel(t.categoria), t.tipo === 'receita' ? 'Receita' : 'Despesa',
      csv.num(t.tipo === 'receita' ? t.valor : -t.valor)].join(';');
  });
  csv.enviar(res, `lancamentos-${mes}.csv`, [
    'Data;Descrição;Categoria;Tipo;Valor (R$)',
    ...corpo,
    '',
    `;;;Total de receitas;${csv.num(receitas)}`,
    `;;;Total de despesas;${csv.num(-despesas)}`,
    `;;;Saldo;${csv.num(receitas - despesas)}`,
  ]);
});

// ---------- Tarefas ----------
r.get('/tarefas', exigir('pf.tarefas', 'pf.visao'), (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT * FROM tarefas WHERE usuario_id = ? ORDER BY concluida ASC,
         CASE WHEN prazo IS NULL THEN 1 ELSE 0 END, prazo ASC,
         CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, id DESC`
      )
      .all(req.usuario.id)
  );
});

r.post('/tarefas', exigir('pf.tarefas.editar'), (req, res) => {
  const t = validarTarefa(req.body);
  if (t.erro) return erro(res, t.erro);
  const info = db
    .prepare('INSERT INTO tarefas (titulo, prazo, prioridade, usuario_id) VALUES (?, ?, ?, ?)')
    .run(t.titulo, t.prazo, t.prioridade, req.usuario.id);
  res.status(201).json(meu('tarefas', info.lastInsertRowid, req.usuario.id));
});

r.put('/tarefas/:id', exigir('pf.tarefas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const atual = meu('tarefas', req.params.id, uid);
  if (!atual) return erro(res, 'Tarefa não encontrada', 404);
  const t = validarTarefa(req.body);
  if (t.erro) return erro(res, t.erro);
  const concluida = req.body && 'concluida' in req.body ? (req.body.concluida ? 1 : 0) : atual.concluida;
  db.prepare('UPDATE tarefas SET titulo=?, prazo=?, prioridade=?, concluida=? WHERE id=?')
    .run(t.titulo, t.prazo, t.prioridade, concluida, atual.id);
  res.json(meu('tarefas', atual.id, uid));
});

r.patch('/tarefas/:id', exigir('pf.tarefas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const atual = meu('tarefas', req.params.id, uid);
  if (!atual) return erro(res, 'Tarefa não encontrada', 404);
  const concluida = req.body && 'concluida' in req.body ? (req.body.concluida ? 1 : 0) : atual.concluida;
  db.prepare('UPDATE tarefas SET concluida = ? WHERE id = ?').run(concluida, atual.id);
  res.json(meu('tarefas', atual.id, uid));
});

r.delete('/tarefas/:id', exigir('pf.tarefas.editar'), (req, res) => {
  const info = db.prepare('DELETE FROM tarefas WHERE id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  if (!info.changes) return erro(res, 'Tarefa não encontrada', 404);
  res.status(204).end();
});

// ---------- Contas a pagar ----------
r.get('/contas', exigir('pf.contas'), (req, res) => {
  gerarContasFixas();
  res.json(db.prepare('SELECT * FROM contas WHERE usuario_id = ? ORDER BY paga ASC, vencimento ASC, id DESC').all(req.usuario.id));
});

r.post('/contas', exigir('pf.contas.editar'), (req, res) => {
  const c = validarConta(req.body);
  if (c.erro) return erro(res, c.erro);
  const info = db
    .prepare('INSERT INTO contas (descricao, valor, vencimento, usuario_id) VALUES (?, ?, ?, ?)')
    .run(c.descricao, c.valor, c.vencimento, req.usuario.id);
  res.status(201).json(meu('contas', info.lastInsertRowid, req.usuario.id));
});

r.put('/contas/:id', exigir('pf.contas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const atual = meu('contas', req.params.id, uid);
  if (!atual) return erro(res, 'Conta não encontrada', 404);
  const c = validarConta(req.body);
  if (c.erro) return erro(res, c.erro);
  db.transacao(() => {
    db.prepare('UPDATE contas SET descricao=?, valor=?, vencimento=? WHERE id=?').run(c.descricao, c.valor, c.vencimento, atual.id);
    if (atual.paga) db.prepare('UPDATE transacoes SET descricao=?, valor=? WHERE conta_id=?').run(c.descricao, c.valor, atual.id);
  });
  res.json(meu('contas', atual.id, uid));
});

r.post('/contas/:id/pagar', exigir('pf.contas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const conta = meu('contas', req.params.id, uid);
  if (!conta) return erro(res, 'Conta não encontrada', 404);
  if (conta.paga) return erro(res, 'Esta conta já está paga');
  const d = req.body && dataValida(req.body.data) ? req.body.data : hoje();
  db.transacao(() => {
    db.prepare('UPDATE contas SET paga = 1, pago_em = ? WHERE id = ?').run(d, conta.id);
    db.prepare(
      "INSERT INTO transacoes (descricao, valor, tipo, categoria, data, conta_id, usuario_id) VALUES (?, ?, 'despesa', 'Contas', ?, ?, ?)"
    ).run(conta.descricao, conta.valor, d, conta.id, uid);
  });
  res.json(meu('contas', conta.id, uid));
});

r.post('/contas/:id/desfazer', exigir('pf.contas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const conta = meu('contas', req.params.id, uid);
  if (!conta) return erro(res, 'Conta não encontrada', 404);
  if (!conta.paga) return erro(res, 'Esta conta ainda não foi paga');
  db.transacao(() => {
    db.prepare('UPDATE contas SET paga = 0, pago_em = NULL WHERE id = ?').run(conta.id);
    db.prepare('DELETE FROM transacoes WHERE conta_id = ? AND usuario_id = ?').run(conta.id, uid);
  });
  res.json(meu('contas', conta.id, uid));
});

r.delete('/contas/:id', exigir('pf.contas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const conta = meu('contas', req.params.id, uid);
  if (!conta) return erro(res, 'Conta não encontrada', 404);
  db.transacao(() => {
    db.prepare('DELETE FROM contas WHERE id = ?').run(conta.id);
    db.prepare('UPDATE transacoes SET conta_id = NULL WHERE conta_id = ?').run(conta.id);
  });
  res.status(204).end();
});

// ---------- Contas fixas ----------
r.get('/contas-fixas', exigir('pf.contas'), (req, res) => {
  res.json(db.prepare('SELECT * FROM contas_fixas WHERE usuario_id = ? ORDER BY ativa DESC, dia ASC, descricao ASC').all(req.usuario.id));
});

r.post('/contas-fixas', exigir('pf.contas.editar'), (req, res) => {
  const f = validarFixa(req.body);
  if (f.erro) return erro(res, f.erro);
  // Se o dia de vencimento deste mês já passou, a primeira conta é a do mês que vem
  const inicio = mesValido(req.body.inicio)
    ? req.body.inicio
    : f.dia < new Date().getDate()
    ? somarMeses(mesAtual(), 1)
    : mesAtual();
  const info = db
    .prepare('INSERT INTO contas_fixas (descricao, valor, dia, inicio, usuario_id) VALUES (?, ?, ?, ?, ?)')
    .run(f.descricao, f.valor, f.dia, inicio, req.usuario.id);
  gerarContasFixas();
  res.status(201).json(meu('contas_fixas', info.lastInsertRowid, req.usuario.id));
});

r.put('/contas-fixas/:id', exigir('pf.contas.editar'), (req, res) => {
  const uid = req.usuario.id;
  const atual = meu('contas_fixas', req.params.id, uid);
  if (!atual) return erro(res, 'Conta fixa não encontrada', 404);
  const f = validarFixa(req.body);
  if (f.erro) return erro(res, f.erro);
  const ativa = req.body && 'ativa' in req.body ? (req.body.ativa ? 1 : 0) : atual.ativa;
  db.prepare('UPDATE contas_fixas SET descricao=?, valor=?, dia=?, ativa=? WHERE id=?').run(f.descricao, f.valor, f.dia, ativa, atual.id);
  gerarContasFixas();
  res.json(meu('contas_fixas', atual.id, uid));
});

r.delete('/contas-fixas/:id', exigir('pf.contas.editar'), (req, res) => {
  const info = db.prepare('DELETE FROM contas_fixas WHERE id = ? AND usuario_id = ?').run(req.params.id, req.usuario.id);
  if (!info.changes) return erro(res, 'Conta fixa não encontrada', 404);
  db.prepare('DELETE FROM contas_fixas_geradas WHERE fixa_id = ?').run(req.params.id);
  res.status(204).end();
});

// ---------- Resumo (Visão geral) ----------
r.get('/resumo', exigir('pf.visao'), (req, res) => {
  gerarContasFixas();
  const uid = req.usuario.id;
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');

  const totaisDoMes = db.prepare(
    `SELECT COALESCE(SUM(CASE WHEN tipo='receita' THEN valor END),0) AS receitas,
            COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor END),0) AS despesas
     FROM transacoes WHERE usuario_id = ? AND substr(data,1,7) = ?`
  );
  const tot = totaisDoMes.get(uid, mes);
  const historico = [];
  for (let i = 5; i >= 0; i--) {
    const m = somarMeses(mes, -i);
    const t = totaisDoMes.get(uid, m);
    historico.push({ mes: m, receitas: t.receitas, despesas: t.despesas });
  }
  const porCategoria = db
    .prepare(
      `SELECT categoria, SUM(valor) AS total FROM transacoes
       WHERE usuario_id = ? AND tipo='despesa' AND substr(data,1,7) = ? GROUP BY categoria ORDER BY total DESC`
    )
    .all(uid, mes);

  const h = hoje();
  const em7 = fmt(new Date(Date.now() + 7 * 864e5));
  const contas = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN vencimento < ? THEN 1 END),0) AS vencidas,
              COALESCE(SUM(CASE WHEN vencimento BETWEEN ? AND ? THEN 1 END),0) AS proximas,
              COALESCE(SUM(valor),0) AS total_aberto, COUNT(*) AS abertas
       FROM contas WHERE usuario_id = ? AND paga = 0`
    )
    .get(h, h, em7, uid);
  const proximasContas = db.prepare('SELECT * FROM contas WHERE usuario_id = ? AND paga = 0 ORDER BY vencimento ASC LIMIT 5').all(uid);
  const tarefas = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN concluida=0 THEN 1 END),0) AS pendentes,
              COALESCE(SUM(CASE WHEN concluida=0 AND prazo < ? THEN 1 END),0) AS atrasadas,
              COALESCE(SUM(CASE WHEN concluida=1 THEN 1 END),0) AS concluidas
       FROM tarefas WHERE usuario_id = ?`
    )
    .get(h, uid);
  const proximasTarefas = db
    .prepare(
      `SELECT * FROM tarefas WHERE usuario_id = ? AND concluida = 0
       ORDER BY CASE WHEN prazo IS NULL THEN 1 ELSE 0 END, prazo ASC,
       CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END LIMIT 5`
    )
    .all(uid);

  res.json({
    mes, receitas: tot.receitas, despesas: tot.despesas, saldo: tot.receitas - tot.despesas,
    historico, porCategoria, contas, proximasContas, tarefas, proximasTarefas,
  });
});

module.exports = r;
module.exports.gerarContasFixas = gerarContasFixas;
