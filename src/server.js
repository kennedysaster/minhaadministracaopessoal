const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- Utilidades ----------
const fmt = (d) => d.toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
const hoje = () => fmt(new Date());
const mesAtual = () => hoje().slice(0, 7);
const dataValida = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const mesValido = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const texto = (s) => (s == null ? '' : String(s).trim());
const erro = (res, msg, status = 400) => res.status(status).json({ erro: msg });
const pegar = (tabela, id) => db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
const somarMeses = (mes, n) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const ultimoDia = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
};

// ---------- Validações ----------
function validarTransacao(b = {}) {
  const descricao = texto(b.descricao);
  if (!descricao) return { erro: 'Preencha a descrição' };
  const valor = Number(b.valor);
  if (!Number.isFinite(valor) || valor < 0) return { erro: 'Informe um valor maior ou igual a zero' };
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
  const valor = Number(b.valor);
  if (!Number.isFinite(valor) || valor < 0) return { erro: 'Informe um valor maior ou igual a zero' };
  if (!dataValida(b.vencimento)) return { erro: 'Informe a data de vencimento' };
  return { descricao, valor, vencimento: b.vencimento };
}

function validarFixa(b = {}) {
  const descricao = texto(b.descricao);
  if (!descricao) return { erro: 'Preencha o nome da conta' };
  const valor = Number(b.valor);
  if (!Number.isFinite(valor) || valor < 0) return { erro: 'Informe um valor maior ou igual a zero' };
  const dia = Number(b.dia);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { erro: 'O dia de vencimento deve ser de 1 a 31' };
  return { descricao, valor, dia };
}

// ---------- Contas fixas: gera as contas do mês ----------
// Cada conta fixa ativa gera uma conta a pagar por mês, uma única vez.
// Se o usuário excluir a conta gerada, ela não volta a ser criada naquele mês.
function gerarContasFixas(mes = mesAtual()) {
  const fixas = db.prepare('SELECT * FROM contas_fixas WHERE ativa = 1 AND inicio <= ?').all(mes);
  if (!fixas.length) return;
  const jaGerada = db.prepare('SELECT 1 FROM contas_fixas_geradas WHERE fixa_id = ? AND mes = ?');
  const marcar = db.prepare('INSERT INTO contas_fixas_geradas (fixa_id, mes) VALUES (?, ?)');
  const criar = db.prepare('INSERT INTO contas (descricao, valor, vencimento, fixa_id) VALUES (?, ?, ?, ?)');
  db.transacao(() => {
    for (const f of fixas) {
      if (jaGerada.get(f.id, mes)) continue;
      const dia = Math.min(f.dia, ultimoDia(mes));
      criar.run(f.descricao, f.valor, `${mes}-${String(dia).padStart(2, '0')}`, f.id);
      marcar.run(f.id, mes);
    }
  });
}

// ---------- Transações (finanças) ----------
app.get('/api/transacoes', (req, res) => {
  const { mes } = req.query;
  if (mes && !mesValido(mes)) return erro(res, 'Mês inválido');
  const sql = mes
    ? 'SELECT * FROM transacoes WHERE substr(data,1,7) = ? ORDER BY data DESC, id DESC'
    : 'SELECT * FROM transacoes ORDER BY data DESC, id DESC';
  res.json(mes ? db.prepare(sql).all(mes) : db.prepare(sql).all());
});

app.post('/api/transacoes', (req, res) => {
  const t = validarTransacao(req.body);
  if (t.erro) return erro(res, t.erro);
  const info = db
    .prepare('INSERT INTO transacoes (descricao, valor, tipo, categoria, data) VALUES (?, ?, ?, ?, ?)')
    .run(t.descricao, t.valor, t.tipo, t.categoria, t.data);
  res.status(201).json(pegar('transacoes', info.lastInsertRowid));
});

