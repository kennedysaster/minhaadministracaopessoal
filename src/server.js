const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Datas no fuso local (AAAA-MM-DD)
const fmt = (d) => d.toLocaleDateString('sv-SE');
const hoje = () => fmt(new Date());
const dataValida = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const erro = (res, msg, status = 400) => res.status(status).json({ erro: msg });

// ---------- Transações (finanças) ----------
app.get('/api/transacoes', (req, res) => {
  const { mes } = req.query; // formato AAAA-MM
  if (mes) {
    return res.json(
      db.prepare("SELECT * FROM transacoes WHERE substr(data,1,7) = ? ORDER BY data DESC, id DESC").all(mes)
    );
  }
  res.json(db.prepare('SELECT * FROM transacoes ORDER BY data DESC, id DESC').all());
});

app.post('/api/transacoes', (req, res) => {
  const { descricao, valor, tipo, categoria, data } = req.body || {};
  if (!descricao || !String(descricao).trim()) return erro(res, 'Descrição é obrigatória');
  const v = Number(valor);
  if (!Number.isFinite(v) || v < 0) return erro(res, 'Valor inválido');
  if (!['receita', 'despesa'].includes(tipo)) return erro(res, 'Tipo deve ser receita ou despesa');
  const d = data || hoje();
  if (!dataValida(d)) return erro(res, 'Data inválida (use AAAA-MM-DD)');
  const info = db
    .prepare('INSERT INTO transacoes (descricao, valor, tipo, categoria, data) VALUES (?, ?, ?, ?, ?)')
    .run(String(descricao).trim(), v, tipo, (categoria || 'Outros').trim() || 'Outros', d);
  res.status(201).json(db.prepare('SELECT * FROM transacoes WHERE id = ?').get(info.lastInsertRowid));
});

app.delete('/api/transacoes/:id', (req, res) => {
  const info = db.prepare('DELETE FROM transacoes WHERE id = ?').run(req.params.id);
  if (!info.changes) return erro(res, 'Não encontrada', 404);
  res.status(204).end();
});

// ---------- Tarefas ----------
app.get('/api/tarefas', (req, res) => {
  res.json(
    db
      .prepare(
        `SELECT * FROM tarefas ORDER BY concluida ASC,
         CASE WHEN prazo IS NULL THEN 1 ELSE 0 END, prazo ASC,
         CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, id DESC`
      )
      .all()
  );
});

app.post('/api/tarefas', (req, res) => {
  const { titulo, prazo, prioridade } = req.body || {};
  if (!titulo || !String(titulo).trim()) return erro(res, 'Título é obrigatório');
  if (prazo && !dataValida(prazo)) return erro(res, 'Prazo inválido (use AAAA-MM-DD)');
  const p = prioridade || 'media';
  if (!['baixa', 'media', 'alta'].includes(p)) return erro(res, 'Prioridade inválida');
  const info = db
    .prepare('INSERT INTO tarefas (titulo, prazo, prioridade) VALUES (?, ?, ?)')
    .run(String(titulo).trim(), prazo || null, p);
  res.status(201).json(db.prepare('SELECT * FROM tarefas WHERE id = ?').get(info.lastInsertRowid));
});

app.patch('/api/tarefas/:id', (req, res) => {
  const atual = db.prepare('SELECT * FROM tarefas WHERE id = ?').get(req.params.id);
  if (!atual) return erro(res, 'Não encontrada', 404);
  const concluida = req.body && 'concluida' in req.body ? (req.body.concluida ? 1 : 0) : atual.concluida;
  db.prepare('UPDATE tarefas SET concluida = ? WHERE id = ?').run(concluida, atual.id);
  res.json(db.prepare('SELECT * FROM tarefas WHERE id = ?').get(atual.id));
});

app.delete('/api/tarefas/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tarefas WHERE id = ?').run(req.params.id);
  if (!info.changes) return erro(res, 'Não encontrada', 404);
  res.status(204).end();
});

// ---------- Contas a pagar ----------
app.get('/api/contas', (req, res) => {
  res.json(db.prepare('SELECT * FROM contas ORDER BY paga ASC, vencimento ASC, id DESC').all());
});

app.post('/api/contas', (req, res) => {
  const { descricao, valor, vencimento } = req.body || {};
  if (!descricao || !String(descricao).trim()) return erro(res, 'Descrição é obrigatória');
  const v = Number(valor);
  if (!Number.isFinite(v) || v < 0) return erro(res, 'Valor inválido');
  if (!dataValida(vencimento)) return erro(res, 'Vencimento inválido (use AAAA-MM-DD)');
  const info = db
    .prepare('INSERT INTO contas (descricao, valor, vencimento) VALUES (?, ?, ?)')
    .run(String(descricao).trim(), v, vencimento);
  res.status(201).json(db.prepare('SELECT * FROM contas WHERE id = ?').get(info.lastInsertRowid));
});

// Marcar como paga: também lança a despesa nas finanças
app.post('/api/contas/:id/pagar', (req, res) => {
  const conta = db.prepare('SELECT * FROM contas WHERE id = ?').get(req.params.id);
  if (!conta) return erro(res, 'Não encontrada', 404);
  if (conta.paga) return erro(res, 'Conta já está paga');
  const d = hoje();
  db.transaction(() => {
    db.prepare('UPDATE contas SET paga = 1, pago_em = ? WHERE id = ?').run(d, conta.id);
    db.prepare("INSERT INTO transacoes (descricao, valor, tipo, categoria, data) VALUES (?, ?, 'despesa', 'Contas', ?)")
      .run(conta.descricao, conta.valor, d);
  })();
  res.json(db.prepare('SELECT * FROM contas WHERE id = ?').get(conta.id));
});

app.delete('/api/contas/:id', (req, res) => {
  const info = db.prepare('DELETE FROM contas WHERE id = ?').run(req.params.id);
  if (!info.changes) return erro(res, 'Não encontrada', 404);
  res.status(204).end();
});

// ---------- Resumo do painel ----------
app.get('/api/resumo', (req, res) => {
  const mes = req.query.mes || hoje().slice(0, 7);
  const tot = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN tipo='receita' THEN valor END),0) AS receitas,
         COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor END),0) AS despesas
       FROM transacoes WHERE substr(data,1,7) = ?`
    )
    .get(mes);
  const porCategoria = db
    .prepare(
      `SELECT categoria, SUM(valor) AS total FROM transacoes
       WHERE tipo='despesa' AND substr(data,1,7) = ?
       GROUP BY categoria ORDER BY total DESC`
    )
    .all(mes);
  const h = hoje();
  const em7 = fmt(new Date(Date.now() + 7 * 864e5));
  const contas = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN vencimento < ? THEN 1 END),0) AS vencidas,
         COALESCE(SUM(CASE WHEN vencimento BETWEEN ? AND ? THEN 1 END),0) AS proximas,
         COALESCE(SUM(valor),0) AS total_aberto
       FROM contas WHERE paga = 0`
    )
    .get(h, h, em7);
  const tarefas = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN concluida=0 THEN 1 END),0) AS pendentes,
         COALESCE(SUM(CASE WHEN concluida=0 AND prazo < ? THEN 1 END),0) AS atrasadas,
         COALESCE(SUM(CASE WHEN concluida=1 THEN 1 END),0) AS concluidas
       FROM tarefas`
    )
    .get(h);
  res.json({
    mes,
    receitas: tot.receitas,
    despesas: tot.despesas,
    saldo: tot.receitas - tot.despesas,
    porCategoria,
    contas,
    tarefas,
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Painel rodando em http://localhost:${PORT}`));
}

module.exports = app;
