// Funções de apoio usadas pelas rotas

const fmt = (d) => d.toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
const hoje = () => fmt(new Date());
const mesAtual = () => hoje().slice(0, 7);
const dataValida = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const mesValido = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const texto = (s) => (s == null ? '' : String(s).trim());
const digitos = (s) => texto(s).replace(/\D/g, '');
const erro = (res, msg, status = 400) => res.status(status).json({ erro: msg });

const somarMeses = (mes, n) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const ultimoDia = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
};

function cpfValido(valor) {
  const c = digitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(c[t])) return false;
  }
  return true;
}

function cnpjValido(valor) {
  const c = digitos(valor);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base) => {
    let pos = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
}

const emailValido = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(s));

const formatarCpf = (s) => digitos(s).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const formatarCnpj = (s) => digitos(s).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

// Valida um valor em reais (>= 0)
function valorValido(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

// CSV que abre direto no Excel em português (separador ; e vírgula decimal)
const csv = {
  cel: (v) => `"${String(v ?? '').replace(/"/g, '""')}"`,
  num: (v) => Number(v || 0).toFixed(2).replace('.', ','),
  data: (s) => (s ? s.split('-').reverse().join('/') : ''),
  enviar(res, nome, linhas) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send('﻿' + linhas.join('\r\n'));
  },
};

module.exports = {
  fmt, hoje, mesAtual, dataValida, mesValido, texto, digitos, erro, somarMeses, ultimoDia,
  cpfValido, cnpjValido, emailValido, formatarCpf, formatarCnpj, valorValido, csv,
};