app.put('/api/transacoes/:id', (req, res) => {
  if (!pegar('transacoes', req.params.id)) return erro(res, 'Lançamento não encontrado', 404);
  const t = validarTransacao(req.body);
  if (t.erro) return erro(res, t.erro);
  db.prepare('UPDATE transacoes SET descricao=?, valor=?, tipo=?, categoria=?, data=? WHERE id=?')
    .run(t.descricao, t.valor, t.tipo, t.categoria, t.data, req.params.id);
  res.json(pegar('transacoes', req.params.id));
});

app.delete('/api/transacoes/:id', (req, res) => {
  const t = pegar('transacoes', req.params.id);
  if (!t) return erro(res, 'Lançamento não encontrado', 404);
  db.transacao(() => {
    db.prepare('DELETE FROM transacoes WHERE id = ?').run(t.id);
    // Se o lançamento veio do pagamento de uma conta, a conta volta a ficar em aberto
    if (t.conta_id) db.prepare('UPDATE contas SET paga = 0, pago_em = NULL WHERE id = ?').run(t.conta_id);
  });
  res.status(204).end();
});

app.get('/api/categorias', (req, res) => {
  const padrao = ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Contas', 'Outros'];
  const usadas = db.prepare('SELECT DISTINCT categoria FROM transacoes').all().map((r) => r.categoria);
  res.json([...new Set([...padrao, ...usadas])].sort((a, b) => a.localeCompare(b, 'pt-BR')));
});

