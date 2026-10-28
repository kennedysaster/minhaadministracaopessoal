const path = require('path');
const express = require('express');
const db = require('./db');
const auth = require('./auth');
const { erro } = require('./util');
const rotasPf = require('./rotas/pf');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Cabeçalhos básicos de segurança
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Proteção contra envio de formulários de outros sites:
// toda alteração na API precisa vir como JSON (navegadores não fazem isso entre sites sem permissão)
app.use('/api', (req, res, next) => {
  const temCorpo = Number(req.headers['content-length'] || 0) > 0 || !!req.headers['transfer-encoding'];
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && temCorpo && !req.is('application/json')) {
    return erro(res, 'Envie os dados em JSON', 415);
  }
  next();
});

app.use(auth.autenticar);

// Rotas abertas (login, cadastro)
app.use('/api/auth', require('./rotas/auth'));

// Daqui em diante, precisa estar logado
app.use('/api', auth.exigirLogin);
app.use('/api', rotasPf);
app.use('/api', require('./rotas/pessoas'));
app.use('/api/usuarios', require('./rotas/usuarios'));
app.use('/api', require('./rotas/empresas'));

// Rotas da API inexistentes respondem em JSON
app.use('/api', (req, res) => erro(res, 'Rota não encontrada', 404));

// Erros inesperados
// eslint-disable-next-line no-unused-vars
app.use((e, req, res, next) => {
  if (e.type === 'entity.parse.failed') return erro(res, 'Dados enviados em formato inválido');
  console.error(e);
  erro(res, e.status && e.status < 500 ? e.message : 'Erro interno. Tente de novo.', e.status || 500);
});

// Telas
const pub = path.join(__dirname, '..', 'public');
app.get('/login', (req, res) => res.sendFile(path.join(pub, 'login.html')));
app.use(express.static(pub));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  const senha = auth.garantirMaster();
  app.listen(PORT, () => {
    console.log(`Painel rodando em http://localhost:${PORT}`);
    if (senha) {
      const m = auth.MASTER;
      console.log('');
      console.log('================================================================');
      console.log('  Usuário master criado');
      console.log(`  Login: CPF ${m.documento} ou ${m.email}`);
      console.log(`  Senha temporária: ${senha}`);
      console.log('  No primeiro acesso o sistema vai pedir uma senha nova.');
      console.log('  Perdeu esta senha? Rode: npm run senha-master');
      console.log('================================================================');
      console.log('');
    }
  });
}

module.exports = app;
module.exports.gerarContasFixas = rotasPf.gerarContasFixas;
module.exports.db = db;
