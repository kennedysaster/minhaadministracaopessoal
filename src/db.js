const path = require('path');
const fs = require('fs');
// SQLite embutido no Node.js (22.13+): não precisa compilar nada
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = process.env.DB_FILE || path.join(dataDir, 'admin.db');
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

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
  -- ================= Pessoa física: finanças pessoais =================
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

  CREATE TABLE IF NOT EXISTS contas_fixas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),
    inicio TEXT NOT NULL,
    ativa INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contas_fixas_geradas (
    fixa_id INTEGER NOT NULL,
    mes TEXT NOT NULL,
    PRIMARY KEY (fixa_id, mes)
  );

  -- ================= Cadastro de pessoas (físicas e jurídicas) =================
  CREATE TABLE IF NOT EXISTS pessoas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('PF', 'PJ')),
    nome TEXT NOT NULL,                 -- nome completo (PF) ou razão social (PJ)
    nome_fantasia TEXT,
    documento TEXT NOT NULL UNIQUE,     -- CPF ou CNPJ, só números
    data_nascimento TEXT,               -- PF: nascimento / PJ: abertura
    email TEXT,
    telefone TEXT,
    telefone2 TEXT,
    cep TEXT, logradouro TEXT, numero TEXT, complemento TEXT, bairro TEXT, cidade TEXT, uf TEXT,
    observacoes TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT
  );

  CREATE TABLE IF NOT EXISTS contas_bancarias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pessoa_id INTEGER NOT NULL REFERENCES pessoas(id) ON DELETE CASCADE,
    banco TEXT NOT NULL,
    agencia TEXT,
    conta TEXT,
    tipo TEXT NOT NULL DEFAULT 'Corrente',
    chave_pix TEXT,
    observacao TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ================= Usuários, sessões e permissões =================
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pessoa_id INTEGER NOT NULL UNIQUE REFERENCES pessoas(id),
    senha_hash TEXT,
    master INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    trocar_senha INTEGER NOT NULL DEFAULT 0,
    ultimo_acesso TEXT,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessoes (
    token_hash TEXT PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em INTEGER NOT NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usuario_permissoes (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    chave TEXT NOT NULL,
    PRIMARY KEY (usuario_id, chave)
  );

  -- ================= Pessoa jurídica =================
  CREATE TABLE IF NOT EXISTS empresas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pessoa_id INTEGER NOT NULL UNIQUE REFERENCES pessoas(id),
    responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    situacao_cadastral TEXT,
    data_situacao TEXT,
    natureza_juridica TEXT,
    porte TEXT,
    classificacao TEXT,          -- MEI, ME, EPP, DEMAIS
    regime_tributario TEXT,      -- MEI, Simples Nacional, Lucro Presumido, Lucro Real
    cnae_principal TEXT,
    cnae_descricao TEXT,
    cnaes_secundarios TEXT,      -- JSON [{codigo, descricao}]
    capital_social REAL,
    matriz_filial TEXT,
    inscricao_estadual TEXT,
    inscricao_municipal TEXT,
    socios TEXT,                 -- JSON [{nome, qualificacao}]
    consultado_em TEXT,          -- última consulta na Receita
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS empresa_lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    descricao TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    data TEXT NOT NULL,
    favorecido TEXT,             -- quem recebeu/enviou (ex.: Pix)
    observacao TEXT,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS faturamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    origem_cnpj TEXT NOT NULL,   -- CNPJ de quem pagou/originou o faturamento
    origem_nome TEXT NOT NULL,
    numero_nota TEXT,
    descricao TEXT,
    valor REAL NOT NULL CHECK (valor >= 0),
    data_emissao TEXT NOT NULL,
    data_recebimento TEXT,
    status TEXT NOT NULL DEFAULT 'a_receber' CHECK (status IN ('a_receber', 'recebido')),
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    url TEXT NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'Geral',
    descricao TEXT,
    criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrações simples para bancos criados nas versões anteriores
function adicionarColuna(tabela, coluna, definicao) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
  if (!cols.includes(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}
adicionarColuna('contas', 'fixa_id', 'INTEGER');
adicionarColuna('transacoes', 'conta_id', 'INTEGER');
// Dados pessoais passam a pertencer a um usuário
for (const t of ['transacoes', 'tarefas', 'contas', 'contas_fixas']) adicionarColuna(t, 'usuario_id', 'INTEGER');

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_transacoes_usuario ON transacoes(usuario_id, data);
  CREATE INDEX IF NOT EXISTS idx_contas_usuario ON contas(usuario_id, paga, vencimento);
  CREATE INDEX IF NOT EXISTS idx_tarefas_usuario ON tarefas(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_empresa_lanc ON empresa_lancamentos(empresa_id, data);
  CREATE INDEX IF NOT EXISTS idx_faturamentos ON faturamentos(empresa_id, data_emissao);
`);

module.exports = db;