// Exporta os lançamentos do mês em CSV que abre direto no Excel (separador ; e vírgula decimal)
app.get('/api/exportar', (req, res) => {
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');
  const linhas = db
    .prepare('SELECT * FROM transacoes WHERE substr(data,1,7) = ? ORDER BY data ASC, id ASC')
    .all(mes);
  const cel = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const num = (v) => v.toFixed(2).replace('.', ',');
  const dataBR = (s) => s.split('-').reverse().join('/');
  let receitas = 0;
  let despesas = 0;
  const corpo = linhas.map((t) => {
    if (t.tipo === 'receita') receitas += t.valor;
    else despesas += t.valor;
    const valor = t.tipo === 'receita' ? t.valor : -t.valor;
    return [dataBR(t.data), cel(t.descricao), cel(t.categoria), t.tipo === 'receita' ? 'Receita' : 'Despesa', num(valor)].join(';');
  });
  const csv = [
    'Data;Descrição;Categoria;Tipo;Valor (R$)',
    ...corpo,
    '',
    `;;;Total de receitas;${num(receitas)}`,
    `;;;Total de despesas;${num(-despesas)}`,
    `;;;Saldo;${num(receitas - despesas)}`,
  ].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="lancamentos-${mes}.csv"`);
  res.send('﻿' + csv);
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
  const t = validarTarefa(req.body);
  if (t.erro) return erro(res, t.erro);
  const info = db
    .prepare('INSERT INTO tarefas (titulo, prazo, prioridade) VALUES (?, ?, ?)')
    .run(t.titulo, t.prazo, t.prioridade);
  res.status(201).json(pegar('tarefas', info.lastInsertRowid));
});

app.put('/api/tarefas/:id', (req, res) => {
  const atual = pegar('tarefas', req.params.id);
  if (!atual) return erro(res, 'Tarefa não encontrada', 404);
  const t = validarTarefa(req.body);
  if (t.erro) return erro(res, t.erro);
  const concluida = req.body && 'concluida' in req.body ? (req.body.concluida ? 1 : 0) : atual.concluida;
  db.prepare('UPDATE tarefas SET titulo=?, prazo=?, prioridade=?, concluida=? WHERE id=?')
    .run(t.titulo, t.prazo, t.prioridade, concluida, atual.id);
  res.json(pegar('tarefas', atual.id));
});

app.patch('/api/tarefas/:id', (req, res) => {
  const atual = pegar('tarefas', req.params.id);
  if (!atual) return erro(res, 'Tarefa não encontrada', 404);
  const concluida = req.body && 'concluida' in req.body ? (req.body.concluida ? 1 : 0) : atual.concluida;
  db.prepare('UPDATE tarefas SET concluida = ? WHERE id = ?').run(concluida, atual.id);
  res.json(pegar('tarefas', atual.id));
});

app.delete('/api/tarefas/:id', (req, res) => {
  const info = db.prepare('DELETE FROM tarefas WHERE id = ?').run(req.params.id);
  if (!info.changes) return erro(res, 'Tarefa não encontrada', 404);
  res.status(204).end();
});

// ---------- Contas a pagar ----------
app.get('/api/contas', (req, res) => {
  gerarContasFixas();
  res.json(db.prepare('SELECT * FROM contas ORDER BY paga ASC, vencimento ASC, id DESC').all());
});

app.post('/api/contas', (req, res) => {
  const c = validarConta(req.body);
  if (c.erro) return erro(res, c.erro);
  const info = db
    .prepare('INSERT INTO contas (descricao, valor, vencimento) VALUES (?, ?, ?)')
    .run(c.descricao, c.valor, c.vencimento);
  res.status(201).json(pegar('contas', info.lastInsertRowid));
});

app.put('/api/contas/:id', (req, res) => {
  const atual = pegar('contas', req.params.id);
  if (!atual) return erro(res, 'Conta não encontrada', 404);
  const c = validarConta(req.body);
  if (c.erro) return erro(res, c.erro);
  db.transacao(() => {
    db.prepare('UPDATE contas SET descricao=?, valor=?, vencimento=? WHERE id=?')
      .run(c.descricao, c.valor, c.vencimento, atual.id);
    // Mantém o lançamento do pagamento em sincronia com a conta
    if (atual.paga) {
      db.prepare('UPDATE transacoes SET descricao=?, valor=? WHERE conta_id=?').run(c.descricao, c.valor, atual.id);
    }
  });
  res.json(pegar('contas', atual.id));
});

// Pagar: marca a conta e lança a despesa nas finanças
app.post('/api/contas/:id/pagar', (req, res) => {
  const conta = pegar('contas', req.params.id);
  if (!conta) return erro(res, 'Conta não encontrada', 404);
  if (conta.paga) return erro(res, 'Esta conta já está paga');
  const d = req.body && dataValida(req.body.data) ? req.body.data : hoje();
  db.transacao(() => {
    db.prepare('UPDATE contas SET paga = 1, pago_em = ? WHERE id = ?').run(d, conta.id);
    db.prepare(
      "INSERT INTO transacoes (descricao, valor, tipo, categoria, data, conta_id) VALUES (?, ?, 'despesa', 'Contas', ?, ?)"
    ).run(conta.descricao, conta.valor, d, conta.id);
  });
  res.json(pegar('contas', conta.id));
});

// Desfazer pagamento: volta a conta para aberta e remove o lançamento gerado
app.post('/api/contas/:id/desfazer', (req, res) => {
  const conta = pegar('contas', req.params.id);
  if (!conta) return erro(res, 'Conta não encontrada', 404);
  if (!conta.paga) return erro(res, 'Esta conta ainda não foi paga');
  db.transacao(() => {
    db.prepare('UPDATE contas SET paga = 0, pago_em = NULL WHERE id = ?').run(conta.id);
    db.prepare('DELETE FROM transacoes WHERE conta_id = ?').run(conta.id);
  });
  res.json(pegar('contas', conta.id));
});

app.delete('/api/contas/:id', (req, res) => {
  const conta = pegar('contas', req.params.id);
  if (!conta) return erro(res, 'Conta não encontrada', 404);
  db.transacao(() => {
    db.prepare('DELETE FROM contas WHERE id = ?').run(conta.id);
    // O lançamento do pagamento continua em Finanças, apenas sem vínculo
    db.prepare('UPDATE transacoes SET conta_id = NULL WHERE conta_id = ?').run(conta.id);
  });
  res.status(204).end();
});

// ---------- Contas fixas ----------
app.get('/api/contas-fixas', (req, res) => {
  res.json(db.prepare('SELECT * FROM contas_fixas ORDER BY ativa DESC, dia ASC, descricao ASC').all());
});

app.post('/api/contas-fixas', (req, res) => {
  const f = validarFixa(req.body);
  if (f.erro) return erro(res, f.erro);
  // Se o dia de vencimento deste mês já passou, a primeira conta é a do mês que vem
  const inicio = mesValido(req.body.inicio)
    ? req.body.inicio
    : f.dia < new Date().getDate()
    ? somarMeses(mesAtual(), 1)
    : mesAtual();
  const info = db
    .prepare('INSERT INTO contas_fixas (descricao, valor, dia, inicio) VALUES (?, ?, ?, ?)')
    .run(f.descricao, f.valor, f.dia, inicio);
  gerarContasFixas();
  res.status(201).json(pegar('contas_fixas', info.lastInsertRowid));
});

// Alterar vale para os próximos meses; contas já geradas não mudam
app.put('/api/contas-fixas/:id', (req, res) => {
  const atual = pegar('contas_fixas', req.params.id);
  if (!atual) return erro(res, 'Conta fixa não encontrada', 404);
  const f = validarFixa(req.body);
  if (f.erro) return erro(res, f.erro);
  const ativa = req.body && 'ativa' in req.body ? (req.body.ativa ? 1 : 0) : atual.ativa;
  db.prepare('UPDATE contas_fixas SET descricao=?, valor=?, dia=?, ativa=? WHERE id=?')
    .run(f.descricao, f.valor, f.dia, ativa, atual.id);
  gerarContasFixas();
  res.json(pegar('contas_fixas', atual.id));
});

app.delete('/api/contas-fixas/:id', (req, res) => {
  const info = db.prepare('DELETE FROM contas_fixas WHERE id = ?').run(req.params.id);
  if (!info.changes) return erro(res, 'Conta fixa não encontrada', 404);
  db.prepare('DELETE FROM contas_fixas_geradas WHERE fixa_id = ?').run(req.params.id);
  res.status(204).end();
});

// ---------- Resumo (tela Início) ----------
app.get('/api/resumo', (req, res) => {
  gerarContasFixas();
  const mes = req.query.mes || mesAtual();
  if (!mesValido(mes)) return erro(res, 'Mês inválido');

  const totaisDoMes = db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo='receita' THEN valor END),0) AS receitas,
       COALESCE(SUM(CASE WHEN tipo='despesa' THEN valor END),0) AS despesas
     FROM transacoes WHERE substr(data,1,7) = ?`
  );
  const tot = totaisDoMes.get(mes);

  const historico = [];
  for (let i = 5; i >= 0; i--) {
    const m = somarMeses(mes, -i);
    const t = totaisDoMes.get(m);
    historico.push({ mes: m, receitas: t.receitas, despesas: t.despesas });
  }

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
         COALESCE(SUM(valor),0) AS total_aberto,
         COUNT(*) AS abertas
       FROM contas WHERE paga = 0`
    )
    .get(h, h, em7);
  const proximasContas = db
    .prepare('SELECT * FROM contas WHERE paga = 0 ORDER BY vencimento ASC LIMIT 5')
    .all();

  const tarefas = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN concluida=0 THEN 1 END),0) AS pendentes,
         COALESCE(SUM(CASE WHEN concluida=0 AND prazo < ? THEN 1 END),0) AS atrasadas,
         COALESCE(SUM(CASE WHEN concluida=1 THEN 1 END),0) AS concluidas
       FROM tarefas`
    )
    .get(h);
  const proximasTarefas = db
    .prepare(
      `SELECT * FROM tarefas WHERE concluida = 0
       ORDER BY CASE WHEN prazo IS NULL THEN 1 ELSE 0 END, prazo ASC,
       CASE prioridade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END LIMIT 5`
    )
    .all();

  res.json({
    mes,
    receitas: tot.receitas,
    despesas: tot.despesas,
    saldo: tot.receitas - tot.despesas,
    historico,
    porCategoria,
    contas,
    proximasContas,
    tarefas,
    proximasTarefas,
  });
});

// Rotas da API inexistentes respondem em JSON
app.use('/api', (req, res) => erro(res, 'Rota não encontrada', 404));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Painel rodando em http://localhost:${PORT}`));
}

module.exports = app;
module.exports.gerarContasFixas = gerarContasFixas;
