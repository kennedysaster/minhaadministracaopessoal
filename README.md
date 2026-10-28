# Minha Administração Pessoal

Painel pessoal com **finanças**, **tarefas** e **contas a pagar**, rodando em Node.js com banco SQLite local.

## Funcionalidades

- **Resumo do mês**: receitas, despesas, saldo, contas em aberto e tarefas pendentes
- **Finanças**: lançamento de receitas e despesas por categoria, com gráfico de gastos por categoria
- **Tarefas**: prazo, prioridade, marcação de concluída e alerta de atrasadas
- **Contas a pagar**: vencimento, alerta de vencidas/próximas; ao pagar, a despesa entra em Finanças automaticamente

## Como rodar

Requisitos: [Node.js](https://nodejs.org) 18 ou mais recente.

```bash
npm install
npm start
```

Abra http://localhost:3000 no navegador.

Os dados ficam em `data/admin.db` (fora do Git). Para usar outro arquivo ou porta:

```bash
DB_FILE=/caminho/meu.db PORT=4000 npm start
```

## Testes

```bash
npm test
```

## Estrutura

```
src/
  db.js        # conexão e criação das tabelas SQLite
  server.js    # API REST (Express)
public/
  index.html   # painel
  style.css
  app.js
test/
  api.test.js  # testes da API
```

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/resumo?mes=AAAA-MM` | Totais do mês, gastos por categoria, contas e tarefas |
| GET / POST | `/api/transacoes` | Listar (`?mes=AAAA-MM`) / criar lançamento |
| DELETE | `/api/transacoes/:id` | Excluir lançamento |
| GET / POST | `/api/tarefas` | Listar / criar tarefa |
| PATCH | `/api/tarefas/:id` | Marcar `{ "concluida": true }` |
| DELETE | `/api/tarefas/:id` | Excluir tarefa |
| GET / POST | `/api/contas` | Listar / criar conta |
| POST | `/api/contas/:id/pagar` | Marcar como paga e lançar despesa |
| DELETE | `/api/contas/:id` | Excluir conta |
