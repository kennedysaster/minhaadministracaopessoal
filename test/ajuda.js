// Apoio para os testes: sobe o servidor com um banco temporário e oferece clientes com login
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-test-'));
process.env.DB_FILE = path.join(tmp, 'test.db');

const app = require('../src/server');
const auth = require('../src/auth');
const db = require('../src/db');

let server;
let base;

async function iniciar() {
  await new Promise((r) => {
    server = app.listen(0, () => {
      base = `http://localhost:${server.address().port}`;
      r();
    });
  });
}

function encerrar() {
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Cliente HTTP que guarda o cookie de sessão
function cliente() {
  let cookie = '';
  const req = async (url, method = 'GET', body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let json = null;
    if (res.status !== 204) {
      const tipo = res.headers.get('content-type') || '';
      json = tipo.includes('json') ? await res.json() : await res.text();
    }
    return { status: res.status, json, res };
  };
  req.cookie = () => cookie;
  req.bruto = (url) => fetch(base + url, { headers: cookie ? { Cookie: cookie } : {} });
  return req;
}

const SENHA = 'SenhaForte123';

// Cria o master, faz login e troca a senha temporária
async function master() {
  const temp = auth.garantirMaster();
  const req = cliente();
  let r = await req('/api/auth/login', 'POST', { login: '71596372168', senha: temp || SENHA });
  if (r.status !== 200) throw new Error('login master falhou: ' + JSON.stringify(r.json));
  if (r.json.trocar_senha) {
    r = await req('/api/auth/senha', 'POST', { nova_senha: SENHA, confirmar_senha: SENHA });
    if (r.status !== 200) throw new Error('troca de senha falhou: ' + JSON.stringify(r.json));
  }
  return req;
}

module.exports = { iniciar, encerrar, cliente, master, SENHA, db, auth, get base() { return base; } };
