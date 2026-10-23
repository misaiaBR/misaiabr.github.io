// Câmbio: cotação com spread, IOF e Valor Efetivo Total (VET).
import { FX, pct } from './rules.js';
import { roundDiv, toInt } from './money.js';

/** As três cotações do dia, em centavos de BRL por 1 EUR. */
export function quotation(state) {
  const ref = toInt(state?.settings?.fx?.rate) || FX.defaultRateBRLPerEUR;
  const buy = ref + roundDiv(ref * FX.buySpread, 10000);
  const sell = ref - roundDiv(ref * FX.sellSpread, 10000);
  return {
    ref,
    buy,
    sell,
    spreadLabel: `${(FX.buySpread / 100).toFixed(2).replace('.', ',')}%`,
    updatedAt: state?.settings?.fx?.updatedAt || FX.rateUpdatedAt,
    manual: Boolean(state?.settings?.fx?.manual),
  };
}

/** Quanto o cliente paga em reais para comprar `eurCents`. */
export function quoteBuy(state, eurCents) {
  const q = quotation(state);
  const amount = toInt(eurCents);
  const changeBRL = roundDiv(amount * q.buy, 10000);
  const iofBRL = roundDiv(changeBRL * FX.iofExchange, 10000);
  const totalBRL = changeBRL + iofBRL;
  return {
    side: 'buy',
    eurCents: amount,
    rate: q.buy,
    changeBRL,
    iofBRL,
    totalBRL,
    vetRate: amount ? roundDiv(totalBRL * 10000, amount) : 0,
  };
}

/** Quanto o cliente recebe em reais ao vender `eurCents`. */
export function quoteSell(state, eurCents) {
  const q = quotation(state);
  const amount = toInt(eurCents);
  const grossBRL = roundDiv(amount * q.sell, 10000);
  const iofBRL = roundDiv(grossBRL * FX.iofExchange, 10000);
  const netBRL = grossBRL - iofBRL;
  return {
    side: 'sell',
    eurCents: amount,
    rate: q.sell,
    changeBRL: grossBRL,
    iofBRL,
    totalBRL: netBRL,
    vetRate: amount ? roundDiv(netBRL * 10000, amount) : 0,
  };
}

/** Compra internacional no cartão: valor em EUR → custo em BRL com IOF. */
export function cardInternationalCost(state, eurCents) {
  const q = quotation(state);
  const brlGross = roundDiv(toInt(eurCents) * q.ref, 10000);
  const iof = roundDiv(brlGross * FX.iofCard, 10000);
  return { eurCents: toInt(eurCents), brlGross, iof, totalBRL: brlGross + iof };
}

/** Converte um valor para a moeda de exibição escolhida no app. */
export function toDisplay(state, cents, currency) {
  const target = state?.settings?.currency || 'BRL';
  if (target === currency) return toInt(cents);
  const rate = toInt(state?.settings?.fx?.rate) || FX.defaultRateBRLPerEUR;
  if (currency === 'BRL' && target === 'EUR') return roundDiv(toInt(cents) * 10000, rate);
  if (currency === 'EUR' && target === 'BRL') return roundDiv(toInt(cents) * rate, 10000);
  return toInt(cents);
}

export function displayCurrency(state) {
  return state?.settings?.currency || 'BRL';
}

/** Checagens da operação de câmbio. */
export function validateBuy(state, eurCents) {
  const amount = toInt(eurCents);
  if (amount < FX.minBuyEurCents) return { ok: false, error: `O mínimo para compra é € ${(FX.minBuyEurCents / 100).toFixed(2)}.` };
  const usedToday = eurosBoughtToday(state);
  if (usedToday + amount > FX.maxDailyBuyEurCents) {
    return { ok: false, error: `Limite diário de compra de € ${(FX.maxDailyBuyEurCents / 100).toFixed(2)}.` };
  }
  const q = quoteBuy(state, amount);
  if (q.totalBRL > state.accounts.brl.cashCents) {
    return { ok: false, error: 'Saldo da conta em reais insuficiente (o IOF também sai do saldo).' };
  }
  return { ok: true, quote: q };
}

export function validateSell(state, eurCents) {
  const amount = toInt(eurCents);
  if (amount < FX.minBuyEurCents) return { ok: false, error: `O mínimo para venda é € ${(FX.minBuyEurCents / 100).toFixed(2)}.` };
  if (amount > state.accounts.eur.cashCents) return { ok: false, error: 'Saldo em euro insuficiente.' };
  return { ok: true, quote: quoteSell(state, amount) };
}

export function eurosBoughtToday(state) {
  const today = new Date().toISOString().slice(0, 10);
  return state.tx.reduce(
    (acc, t) => (t.type === 'fx_buy' && String(t.at).slice(0, 10) === today ? acc + toInt(t.eurCents) : acc),
    0,
  );
}

export { pct };

/* ---------------- IBAN (transferência internacional) ---------------- */

const IBAN_COUNTRY = {
  PT: 'Portugal', DE: 'Alemanha', FR: 'França', IT: 'Itália', ES: 'Espanha',
  NL: 'Países Baixos', BE: 'Bélgica', AT: 'Áustria', IE: 'Irlanda', LU: 'Luxemburgo',
  GB: 'Reino Unido', CH: 'Suíça',
};

/** Validação mod 97 (ISO 13616) — funciona offline. */
export function validateIban(raw) {
  const value = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (value.length < 15 || value.length > 34) return { ok: false, error: 'IBAN deve ter entre 15 e 34 caracteres.' };
  const country = value.slice(0, 2);
  if (!IBAN_COUNTRY[country]) return { ok: false, error: 'IBAN precisa ser de um país da zona SEPA suportada.' };
  if (!/^\d{2}$/.test(value.slice(2, 4))) return { ok: false, error: 'Os dois caracteres após o país devem ser dígitos.' };
  const rearranged = value.slice(4) + value.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  const rest = BigInt(numeric) % 97n;
  if (rest !== 1n) return { ok: false, error: 'IBAN inválido (dígito de controle mod 97 não confere).' };
  return { ok: true, value, country, countryName: IBAN_COUNTRY[country], bic: `${country}PBRA` };
}

export const SEPA_COUNTRIES = IBAN_COUNTRY;

