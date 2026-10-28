// Consulta de CNPJ nos dados públicos da Receita Federal.
// Usa a BrasilAPI e, se ela falhar, o CNPJ.ws. Precisa de internet no computador que roda o painel.
const { digitos, texto } = require('./util');

const formatarCnae = (c) => {
  const d = digitos(c);
  return d.length === 7 ? `${d.slice(0, 4)}-${d[4]}/${d.slice(5)}` : d;
};

const dataIso = (s) => {
  const t = texto(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

const numero = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Classificação pelo porte informado na Receita
function classificar(porte, mei) {
  if (mei) return 'MEI';
  const p = texto(porte).toUpperCase();
  if (p.includes('MICRO') || p === 'ME' || p === '01') return 'ME';
  if (p.includes('PEQUENO') || p === 'EPP' || p === '03') return 'EPP';
  if (p) return 'DEMAIS';
  return null;
}

function regime(simples, mei) {
  if (mei) return 'MEI';
  if (simples) return 'Simples Nacional';
  return null;
}

const simNao = (v) => v === true || /^(s|sim|true)$/i.test(texto(v));

function deBrasilApi(j) {
  const mei = simNao(j.opcao_pelo_mei);
  const simples = simNao(j.opcao_pelo_simples);
  const tel = digitos(j.ddd_telefone_1);
  return {
    cnpj: digitos(j.cnpj),
    razao_social: texto(j.razao_social),
    nome_fantasia: texto(j.nome_fantasia) || null,
    situacao_cadastral: texto(j.descricao_situacao_cadastral) || null,
    data_situacao: dataIso(j.data_situacao_cadastral),
    data_abertura: dataIso(j.data_inicio_atividade),
    natureza_juridica: [j.codigo_natureza_juridica, texto(j.natureza_juridica)].filter(Boolean).join(' - ') || null,
    porte: texto(j.porte || j.descricao_porte) || null,
    classificacao: classificar(j.porte || j.descricao_porte, mei),
    regime_tributario: regime(simples, mei),
    cnae_principal: j.cnae_fiscal ? formatarCnae(j.cnae_fiscal) : null,
    cnae_descricao: texto(j.cnae_fiscal_descricao) || null,
    cnaes_secundarios: (j.cnaes_secundarios || [])
      .filter((c) => c && c.codigo)
      .map((c) => ({ codigo: formatarCnae(c.codigo), descricao: texto(c.descricao) })),
    capital_social: numero(j.capital_social),
    matriz_filial: texto(j.descricao_identificador_matriz_filial) || null,
    inscricao_estadual: null,
    email: texto(j.email).toLowerCase() || null,
    telefone: tel.length >= 10 ? tel : null,
    cep: digitos(j.cep) || null,
    logradouro: [texto(j.descricao_tipo_de_logradouro), texto(j.logradouro)].filter(Boolean).join(' ') || null,
    numero: texto(j.numero) || null,
    complemento: texto(j.complemento) || null,
    bairro: texto(j.bairro) || null,
    cidade: texto(j.municipio) || null,
    uf: texto(j.uf).toUpperCase() || null,
    socios: (j.qsa || []).map((s) => ({ nome: texto(s.nome_socio), qualificacao: texto(s.qualificacao_socio) })),
  };
}

function deCnpjWs(j) {
  const e = j.estabelecimento || {};
  const mei = simNao(j.simples?.mei);
  const simples = simNao(j.simples?.simples);
  const tel = digitos(`${e.ddd1 || ''}${e.telefone1 || ''}`);
  const ie = (e.inscricoes_estaduais || []).find((i) => i.ativo !== false) || (e.inscricoes_estaduais || [])[0];
  const ativ = e.atividade_principal || {};
  return {
    cnpj: digitos(e.cnpj || j.cnpj),
    razao_social: texto(j.razao_social),
    nome_fantasia: texto(e.nome_fantasia) || null,
    situacao_cadastral: texto(e.situacao_cadastral) || null,
    data_situacao: dataIso(e.data_situacao_cadastral),
    data_abertura: dataIso(e.data_inicio_atividade),
    natureza_juridica: [j.natureza_juridica?.id, texto(j.natureza_juridica?.descricao)].filter(Boolean).join(' - ') || null,
    porte: texto(j.porte?.descricao) || null,
    classificacao: classificar(j.porte?.descricao || j.porte?.id, mei),
    regime_tributario: regime(simples, mei),
    cnae_principal: ativ.subclasse || ativ.id ? formatarCnae(ativ.subclasse || ativ.id) : null,
    cnae_descricao: texto(ativ.descricao) || null,
    cnaes_secundarios: (e.atividades_secundarias || []).map((a) => ({
      codigo: formatarCnae(a.subclasse || a.id),
      descricao: texto(a.descricao),
    })),
    capital_social: numero(j.capital_social),
    matriz_filial: texto(e.tipo) || null,
    inscricao_estadual: ie ? texto(ie.inscricao_estadual) : null,
    email: texto(e.email).toLowerCase() || null,
    telefone: tel.length >= 10 ? tel : null,
    cep: digitos(e.cep) || null,
    logradouro: [texto(e.tipo_logradouro), texto(e.logradouro)].filter(Boolean).join(' ') || null,
    numero: texto(e.numero) || null,
    complemento: texto(e.complemento) || null,
    bairro: texto(e.bairro) || null,
    cidade: texto(e.cidade?.nome) || null,
    uf: texto(e.estado?.sigla).toUpperCase() || null,
    socios: (j.socios || []).map((s) => ({ nome: texto(s.nome), qualificacao: texto(s.qualificacao_socio?.descricao) })),
  };
}

async function buscar(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (res.status === 404) return { naoEncontrado: true };
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { json: await res.json() };
}

async function consultarCnpj(cnpj) {
  const c = digitos(cnpj);
  const fontes = [
    { url: `https://brasilapi.com.br/api/cnpj/v1/${c}`, mapear: deBrasilApi },
    { url: `https://publica.cnpj.ws/cnpj/${c}`, mapear: deCnpjWs },
  ];
  let naoEncontrado = false;
  for (const f of fontes) {
    try {
      const r = await buscar(f.url);
      if (r.naoEncontrado) {
        naoEncontrado = true;
        continue;
      }
      const dados = f.mapear(r.json);
      if (dados.razao_social) return { ...dados, cnpj: c };
    } catch {
      // tenta a próxima fonte
    }
  }
  const e = new Error(
    naoEncontrado
      ? 'CNPJ não encontrado na Receita Federal'
      : 'Não foi possível consultar a Receita agora. Verifique a internet ou preencha os dados manualmente.'
  );
  e.status = naoEncontrado ? 404 : 502;
  throw e;
}

module.exports = { consultarCnpj, deBrasilApi, deCnpjWs, classificar };
