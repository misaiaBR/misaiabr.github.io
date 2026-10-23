// Dinheiro: tudo em inteiros (centavos de BRL / centésimos de EUR).
// Nada de float em cálculos de saldo.

export const BRL = 'BRL';
export const EUR = 'EUR';

export const SYMBOL = { [BRL]: 'R$', [EUR]: '€' };
export const LOCALE = { [BRL]: 'pt-BR', [EUR]: 'de-DE' };

const nfCache = new Map();
function nf(currency, opts = {}) {
  const key = currency + JSON.stringify(opts);
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[currency] || 'pt-BR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
      ...opts,
    });
    nfCache.set(key, f);
  }
  return f;
}

export function toInt(value) {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) ? n : 0;
}

/** Troca qualquer espaço fino/nobreak por espaço comum (mesma saída em Node e Safari). */
function flatSpaces(text) {
  return String(text).replace(/[\u00a0\u202f\u2009\ufeff]/g, ' ');
}

/** Formata centavos inteiros como "R$ 1.234,56". */
export function fmt(cents, currency = BRL) {
  return flatSpaces(nf(currency).format(toInt(cents) / 100));
}

export function fmtNumber(cents, currency = BRL) {
  return flatSpaces(nf(currency, { style: 'decimal' }).format(toInt(cents) / 100));
}

export function fmtSigned(cents, currency = BRL) {
  const n = toInt(cents);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}${fmt(Math.abs(n), currency)}`;
}

export function parseAmount(text) {
  if (typeof text === 'number') return toInt(text * 100);
  let s = String(text || '').trim();
  if (!s) return 0;
  s = s.replace(/[^\d.,-]/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Arredonda meio para longe do zero, sempre em inteiros. */
export function roundDiv(numerator, denominator) {
  const n = toInt(numerator);
  const d = Math.abs(toInt(denominator)) || 1;
  if (n >= 0) return Math.floor((n * 2 + d) / (2 * d));
  return -Math.floor((-n * 2 + d) / (2 * d));
}

/** Converte uma quantia para a moeda de exibição. taxa = BRL por 1 EUR. */
export function convert(cents, rate, from, to) {
  const r = toInt(rate);
  if (r <= 0 || from === to) return toInt(cents);
  if (from === EUR && to === BRL) return roundDiv(toInt(cents) * r, 10000);
  if (from === BRL && to === EUR) return roundDiv(toInt(cents) * 10000, r);
  return toInt(cents);
}

export function sum(list, pick = (x) => x) {
  return list.reduce((acc, item) => acc + toInt(pick(item)), 0);
}

export const isPositive = (n) => toInt(n) > 0;

/** Teclado de valor: 123456 -> R$ 1.234,56 */
export function keypadAppend(cents, digit) {
  return toInt(cents) * 10 + (Number(digit) || 0);
}
export function keypadBackspace(cents) {
  return Math.floor(toInt(cents) / 10);
}
export function keypadText(cents) {
  return fmtNumber(toInt(cents), BRL);
}
