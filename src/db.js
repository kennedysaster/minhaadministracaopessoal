const path = require('path');
const fs = require('fs');
// SQLite embutido no Node.js (22.13+): não precisa compilar nada
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = process.env.DB_FILE || path.join(dataDir, 'admin.db');
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL');

// Executa fn dentro de uma transação
db.transacao = (fn) => {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

db.exec(`
  CREATE TABLE IF NOT EXISTS transacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
    categoria TEXT NOT NULL DEFAULT 'Outros',
    data TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tarefas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    prazo TEXT,
    prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
    concluida INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    vencimento TEXT NOT NULL,
    paga INTEGER NOT NULL DEFAULT 0,
    pago_em TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Contas que se repetem todo mês (luz, internet, aluguel...)
  CREATE TABLE IF NOT EXISTS contas_fixas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),
    inicio TEXT NOT NULL,          -- primeiro mês (AAAA-MM) em que é gerada
    ativa INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Registro de quais meses já foram gerados para cada conta fixa
  CREATE TABLE IF NOT EXISTS contas_fixas_geradas (
    fixa_id INTEGER NOT NULL,
    mes TEXT NOT NULL,
    PRIMARY KEY (fixa_id, mes)
  );
`);

// Migrações simples para bancos criados na versão anterior
function adicionarColuna(tabela, coluna, definicao) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!cols.includes(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}
adicionarColuna('contas', 'fixa_id', 'INTEGER');
adicionarColuna('transacoes', 'conta_id', 'INTEGER');

module.exports = db;
