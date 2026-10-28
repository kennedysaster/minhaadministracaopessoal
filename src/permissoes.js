// Lista de permissões do sistema.
// Toda tela, ação ou relatório novo entra aqui e aparece automaticamente
// como uma caixa de marcação na tela de permissões do usuário.
//
// tipo: 'tela' (ver a tela), 'acao' (criar/editar/excluir) ou 'relatorio' (exportar/relatórios)

const PERMISSOES = [
  // ---- Pessoa física (dados e despesas pessoais de cada usuário) ----
  { chave: 'pf.visao', grupo: 'Pessoa física', tipo: 'tela', rotulo: 'Visão geral' },
  { chave: 'pf.financas', grupo: 'Pessoa física', tipo: 'tela', rotulo: 'Finanças pessoais' },
  { chave: 'pf.financas.editar', grupo: 'Pessoa física', tipo: 'acao', rotulo: 'Lançar, editar e excluir finanças pessoais' },
  { chave: 'pf.financas.exportar', grupo: 'Pessoa física', tipo: 'relatorio', rotulo: 'Exportar finanças pessoais para Excel' },
  { chave: 'pf.contas', grupo: 'Pessoa física', tipo: 'tela', rotulo: 'Contas a pagar' },
  { chave: 'pf.contas.editar', grupo: 'Pessoa física', tipo: 'acao', rotulo: 'Cadastrar, pagar e excluir contas' },
  { chave: 'pf.tarefas', grupo: 'Pessoa física', tipo: 'tela', rotulo: 'Tarefas' },
  { chave: 'pf.tarefas.editar', grupo: 'Pessoa física', tipo: 'acao', rotulo: 'Criar, concluir e excluir tarefas' },
  { chave: 'pf.meus_dados', grupo: 'Pessoa física', tipo: 'tela', rotulo: 'Meus dados (endereço, contatos e contas bancárias)' },

  // ---- Pessoa jurídica ----
  { chave: 'pj.empresas', grupo: 'Pessoa jurídica', tipo: 'tela', rotulo: 'Empresas' },
  { chave: 'pj.empresas.editar', grupo: 'Pessoa jurídica', tipo: 'acao', rotulo: 'Editar dados das empresas' },
  { chave: 'pj.lancamentos', grupo: 'Pessoa jurídica', tipo: 'tela', rotulo: 'Despesas e receitas da empresa' },
  { chave: 'pj.lancamentos.editar', grupo: 'Pessoa jurídica', tipo: 'acao', rotulo: 'Lançar, editar e excluir despesas e receitas da empresa' },
  { chave: 'pj.lancamentos.exportar', grupo: 'Pessoa jurídica', tipo: 'relatorio', rotulo: 'Exportar despesas e receitas da empresa' },
  { chave: 'pj.faturamento', grupo: 'Pessoa jurídica', tipo: 'tela', rotulo: 'Faturamento' },
  { chave: 'pj.faturamento.editar', grupo: 'Pessoa jurídica', tipo: 'acao', rotulo: 'Incluir, editar e excluir faturamento' },
  { chave: 'pj.faturamento.exportar', grupo: 'Pessoa jurídica', tipo: 'relatorio', rotulo: 'Exportar faturamento' },
  { chave: 'pj.links', grupo: 'Pessoa jurídica', tipo: 'tela', rotulo: 'Links úteis' },
  { chave: 'pj.links.editar', grupo: 'Pessoa jurídica', tipo: 'acao', rotulo: 'Cadastrar e excluir links úteis' },

  // ---- Cadastros ----
  { chave: 'pessoas', grupo: 'Cadastros', tipo: 'tela', rotulo: 'Pessoas físicas e jurídicas' },
  { chave: 'pessoas.editar', grupo: 'Cadastros', tipo: 'acao', rotulo: 'Cadastrar, editar e excluir pessoas e contas bancárias' },

  // ---- Administração ----
  { chave: 'usuarios', grupo: 'Administração', tipo: 'tela', rotulo: 'Usuários' },
  { chave: 'usuarios.editar', grupo: 'Administração', tipo: 'acao', rotulo: 'Cadastrar usuários, ativar e redefinir senha' },
];

// Permissões dadas a quem cria a própria conta pela tela de login:
// apenas as próprias finanças pessoais. O resto o usuário master libera.
const PADRAO_NOVO_USUARIO = PERMISSOES.filter((p) => p.chave.startsWith('pf.')).map((p) => p.chave);

const CHAVES = new Set(PERMISSOES.map((p) => p.chave));

module.exports = { PERMISSOES, PADRAO_NOVO_USUARIO, CHAVES };
