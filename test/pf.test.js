// Pessoa física: finanças, contas e tarefas (cada usuário só vê os próprios dados)
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const h = require('./ajuda');

let req;
before(async () => {
  await h.iniciar();
  req = await h.master();
});
after(() => h.encerrar());

const mesHoje = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);

test('sem login a API responde 401', async () => {
  const anon = h.cliente();
  assert.equal((await anon('/api/transacoes')).status, 401);
  assert.equal((await anon('/api/resumo')).status, 401);
});

test('finanças: cria receita e despesa e calcula saldo', async () => {
  const mes = mesHoje();
  const data = `${mes}-01`;
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'Salário', valor: 5000, tipo: 'receita', categoria: 'Salário', data })).status, 201);
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'Mercado', valor: 800.5, tipo: 'despesa', categoria: 'Alimentação', data })).status, 201);
  const { json } = await req(`/api/resumo?mes=${mes}`);
  assert.equal(json.receitas, 5000);
  assert.equal(json.despesas, 800.5);
  assert.equal(json.saldo, 4199.5);
  assert.equal(json.porCategoria[0].categoria, 'Alimentação');
  assert.equal(json.historico.length, 6);
});

test('finanças: rejeita dados inválidos', async () => {
  assert.equal((await req('/api/transacoes', 'POST', { descricao: '', valor: 10, tipo: 'despesa' })).status, 400);
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'X', valor: -1, tipo: 'despesa' })).status, 400);
  assert.equal((await req('/api/transacoes', 'POST', { descricao: 'X', valor: 1, tipo: 'outro' })).status, 400);
});

test('edição de lançamento, tarefa e conta paga', async () => {
  const { json: t } = await req('/api/transacoes', 'POST', { descricao: 'Padaria', valor: 10, tipo: 'despesa', data: '2026-01-05' });
  const { json: t2 } = await req(`/api/transacoes/${t.id}`, 'PUT', { descricao: 'Padaria do bairro', valor: 12.5, tipo: 'despesa', categoria: 'Alimentação', data: '2026-01-06' });
  assert.equal(t2.valor, 12.5);

  const { json: tf } = await req('/api/tarefas', 'POST', { titulo: 'Ligar banco' });
  const { json: tf2 } = await req(`/api/tarefas/${tf.id}`, 'PUT', { titulo: 'Ligar para o banco', prioridade: 'alta' });
  assert.equal(tf2.prioridade, 'alta');

  const { json: c } = await req('/api/contas', 'POST', { descricao: 'Gás', valor: 90, vencimento: '2026-12-10' });
  await req(`/api/contas/${c.id}/pagar`, 'POST', {});
  await req(`/api/contas/${c.id}`, 'PUT', { descricao: 'Gás de cozinha', valor: 95, vencimento: '2026-12-10' });
  const lanc = (await req('/api/transacoes')).json.find((x) => x.conta_id === c.id);
  assert.equal(lanc.descricao, 'Gás de cozinha');
  assert.equal(lanc.valor, 95);
  // desfazer
  await req(`/api/contas/${c.id}/desfazer`, 'POST', {});
  assert.ok(!(await req('/api/transacoes')).json.some((x) => x.conta_id === c.id));
});

test('contas fixas: gera uma vez por mês e respeita o mês de início', async () => {
  const { json: f } = await req('/api/contas-fixas', 'POST', { descricao: 'Internet', valor: 119.9, dia: 31 });
  let contas = (await req('/api/contas')).json.filter((c) => c.fixa_id === f.id);
  assert.equal(contas.length, 1);
  await req('/api/resumo');
  contas = (await req('/api/contas')).json.filter((c) => c.fixa_id === f.id);
  assert.equal(contas.length, 1);
  await req(`/api/contas/${contas[0].id}`, 'DELETE');
  assert.equal((await req('/api/contas')).json.filter((c) => c.fixa_id === f.id).length, 0);

  const { gerarContasFixas, db } = require('../src/server');
  const info = db.prepare("INSERT INTO contas_fixas (descricao, valor, dia, inicio, usuario_id) VALUES ('Aluguel', 1500, 31, '2027-01', 1)").run();
  gerarContasFixas('2027-02');
  assert.equal(db.prepare('SELECT vencimento FROM contas WHERE fixa_id = ?').get(info.lastInsertRowid).vencimento, '2027-02-28');
});

test('exportar finanças em CSV para Excel', async () => {
  await req('/api/transacoes', 'POST', { descricao: 'Freela; site', valor: 1000, tipo: 'receita', data: '2025-03-10' });
  const res = await req.bruto('/api/exportar?mes=2025-03');
  assert.equal(res.status, 200);
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(bytes.toString('utf8'), /"Freela; site"/);
});

test('dados pessoais são separados por usuário', async () => {
  const outro = h.cliente();
  const r = await outro('/api/auth/cadastro', 'POST', {
    nome: 'ana paula da silva', cpf: '529.982.247-25', email: 'ana@exemplo.com', telefone: '(62) 99999-1234',
    data_nascimento: '1990-05-20', cep: '74000-000', logradouro: 'Rua 1', numero: '10', bairro: 'Centro',
    cidade: 'Goiânia', uf: 'go', senha: 'Senha12345', confirmar_senha: 'Senha12345',
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.nome, 'Ana Paula da Silva');
  assert.equal((await outro('/api/transacoes')).json.length, 0);
  const { json: minha } = await outro('/api/transacoes', 'POST', { descricao: 'Café', valor: 8, tipo: 'despesa' });
  // O master não enxerga nem altera o lançamento pessoal da Ana
  assert.ok(!(await req('/api/transacoes')).json.some((t) => t.id === minha.id));
  assert.equal((await req(`/api/transacoes/${minha.id}`, 'DELETE')).status, 404);
});
