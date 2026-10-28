const { test, before, after } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-test-'));
process.env.DB_FILE = path.join(tmp, 'test.db');
const app = require('../src/server');

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}`; r(); }); }));
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const req = async (url, method = 'GET', body) => {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: res.status, json: res.status === 204 ? null : await res.json() };
};

test('finanças: cria receita e despesa e calcula saldo', async () => {
  const mes = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  const data = `${mes}-01`;
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'Salário', valor: 5000, tipo: 'receita', categoria: 'Salário', data })).status, 201);
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'Mercado', valor: 800.5, tipo: 'despesa', categoria: 'Alimentação', data })).status, 201);
  const { json } = await req(`/api/resumo?mes=${mes}`);
  assert.equal(json.receitas, 5000);
  assert.equal(json.despesas, 800.5);
  assert.equal(json.saldo, 4199.5);
  assert.equal(json.porCategoria[0].categoria, 'Alimentação');
});

test('finanças: rejeita dados inválidos', async () => {
  assert.equal((await req('/api/transacoes', 'POST', { descricao: '', valor: 10, tipo: 'despesa' })).status, 400);
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'X', valor: -1, tipo: 'despesa' })).status, 400);
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'X', valor: 1, tipo: 'outro' })).status, 400);
});

test('tarefas: cria, conclui e exclui', async () => {
  const { json: t } = await req('/api/tarefas', 'POST', { titulo: 'Pagar IPTU', prazo: '2020-01-01', prioridade: 'alta' });
  let r = await req('/api/resumo');
  assert.equal(r.json.tarefas.atrasadas, 1);
  const { json: feita } = await req(`/api/tarefas/${t.id}`, 'PATCH', { concluida: true });
  assert.equal(feita.concluida, 1);
  r = await req('/api/resumo');
  assert.equal(r.json.tarefas.pendentes, 0);
  assert.equal((await req(`/api/tarefas/${t.id}`, 'DELETE')).status, 204);
});

test('contas: pagar lança despesa nas finanças', async () => {
  const { json: c } = await req('/api/contas', 'POST', { descricao: 'Conta de luz', valor: 150, vencimento: '2020-01-10' });
  let r = await req('/api/resumo');
  assert.equal(r.json.contas.vencidas, 1);
  const antes = r.json.despesas;
  const { json: paga } = await req(`/api/contas/${c.id}/pagar`, 'POST');
  assert.equal(paga.paga, 1);
  r = await req('/api/resumo');
  assert.equal(r.json.despesas, antes + 150);
  assert.equal(r.json.contas.vencidas, 0);
  assert.equal((await req(`/api/contas/${c.id}/pagar`, 'POST')).status, 400);
});
