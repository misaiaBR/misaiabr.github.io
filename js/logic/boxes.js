// Caixinhas: rendimento pós-fixado (% do CDI), dias úteis e IR regressivo no resgate.
import { YIELD } from './rules.js';
import { roundDiv, toInt } from './money.js';

export function businessDaysBetween(from, to) {
  const a = new Date(from.getTime()); a.setHours(0, 0, 0, 0);
  const b = new Date(to.getTime()); b.setHours(0, 0, 0, 0);
  let count = 0;
  const cur = new Date(a);
  while (cur < b) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    if (count > 7300) break; // trava de segurança (20 anos)
  }
  return count;
}

/** Fator de capitalização: (1 + CDI)^(bd/252), em base 1e6. */
export function growthFactor(businessDays, percentCdi = 10000, cdiAnnual = YIELD.cdiAnnualPct) {
  const annual = (cdiAnnual / 10000) * (percentCdi / 10000);
  return Math.pow(1 + annual, businessDays / YIELD.businessDaysPerYear);
}

/**
 * Atualiza a caixinha até `now`. Devolve o quanto rendeu (bruto).
 * Não cria dinheiro do nada: usa só o saldo anterior e o tempo decorrido.
 */
export function accrue(box, now = new Date()) {
  const last = new Date(box.lastAccrualAt || box.createdAt);
  const days = businessDaysBetween(last, now);
  if (days <= 0 || toInt(box.balanceCents) <= 0) {
    return { box: { ...box, lastAccrualAt: now.toISOString() }, gained: 0, days: 0 };
  }
  const factor = growthFactor(days, toInt(box.percentCdi) || 10000);
  const target = Math.floor(toInt(box.balanceCents) * factor);
  const gained = target - toInt(box.balanceCents);
  return {
    box: {
      ...box,
      balanceCents: target,
      yieldCents: toInt(box.yieldCents) + gained,
      lastAccrualAt: now.toISOString(),
    },
    gained,
    days,
  };
}

export function irRateForDays(days) {
  const row = YIELD.irTable.find((r) => days <= r.untilDays) || YIELD.irTable[YIELD.irTable.length - 1];
  return row.rate;
}

/**
 * Calcula um resgate: quanto sai da caixinha, quanto de IR retido na fonte
 * e quanto cai na conta em reais.
 */
export function planWithdraw(box, amountCents, now = new Date()) {
  const amount = Math.min(toInt(amountCents), toInt(box.balanceCents));
  if (amount <= 0) return { ok: false, error: 'Informe um valor para resgatar.' };
  const balance = toInt(box.balanceCents);
  const yieldShare = balance ? roundDiv(toInt(box.yieldCents) * amount, balance) : 0;
  const principal = amount - yieldShare;
  const ageDays = Math.floor((now - new Date(box.createdAt)) / 86_400_000);
  const rate = irRateForDays(ageDays);
  const irCents = roundDiv(yieldShare * rate, 10000);
  return {
    ok: true,
    amountCents: amount,
    principalCents: principal,
    yieldCents: yieldShare,
    irCents,
    irRate: rate,
    netCents: amount - irCents,
    ageDays,
  };
}

export function planDeposit(box, amountCents, balanceBRLCents) {
  const amount = toInt(amountCents);
  if (amount <= 0) return { ok: false, error: 'Informe um valor para aportar.' };
  if (amount > toInt(balanceBRLCents)) return { ok: false, error: 'Saldo da conta em reais insuficiente.' };
  return { ok: true, amountCents: amount };
}

export function totalInBoxes(boxes) {
  return boxes.reduce((acc, b) => acc + toInt(b.balanceCents), 0);
}
