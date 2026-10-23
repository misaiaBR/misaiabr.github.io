// Cartão: número com dígito verificador Luhn válido e máscaras de exibição.
export function luhnCheck(digits) {
  const s = String(digits).replace(/\D/g, '');
  if (s.length < 13) return false;
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let d = Number(s[s.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function luhnDigit(partial) {
  const s = String(partial).replace(/\D/g, '');
  for (let d = 0; d <= 9; d++) {
    if (luhnCheck(s + d)) return d;
  }
  return 0;
}

function rand4() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/** Gera um número de 16 dígitos com Luhn válido a partir de um prefixo. */
export function luhnNumber(prefix = '5412') {
  const base = `${prefix.replace(/\D/g, '')}${rand4()}${rand4()}${rand4()}`.slice(0, 15);
  const full = base + luhnDigit(base);
  return full.replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function maskNumber(number, keep = 4) {
  const d = digitsOnly(number);
  return `•••• •••• •••• ${d.slice(-keep)}`;
}

export function brandOf(number) {
  const d = digitsOnly(number);
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'MASTER';
  if (/^3[47]/.test(d)) return 'AMEX';
  if (/^(38|63)/.test(d)) return 'ELO';
  return 'CRÉDITO';
}

export function formatCardEntry(value) {
  return digitsOnly(value).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
}
