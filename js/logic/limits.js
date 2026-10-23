// Limites do Pix (diurno/noturno) com pedido de aumento só valendo depois de 24h.
import { PIX } from './rules.js';
import { toInt } from './money.js';

export function windowName(date = new Date()) {
  const h = date.getHours();
  return h >= PIX.nightStartHour || h < PIX.nightEndHour ? 'night' : 'day';
}

/** Janela [início, fim) que contém a data — usada para somar o que já foi usado. */
export function operationWindow(date = new Date()) {
  const d = new Date(date.getTime());
  const h = d.getHours();
  const isNight = h >= PIX.nightStartHour || h < PIX.nightEndHour;
  if (!isNight) {
    const start = new Date(d); start.setHours(6, 0, 0, 0);
    const end = new Date(d); end.setHours(PIX.nightStartHour, 0, 0, 0);
    return { name: 'day', start, end };
  }
  if (h >= PIX.nightStartHour) {
    const start = new Date(d); start.setHours(PIX.nightStartHour, 0, 0, 0);
    const end = new Date(d); end.setDate(end.getDate() + 1); end.setHours(PIX.nightEndHour, 0, 0, 0);
    return { name: 'night', start, end };
  }
  const end = new Date(d); end.setHours(PIX.nightEndHour, 0, 0, 0);
  const start = new Date(end); start.setDate(start.getDate() - 1); start.setHours(PIX.nightStartHour, 0, 0, 0);
  return { name: 'night', start, end };
}

const COUNTED = new Set(['pix_out', 'manual_out', 'boleto_out', 'recharge']);

export function usedInWindow(state, win = operationWindow()) {
  return state.tx.reduce((acc, t) => {
    if (!COUNTED.has(t.type) || t.status === 'scheduled') return acc;
    const at = new Date(t.at);
    if (at >= win.start && at < win.end) return acc + Math.abs(toInt(t.amountCents));
    return acc;
  }, 0);
}

/** Limite que vale agora, respeitando alteração pendente. */
export function activeLimit(state, date = new Date()) {
  const win = windowName(date);
  const current = toInt(state.limits[win]);
  const pending = state.limits.pending?.[win];
  if (pending && new Date(pending.effectiveAt) <= date) return toInt(pending.value);
  return current;
}

export function pendingChange(state, win = windowName()) {
  const p = state.limits.pending?.[win];
  if (!p) return null;
  return { win, value: toInt(p.value), effectiveAt: new Date(p.effectiveAt) };
}

/** Regra aplicada antes de aprovar qualquer Pix/pagamento. */
export function checkLimit(state, amountCents, date = new Date()) {
  const amount = Math.abs(toInt(amountCents));
  const win = operationWindow(date);
  const limit = activeLimit(state, date);
  const used = usedInWindow(state, win);
  const remaining = Math.max(0, limit - used);
  if (limit <= 0) {
    return { ok: false, code: 'blocked', win, limit, used, remaining };
  }
  if (amount > remaining) {
    return { ok: false, code: 'exceeded', win, limit, used, remaining };
  }
  return { ok: true, win, limit, used, remaining };
}

export function scheduleLimitChange(state, win, newValue, now = new Date()) {
  const current = toInt(state.limits[win]);
  const value = toInt(newValue);
  if (value < current) {
    // diminuição vale na hora
    state.limits[win] = value;
    if (state.limits.pending) delete state.limits.pending[win];
    return { applied: 'immediate', win, value };
  }
  const effectiveAt = new Date(now.getTime() + PIX.increaseTakesHours * 3600_000);
  state.limits.pending = { ...(state.limits.pending || {}), [win]: { value, effectiveAt: effectiveAt.toISOString() } };
  return { applied: 'scheduled', win, value, effectiveAt };
}

export function promotePendingLimits(state, now = new Date()) {
  const pending = state.limits.pending || {};
  let changed = false;
  for (const win of Object.keys(pending)) {
    if (new Date(pending[win].effectiveAt) <= now) {
      state.limits[win] = toInt(pending[win].value);
      delete pending[win];
      changed = true;
    }
  }
  return changed;
}
