# Minha Administração Pessoal

Painel pessoal com **finanças**, **contas a pagar** e **tarefas**, rodando em Node.js com banco SQLite local.

## Telas

- **Visão geral**: saldo do mês em destaque, gráfico de receitas e despesas dos últimos 6 meses, próximos vencimentos, tarefas pendentes e gastos por categoria
- **Finanças**: receitas e despesas do mês agrupadas por dia, com filtros por tipo e categoria, busca e **exportação para Excel**
- **Contas**: contas em aberto (com alerta de vencidas e próximas), contas pagas e **contas fixas mensais**
- **Tarefas**: pendentes e concluídas, com prazo e prioridade

## Ações

- Criar, **editar** e excluir lançamentos, contas, contas fixas e tarefas
- **Pagar conta** escolhendo a data: a despesa entra em Finanças automaticamente
- **Desfazer pagamento**: a conta volta para Em aberto e o lançamento sai de Finanças
- **Contas fixas mensais** (luz, internet, aluguel): cadastre uma vez e a conta é criada todo mês. Pode pausar e retomar. Se o dia já passou no mês do cadastro, começa no mês seguinte. Dia 31 vira o último dia em meses curtos
- Concluir tarefa com opção de desfazer
- Funciona no celular (menu vira barra inferior) e no modo escuro

## Como rodar

Requisitos: [Node.js](https://nodejs.org) 22.13 ou mais recente (usa o SQLite embutido no Node, sem compilar nada).

```bash
npm install
npm start
```

Abra http://localhost:3000 no navegador.

Os dados ficam em `data/admin.db` (fora do Git). Bancos da versão anterior são atualizados automaticamente. Para usar outro arquivo ou porta:

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
  db.js        # conexão, tabelas e migrações do SQLite
  server.js    # API REST (Express)
public/
  index.html   # estrutura com menu lateral e modal
  style.css
  app.js       # telas, formulários e ações
test/
  api.test.js  # testes da API
```

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/resumo?mes=AAAA-MM` | Saldo, histórico de 6 meses, categorias, próximas contas e tarefas |
| GET / POST | `/api/transacoes` | Listar (`?mes=AAAA-MM`) / criar lançamento |
| PUT / DELETE | `/api/transacoes/:id` | Editar / excluir lançamento |
| GET | `/api/categorias` | Categorias padrão e usadas |
| GET | `/api/exportar?mes=AAAA-MM` | Baixar lançamentos do mês em CSV para Excel |
| GET / POST | `/api/contas` | Listar / criar conta |
| PUT / DELETE | `/api/contas/:id` | Editar / excluir conta |
| POST | `/api/contas/:id/pagar` | Pagar (`{ "data": "AAAA-MM-DD" }` opcional) e lançar despesa |
| POST | `/api/contas/:id/desfazer` | Desfazer pagamento |
| GET / POST | `/api/contas-fixas` | Listar / criar conta fixa mensal |
| PUT / DELETE | `/api/contas-fixas/:id` | Editar (inclui `ativa`) / excluir conta fixa |
| GET / POST | `/api/tarefas` | Listar / criar tarefa |
| PUT / PATCH / DELETE | `/api/tarefas/:id` | Editar / marcar `{ "concluida": true }` / excluir |
