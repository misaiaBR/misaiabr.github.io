// Boleto: linha digitável (47 dígitos = 44 do código de barras + 3 DVs de campo)
// e decodificação de fator de vencimento / valor nominal.
import { BOLETO } from './rules.js';

export function mod10(digits) {
  const s = String(digits).replace(/\D/g, '');
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    const factor = (s.length - i) % 2 === 1 ? 2 : 1; // alternando 2,1 da direita
    const prod = Number(s[i]) * factor;
    sum += prod > 9 ? prod - 9 : prod;
  }
  return (10 - (sum % 10)) % 10;
}

/** Módulo 11, pesos 2..9 repetindo da direita para a esquerda. */
export function mod11(digits) {
  const s = String(digits).replace(/\D/g, '');
  if (!s.length) return 0;
  let sum = 0;
  let weight = 2;
  for (let i = s.length - 1; i >= 0; i--) {
    sum += Number(s[i]) * weight;
    weight = weight >= 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  if (rest === 0 || rest === 1) return 0;
  const dv = 11 - rest;
  return dv > 9 ? 0 : dv;
}

/** Fator de vencimento → data. Em 22/02/2025 a contagem recomeçou em 1000. */
export function factorToDate(factor) {
  const f = Number(factor);
  if (!Number.isFinite(f) || f <= 0) return null;
  if (f < BOLETO.resetFactorValue) {
    const base = new Date(`${BOLETO.oldFactorBase}T12:00:00`);
    base.setDate(base.getDate() + (f - 1));
    return { date: base, legacy: true };
  }
  const base = new Date(`${BOLETO.resetFactorBase}T12:00:00`);
  base.setDate(base.getDate() + (f - BOLETO.resetFactorValue));
  return { date: base, legacy: false };
}

export function dateToFactor(date) {
  const base = new Date(`${BOLETO.resetFactorBase}T12:00:00`);
  const d = new Date(date.getTime());
  d.setHours(12, 0, 0, 0);
  return BOLETO.resetFactorValue + Math.round((d - base) / 86_400_000);
}

/** Reconstrói o código de barras (44) a partir da linha digitável (47). */
export function barcodeFromLinha(linha) {
  const l = String(linha).replace(/\D/g, '');
  if (l.length !== 47) return null;
  const c1 = l.slice(0, 10); // banco(3) moeda(1) livre(5) DV
  const c2 = l.slice(10, 21); // livre(10) DV
  const c3 = l.slice(21, 32); // livre(10) DV
  const dvGeral = l[32];
  const fator = l.slice(33, 37);
  const valor = l.slice(37, 47);
  return c1.slice(0, 4) + dvGeral + fator + valor + c1.slice(4, 9) + c2.slice(0, 10) + c3.slice(0, 10);
}

/** Monta a linha digitável (47) a partir das peças do boleto. */
export function linhaFromParts({ banco, moeda = '9', fator, valorCents, campoLivre }) {
  const valor = String(valorCents).padStart(10, '0').slice(-10);
  const fat = String(fator).padStart(4, '0').slice(-4);
  const livre = String(campoLivre).padStart(25, '0').slice(-25);
  const c1 = `${banco}${moeda}${livre.slice(0, 5)}`;
  const c2 = livre.slice(5, 15);
  const c3 = livre.slice(15, 25);
  const dvGeral = mod11(`${banco}${moeda}${fat}${valor}${livre}`);
  return `${c1}${mod10(c1)}${c2}${mod10(c2)}${c3}${mod10(c3)}${dvGeral}${fat}${valor}`;
}

/**
 * Lê o número do boleto digitado/colado.
 * Devolve o que dá para saber offline e avisa o que precisa de confirmação.
 */
export function readLinhaDigitavel(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return { ok: false, error: 'Digite ou cole o número do boleto.' };

  if (digits.length === 48 && digits[0] === '8') {
    return {
      ok: true,
      kind: 'arrecadacao',
      digits,
      banco: null,
      bankName: 'Concessionária / arrecadação',
      segment: digits[1],
      valorCents: null,
      needsManualAmount: true,
      canPay: false,
      vencimento: null,
      warning:
        'Boleto de concessionária (48 dígitos): o valor não vem na posição padrão. Digite o valor para continuar.',
    };
  }
  if (digits.length !== 47) {
    return {
      ok: false,
      error: `O número deve ter 47 dígitos (48 em concessionárias). Você informou ${digits.length}.`,
    };
  }

  const c1 = digits.slice(0, 10);
  const c2 = digits.slice(10, 21);
  const c3 = digits.slice(21, 32);
  const dvGeral = Number(digits[32]);
  const fator = Number(digits.slice(33, 37));
  const valorCents = Number(digits.slice(37, 47));
  const barcode = barcodeFromLinha(digits);

  const bad = [];
  if (mod10(c1.slice(0, 9)) !== Number(c1[9])) bad.push('campo 1');
  if (mod10(c2.slice(0, 10)) !== Number(c2[10])) bad.push('campo 2');
  if (mod10(c3.slice(0, 10)) !== Number(c3[10])) bad.push('campo 3');
  if (bad.length) {
    return {
      ok: false,
      error: `Dígito verificador inválido no ${bad.join(' e ')}. Confira o número do boleto.`,
    };
  }

  const moeda = Number(c1[3]);
  if (moeda !== 9) {
    return { ok: false, error: `Moeda ${moeda}: este app só paga boletos em reais.` };
  }

  const bankCode = c1.slice(0, 3);
  const when = factorToDate(fator);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = when ? when.date < today : false;
  const calcGeral = mod11(barcode.slice(0, 4) + barcode.slice(5));
  const geralOk = calcGeral === dvGeral;

  let warning = null;
  if (!geralOk) warning = 'O dígito verificador do código de barras não confere. Confira antes de pagar.';
  else if (valorCents === 0) warning = 'Boleto sem valor: informe o valor para pagar.';
  else if (overdue) warning = 'Este boleto está vencido. Podem incidir juros e multa.';
  else if (when && when.legacy) warning = 'Fator de vencimento anterior a 22/02/2025 — boleto vencido.';

  return {
    ok: true,
    kind: 'cobranca',
    digits,
    barcode,
    banco: bankCode,
    bankName: BOLETO.banks[bankCode] || `Banco ${bankCode}`,
    fator,
    valorCents,
    needsManualAmount: valorCents === 0,
    canPay: valorCents > 0 && !overdue ? true : valorCents > 0,
    vencimento: when ? when.date : null,
    overdue,
    dvGeralOk: geralOk,
    warning,
  };
}

/** Máscara visual: 00190.01104 40000.000009 ... */
export function formatLinhaDigitavel(input, max = 48) {
  const d = String(input).replace(/\D/g, '').slice(0, max);
  const groups = [];
  if (d.length > 0) groups.push(d.slice(0, 5) + (d.length > 5 ? '.' + d.slice(5, 10) : ''));
  if (d.length > 10) groups.push(sliceMasked(d, 10, 21));
  if (d.length > 21) groups.push(sliceMasked(d, 21, 32));
  if (d.length > 32) groups.push(d.slice(32, 33));
  if (d.length > 33) groups.push(d.slice(33));
  return groups.filter(Boolean).join(' ');
}

function sliceMasked(d, from, to) {
  const part = d.slice(from, to);
  const head = part.slice(0, 5);
  const tail = part.slice(5);
  return tail ? `${head}.${tail}` : head;
}
