// Gera uma nova senha temporária para o usuário master.
// Uso: npm run senha-master
const db = require('../src/db');
const auth = require('../src/auth');

const criada = auth.garantirMaster();
let senha = criada;
let master = db.prepare(`
  SELECT u.id, p.nome, p.documento, p.email FROM usuarios u JOIN pessoas p ON p.id = u.pessoa_id
  WHERE u.master = 1 ORDER BY u.id LIMIT 1`).get();

if (!criada) {
  senha = auth.senhaTemporaria();
  auth.definirSenha(master.id, senha, { trocar: true });
  db.prepare('UPDATE usuarios SET ativo = 1 WHERE id = ?').run(master.id);
  auth.encerrarSessoesDoUsuario(master.id);
}

console.log('');
console.log(`Usuário master: ${master.nome}`);
console.log(`Login: CPF ${master.documento} ou ${master.email}`);
console.log(`Senha temporária: ${senha}`);
console.log('No próximo acesso o sistema vai pedir uma senha nova.');
console.log('');
