# Minha Administração Pessoal

Painel com login para administrar a **pessoa física** (finanças, contas, tarefas, dados pessoais) e a **pessoa jurídica** (empresas, despesas, tributos, Pix, faturamento e links úteis), com cadastro de pessoas e permissões por usuário. Roda em Node.js com banco SQLite local.

## Como rodar

Requisitos: [Node.js](https://nodejs.org) 22.13 ou mais recente (usa o SQLite embutido no Node, sem compilar nada).

```bash
npm install
npm start
```

Abra http://localhost:3000 no navegador.

### Primeiro acesso (usuário master)

Na primeira vez, o terminal mostra a **senha temporária** do usuário master:

```
Usuário master criado
Login: CPF 71596372168 ou kennedysaster@gmail.com
Senha temporária: xxxxxxxxxx
```

Entre com o CPF (ou e-mail) e essa senha. O sistema pede uma senha nova no primeiro acesso.
Perdeu a senha do master? Rode `npm run senha-master` para gerar outra.

Os dados ficam em `data/admin.db` (fora do Git). Bancos de versões anteriores são atualizados automaticamente e os dados pessoais já existentes passam a pertencer ao master.

## Organização

| Área | Telas |
|---|---|
| **Pessoa física** | Visão geral, Finanças, Contas (inclui contas fixas mensais), Tarefas, Meus dados (endereço, contatos, contas bancárias) |
| **Pessoa jurídica** | Empresas, Despesas e receitas, Faturamento, Links úteis |
| **Cadastros** | Pessoas físicas e jurídicas, com endereço, e-mail, telefones e contas bancárias |
| **Administração** | Usuários e permissões |

- Cada usuário vê **somente as próprias** finanças, contas e tarefas pessoais.
- Todo usuário criado já vira uma **pessoa física** no cadastro (nome, CPF, e-mail).

## Login e usuários

- **Entrar** com CPF ou e-mail e senha. Cinco erros seguidos bloqueiam por 5 minutos.
- **Criar conta** pela tela de login exige nome, CPF, e-mail, telefone, endereço completo e data de nascimento. A conta nasce com acesso só às telas pessoais.
- O master (ou quem tiver permissão) cadastra usuários; uma senha temporária é gerada e trocada no primeiro acesso.
- Senhas guardadas com scrypt; sessão em cookie `HttpOnly` de 7 dias.

## Permissões

Cada tela, ação e relatório é uma caixa de marcação na ficha do usuário (Administração > Usuários).
A lista fica em [`src/permissoes.js`](src/permissoes.js): **ao criar uma tela, ação ou relatório novo, basta acrescentar uma linha ali** e ela aparece automaticamente na tela de permissões. O usuário master tem todas, inclusive as futuras.

Somente o master: altera permissões, cadastra empresas e vincula o **usuário responsável** por cada empresa. Usuários comuns só enxergam as empresas pelas quais são responsáveis.

## Empresas

- Cadastro pelo **CNPJ com dados da Receita Federal** (BrasilAPI, com o CNPJ.ws como reserva): razão social, nome fantasia, situação, abertura, natureza jurídica, porte, classificação (MEI, ME, EPP, demais), regime (MEI ou Simples; Lucro Presumido/Real escolhido à mão), CNAE principal e secundários, capital social, endereço, telefone, e-mail e quadro de sócios. Precisa de internet.
- **Despesas e receitas** nas categorias: outros gastos, outras receitas, tributos federais, tributos estaduais, tributos municipais e transferências Pix (enviadas ou recebidas). Resumo do mês com faturamento, tributos e resultado. Exporta para Excel.
- **Faturamento** em página própria de inclusão, com o **CNPJ de origem** (o nome é preenchido pelo cadastro ou pela Receita, e a origem entra em Pessoas). Controle de recebido e a receber, acumulado no ano e últimos 12 meses. Exporta para Excel.
- **Links úteis** por empresa, agrupados por categoria.

## Testes

```bash
npm test
```

## Estrutura

```
src/
  server.js        # monta a aplicação e as rotas
  db.js            # tabelas e migrações do SQLite
  auth.js          # senhas, sessões, permissões e usuário master
  permissoes.js    # lista de permissões (telas, ações, relatórios)
  pessoas.js       # validação e gravação de pessoas físicas e jurídicas
  receita.js       # consulta de CNPJ na Receita
  util.js          # datas, CPF/CNPJ, CSV
  rotas/
    auth.js        # login, criar conta, troca de senha
    pf.js          # finanças, contas e tarefas pessoais
    pessoas.js     # cadastro de pessoas e contas bancárias
    usuarios.js    # usuários e permissões
    empresas.js    # empresas, despesas, faturamento e links
public/
  index.html, login.html, style.css
  js/              # telas (base, pf, pj, cadastros, admin, app, login)
scripts/
  senha-master.js  # gera nova senha temporária para o master
test/              # testes da API
```
