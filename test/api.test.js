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

test('edição: altera lançamento, tarefa e conta', async () => {
  const { json: t } = await req('/api/transacoes', 'POST', { descricao: 'Padaria', valor: 10, tipo: 'despesa', data: '2026-01-05' });
  const { status, json: t2 } = await req(`/api/transacoes/${t.id}`, 'PUT', { descricao: 'Padaria do bairro', valor: 12.5, tipo: 'despesa', categoria: 'Alimentação', data: '2026-01-06' });
  assert.equal(status, 200);
  assert.equal(t2.valor, 12.5);
  assert.equal(t2.categoria, 'Alimentação');
  assert.equal((await req(`/api/transacoes/${t.id}`, 'PUT', { descricao: '', valor: 1, tipo: 'despesa' })).status, 400);
  assert.equal((await req('/api/transacoes/99999', 'PUT', { descricao: 'x', valor: 1, tipo: 'despesa' })).status, 404);

  const { json: tf } = await req('/api/tarefas', 'POST', { titulo: 'Ligar banco' });
  const { json: tf2 } = await req(`/api/tarefas/${tf.id}`, 'PUT', { titulo: 'Ligar para o banco', prioridade: 'alta', prazo: '2026-12-01' });
  assert.equal(tf2.titulo, 'Ligar para o banco');
  assert.equal(tf2.prioridade, 'alta');

  const { json: c } = await req('/api/contas', 'POST', { descricao: 'Gás', valor: 90, vencimento: '2026-12-10' });
  await req(`/api/contas/${c.id}/pagar`, 'POST');
  await req(`/api/contas/${c.id}`, 'PUT', { descricao: 'Gás de cozinha', valor: 95, vencimento: '2026-12-10' });
  const lanc = (await req('/api/transacoes')).json.find((x) => x.conta_id === c.id);
  assert.equal(lanc.descricao, 'Gás de cozinha');
  assert.equal(lanc.valor, 95);
});

test('contas: desfazer pagamento remove o lançamento', async () => {
  const { json: c } = await req('/api/contas', 'POST', { descricao: 'Condomínio', valor: 400, vencimento: '2026-11-05' });
  await req(`/api/contas/${c.id}/pagar`, 'POST');
  assert.ok((await req('/api/transacoes')).json.some((x) => x.conta_id === c.id));
  const { json: aberta } = await req(`/api/contas/${c.id}/desfazer`, 'POST');
  assert.equal(aberta.paga, 0);
  assert.ok(!(await req('/api/transacoes')).json.some((x) => x.conta_id === c.id));
  assert.equal((await req(`/api/contas/${c.id}/desfazer`, 'POST')).status, 400);
});

test('contas fixas: gera uma conta por mês, sem duplicar', async () => {
  const mes = new Date().toLocaleDateString('sv-SE').slice(0, 7);
  const { status, json: f } = await req('/api/contas-fixas', 'POST', { descricao: 'Internet fibra', valor: 119.9, dia: 31 });
  assert.equal(status, 201);
  let contas = (await req('/api/contas')).json.filter((c) => c.fixa_id === f.id);
  assert.equal(contas.length, 1);
  assert.equal(contas[0].vencimento.slice(0, 7), mes);
  // chamar de novo não duplica
  await req('/api/resumo');
  contas = (await req('/api/contas')).json.filter((c) => c.fixa_id === f.id);
  assert.equal(contas.length, 1);
  // excluir a conta gerada não faz ela voltar no mesmo mês
  await req(`/api/contas/${contas[0].id}`, 'DELETE');
  contas = (await req('/api/contas')).json.filter((c) => c.fixa_id === f.id);
  assert.equal(contas.length, 0);
  // validação
  assert.equal((await req('/api/contas-fixas', 'POST', { descricao: 'X', valor: 1, dia: 40 })).status, 400);
});

test('contas fixas: dia 31 vira o último dia em meses curtos', () => {
  const { gerarContasFixas } = require('../src/server');
  const db = require('../src/db');
  const info = db.prepare("INSERT INTO contas_fixas (descricao, valor, dia, inicio) VALUES ('Aluguel', 1500, 31, '2027-01')").run();
  gerarContasFixas('2027-02');
  const c = db.prepare('SELECT * FROM contas WHERE fixa_id = ?').get(info.lastInsertRowid);
  assert.equal(c.vencimento, '2027-02-28');
  gerarContasFixas('2026-12'); // antes do início: não gera
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contas WHERE fixa_id = ?').get(info.lastInsertRowid).n, 1);
});

test('exportar: CSV com totais para o Excel', async () => {
  await req('/api/transacoes', 'POST', { descricao: 'Freela; site', valor: 1000, tipo: 'receita', data: '2025-03-10' });
  await req('/api/transacoes', 'POST', { descricao: 'Livro "JS"', valor: 80.5, tipo: 'despesa', categoria: 'Educação', data: '2025-03-12' });
  const res = await fetch(`${base}/api/exportar?mes=2025-03`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /lancamentos-2025-03\.csv/);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]); // BOM: acentos certos no Excel
  const txt = bytes.toString('utf8');
  assert.match(txt, /10\/03\/2025;"Freela; site";"Outros";Receita;1000,00/);
  assert.match(txt, /"Livro ""JS""";"Educação";Despesa;-80,50/);
  assert.match(txt, /Saldo;919,50/);
});

test('resumo: traz histórico de 6 meses e próximas contas', async () => {
  const { json } = await req('/api/resumo?mes=2025-03');
  assert.equal(json.historico.length, 6);
  assert.equal(json.historico[5].mes, '2025-03');
  assert.equal(json.historico[0].mes, '2024-10');
  assert.equal(json.historico[5].receitas, 1000);
  assert.ok(Array.isArray(json.proximasContas));
  assert.ok(Array.isArray(json.proximasTarefas));
  assert.equal((await req('/api/resumo?mes=2025-13')).status, 400);
});

test('contas fixas: se o dia já passou, começa no mês que vem', async (t) => {
  if (new Date().getDate() === 1) return t.skip('hoje é dia 1');
  const { json: f } = await req('/api/contas-fixas', 'POST', { descricao: 'Academia', valor: 99, dia: 1 });
  const proximo = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('sv-SE').slice(0, 7);
  assert.equal(f.inicio, proximo);
  const contas = (await req('/api/contas')).json.filter((c) => c.fixa_id === f.id);
  assert.equal(contas.length, 0);
});
