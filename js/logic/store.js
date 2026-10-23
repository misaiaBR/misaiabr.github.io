// Estado do app: 100% local (localStorage). Não há servidor nem banco de dados.
import { BANK, BOLETO, CARD, DEFAULT_USER, FX, PIX, YIELD, TX_TYPES, txMeta } from './rules.js';
import { fmt, roundDiv, toInt } from './money.js';
import { cpfWithDVs, cnpjWithDVs, makeContractNumber, makeE2E, makeTxid } from './pix.js';
import {
  checkLimit, promotePendingLimits, scheduleLimitChange,
} from './limits.js';
import { accrue, planWithdraw } from './boxes.js';
import { quoteBuy, quoteSell, validateIban } from './fx.js';
import { readLinhaDigitavel } from './boleto.js';
import { luhnNumber } from './card.js';
import {
  checkPassword, hashPassword, lockStatus, registerAttempt,
} from './security.js';

const STATE_KEY = 'ipe.bank.state.v1';
const DEVICE_KEY = 'ipe.bank.device.v1';
const ATTEMPTS_KEY = 'ipe.bank.attempts.v1';
export const SCHEMA = 7;

/** Saldo de referência para testes em euro: € 2.886,57 — não vem de integração bancária. */
export const DEMO_EUR_CENTS = 288_657;
/** Saldo da conta em reais: R$ 1.798,00 — não é conversão do euro. */
export const DEMO_BRL_CENTS = 179_800;

let memory = null;
const listeners = new Set();
let saveTimer = null;

/* ------------------------------------------------------------------ util */

function hasStorage() {
  try {
    return typeof localStorage !== 'undefined' && !!localStorage;
  } catch {
    return false;
  }
}
function read(key) {
  if (!hasStorage()) return null;
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}
function write(key, value) {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* aparelho sem espaço: o app continua funcionando em memória */
  }
}
function uid(prefix = 'tx') {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
export function now() {
  return new Date();
}
function iso(date = new Date()) {
  return date.toISOString();
}
function daysAgo(n, hour = 12, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function dateLabel(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(memory);
    } catch (err) {
      console.error('[store] listener', err);
    }
  }
}

function persist(loud = true) {
  if (!memory) return;
  write(STATE_KEY, memory);
  if (loud) emit();
}
function touch() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(true), 60);
}

/** Aplica uma mudança e devolve o resultado para a tela. */
export function act(fn) {
  const s = getState();
  const result = fn(s);
  if (result && result.ok !== false) {
    memory = s;
    persist(true);
  }
  return result;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  if (memory) return memory;
  const stored = read(STATE_KEY);
  if (stored && stored.schema === SCHEMA) memory = stored;
  else memory = stored ? migrate(stored) : provision(seed(emptyState()));
  write(STATE_KEY, memory);
  return memory;
}

/** Cada versão ajusta só o que ainda estava no padrão da versão anterior. */
function migrate(stored) {
  let state = stored;
  if (state.schema === 1) state = migrateV1(state);
  if (state.schema === 2) state = migrateV2(state);
  if (state.schema === 3) state = migrateV3(state);
  if (state.schema === 4) state = migrateV4(state);
  if (state.schema === 5) state = migrateV5(state);
  if (state.schema === 6) state = migrateV6(state);
  return state.schema === SCHEMA ? state : provision(seed(emptyState()));
}

/** v1 -> v2: valores passam a ficar visíveis e a conta em euro vai a € 4.568,00. */
function migrateV1(stored) {
  const state = { ...emptyState(), ...stored, schema: 2 };
  state.security = { ...emptyState().security, ...stored.security, hideBalance: false };
  state.accounts = { ...emptyState().accounts, ...stored.accounts };
  const current = toInt(state.accounts.eur?.cashCents);
  const diff = DEMO_EUR_CENTS - current;
  if (diff > 0) {
    const tx = addTx(state, {
      type: 'deposit',
      amountCents: diff,
      currency: 'EUR',
      title: 'Depósito em euros',
      subtitle: 'Recebido de Lisboa',
      details: { holder: 'Studio Alfama', migration: true },
    });
    applyMovement(state, tx);
  } else {
    state.accounts.eur.cashCents = DEMO_EUR_CENTS;
  }
  return state;
}

/** v2 -> v3: conta no nome do titular, senha padrão, saldo principal em euro e limite em euro. */
function migrateV2(stored) {
  const state = { ...emptyState(), ...stored, schema: 3 };
  state.security = { ...emptyState().security, ...stored.security };
  state.accounts = { ...emptyState().accounts, ...stored.accounts };
  state.settings = { ...emptyState().settings, ...stored.settings };
  state.card = { ...emptyState().card, ...stored.card };
  state.security.hideBalance = false;
  if (!String(state.accounts.eur.iban || '').startsWith('BE')) state.accounts.eur.iban = BANK.eurIban;
  applyDefaultProfile(state);
  setDefaultPassword(state);
  state.settings.currency = 'EUR';
  applyCardDemoSetup(state);
  if (!state.pix.keys.some((k) => k.type === 'cpf' && k.value === DEFAULT_USER.cpfDigits)) {
    state.pix.keys = state.pix.keys
      .filter((k) => !(k.type === 'cpf' || k.type === 'phone'))
      .concat([
        { id: uid('key'), type: 'cpf', value: DEFAULT_USER.cpfDigits, verifiedAt: iso(now()) },
      ]);
    if (state.pix.keys[0]) state.pix.keys[0].isDefault = true;
  }
  return state;
}

/**
 * v3 -> v4: as duas contas passam a ter valores próprios (cada uma com o seu, sem ser
 * conversão uma da outra), limite do cartão e caixinhas menores.
 * Senha, nome e o que ele mexeu ficam intactos.
 */
function migrateV3(stored) {
  const state = { ...emptyState(), ...stored, schema: 4 };
  state.accounts = { ...emptyState().accounts, ...stored.accounts };
  state.card = { ...emptyState().card, ...stored.card };
  applyBoxDemoSetup(state);
  applyCardDemoSetup(state);
  setCash(state, 'EUR', DEMO_EUR_CENTS);
  setCash(state, 'BRL', DEMO_BRL_CENTS);
  return state;
}

/** v4 -> v5: o IBAN da conta em euro passa a ser o dele. Só troca se ainda for o padrão antigo. */
function migrateV4(stored) {
  const state = { ...emptyState(), ...stored, schema: 5 };
  state.accounts = { ...emptyState().accounts, ...stored.accounts };
  const eur = state.accounts.eur;
  const oldDefaults = ['', 'BE54539007547092', 'PT50000201231234567890154'];
  if (oldDefaults.includes(String(eur.iban || '').toUpperCase())) eur.iban = BANK.eurIban;
  return state;
}

/**
 * v5 -> v6: a conta em euro vai a € 2.568,00 e o limite do cartão a € 6.000,00
 * (R$ 33.864,00). Ajusta só esses dois números e o saldo inicial por trás deles;
 * senha, nome, extrato, caixinhas e o que ele mexeu ficam como estão.
 */
function migrateV5(stored) {
  const state = { ...emptyState(), ...stored, schema: 6 };
  state.accounts = { ...emptyState().accounts, ...stored.accounts };
  state.card = { ...emptyState().card, ...stored.card };
  applyCardDemoSetup(state);
  setCash(state, 'EUR', 256_800);
  return state;
}

/** v6 -> v7: alinha o saldo EUR de referência de teste em todas as telas. */
function migrateV6(stored) {
  const state = { ...emptyState(), ...stored, schema: SCHEMA };
  state.accounts = { ...emptyState().accounts, ...stored.accounts };
  setCash(state, 'EUR', DEMO_EUR_CENTS);
  return state;
}

/** Ajusta o saldo de uma conta sem inventar lançamento: mexe só no saldo inicial. */
function setCash(state, currency, cents) {
  const acc = currency === 'EUR' ? state.accounts.eur : state.accounts.brl;
  const net = state.tx
    .filter((t) => t.status === 'done' && (currency === 'EUR' ? t.currency === 'EUR' : t.currency !== 'EUR'))
    .reduce((total, t) => total + signedAmount(t), 0);
  acc.openingCents = cents - net;
  acc.cashCents = cents;
  return acc;
}

export function setState(next) {
  memory = next;
  persist(true);
}

/** Relê o que está gravado no aparelho (usado nos testes de migração). */
export function reloadFromDisk() {
  memory = null;
  return getState();
}

export function hasAccount() {
  const s = getState();
  return Boolean(s.onboardedAt);
}

/* ------------------------------------------------------------------ modelo */

export function emptyState() {
  return {
    schema: SCHEMA,
    onboardedAt: null,
    profile: {
      name: DEFAULT_USER.name,
      firstName: DEFAULT_USER.firstName,
      cpf: DEFAULT_USER.cpf,
      email: DEFAULT_USER.email,
      phone: DEFAULT_USER.phone,
      initials: DEFAULT_USER.initials,
    },
    security: { salt: '', hash: '', biometric: null, autoLockSeconds: 60, hideBalance: false, tempPassword: null, attempts: { attempts: 0, lockedUntil: 0 } },
    settings: { currency: 'EUR', theme: 'auto', fx: { rate: FX.defaultRateBRLPerEUR, updatedAt: FX.rateUpdatedAt, manual: false } },
    accounts: {
      brl: { cashCents: 0, openingCents: 0 },
      eur: { cashCents: 0, iban: '', openedAt: null },
    },
    limits: { day: PIX.dayDefaultLimitCents, night: PIX.nightDefaultLimitCents, pending: {} },
    pix: { keys: [], favorites: [], directory: [] },
    card: {
      brand: CARD.brand,
      number: CARD.numberFull,
      last4: '7890',
      expiry: CARD.expiry,
      cvv: CARD.cvv,
      limitCents: CARD.limitCents,
      blocked: false,
      contactless: true,
      onlinePurchases: true,
      international: true,
      virtual: null,
      cycleDay: 15,
      dueOffsetDays: 12,
    },
    invoices: [],
    boxes: [],
    tx: [],
    notifications: [],
    charges: [],
    device: { id: randomDeviceId(), createdAt: iso(now()) },
  };
}

function randomDeviceId() {
  const s = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += s[Math.floor(Math.random() * s.length)];
  return out;
}

/* ------------------------------------------------------------------ conta padrão */

/** Titular da conta — nome, CPF e e-mail ficam gravados no aparelho. */
function applyDefaultProfile(state) {
  state.profile = {
    ...state.profile,
    name: DEFAULT_USER.name,
    firstName: DEFAULT_USER.firstName,
    initials: DEFAULT_USER.initials,
    cpf: DEFAULT_USER.cpf,
    email: DEFAULT_USER.email,
  };
  return state;
}

/** Senha padrão de 6 dígitos; depois da primeira troca ela não é mais reescrita. */
function setDefaultPassword(state) {
  state.security.salt = '';
  state.security.hash = '';
  state.security.tempPassword = DEFAULT_USER.password;
  state.security.attempts = { attempts: 0, lockedUntil: 0 };
  write(ATTEMPTS_KEY, { attempts: 0, lockedUntil: 0 });
  return state;
}

/** Abre o app já com a conta criada: cai na tela de senha, não no cadastro. */
function provision(state) {
  applyDefaultProfile(state);
  state.onboardedAt = state.onboardedAt || iso(now());
  setDefaultPassword(state);
  applyCardDemoSetup(state);
  return state;
}

/** Caixinhas em tamanho coerente com a conta: R$ 512,40 + R$ 246,80. */
const BOX_PLAN = {
  box_reserva: { balanceCents: 51_240, yieldCents: 1_240, goalCents: 200_000 },
  box_viagem: { balanceCents: 24_680, yieldCents: 1_680, goalCents: 120_000 },
};

/** Reescreve os aportes da semente antiga e aplica o plano das caixinhas. */
function applyBoxDemoSetup(state) {
  const swaps = [
    ['box_deposit', 'box_reserva', 1_000_00, 50_000, null],
    ['box_withdraw', 'box_viagem', 20_000, 2_000, 20],
    ['box_deposit', 'box_viagem', 30_000, 10_000, null],
  ];
  state.tx.forEach((t) => {
    const hit = swaps.find(([type, boxId, from]) => t.type === type && t.details?.boxId === boxId && toInt(t.amountCents) === from);
    if (!hit) return;
    t.amountCents = hit[3];
    if (hit[4] !== null && t.details) t.details.irCents = hit[4];
  });
  if (!state.tx.some((t) => t.type === 'box_deposit' && t.details?.boxId === 'box_viagem' && toInt(t.amountCents) === 15_000)) {
    state.tx.push({
      id: uid('tx'), type: 'box_deposit', amountCents: 15_000, status: 'done', currency: 'BRL',
      at: iso(daysAgo(46, 16)), title: 'Aporte na caixinha', subtitle: 'Viagem', details: { boxId: 'box_viagem' },
    });
    state.tx.sort((a, b) => new Date(b.at) - new Date(a.at));
  }
  state.boxes.forEach((box) => {
    if (BOX_PLAN[box.id]) Object.assign(box, BOX_PLAN[box.id]);
  });
  return state;
}

/** Limite do cartão em euro e fatura do ciclo quitada. */
function applyCardDemoSetup(state) {
  state.card.limitCents = CARD.limitCents;
  const invoice = invoiceOf(state);
  if (CARD.invoiceOpenCents <= 0) {
    if (invoice.remainingCents > 0) {
      addTx(state, {
        type: 'card_payment',
        amountCents: invoice.remainingCents,
        title: 'Pagamento da fatura',
        subtitle: 'Fatura deste ciclo quitada',
        details: { invoiceId: invoice.id, setup: true },
      });
    }
    return state;
  }
  const delta = CARD.invoiceOpenCents - invoice.remainingCents;
  if (delta <= 0) return state;
  const start = new Date(invoice.monthStart).getTime();
  const close = new Date(invoice.closeAt).getTime();
  const when = Math.max(start + 2 * 3600e3, Math.min((start + close) / 2, Date.now() - 2 * 3600e3));
  addTx(state, {
    type: 'card_purchase',
    amountCents: delta,
    at: iso(new Date(when)),
    title: 'Casa & Cia — móveis planejados',
    subtitle: 'Parcelado 1/10',
    details: { setup: true },
  });
  return state;
}

/* ------------------------------------------------------------------ lançamentos */

function signedAmount(tx) {
  const meta = txMeta(tx.type);
  const value = toInt(tx.amountCents);
  if (meta.dir === 0) return 0;
  return meta.dir > 0 ? value : -value;
}

export function addTx(state, tx) {
  const full = {
    id: uid('tx'),
    at: iso(now()),
    status: 'done',
    currency: 'BRL',
    ...tx,
  };
  state.tx.unshift(full);
  state.tx.sort((a, b) => new Date(b.at) - new Date(a.at));
  return full;
}

function applyMovement(state, tx) {
  const delta = signedAmount(tx);
  if (tx.currency === 'EUR') state.accounts.eur.cashCents = toInt(state.accounts.eur.cashCents) + delta;
  else state.accounts.brl.cashCents = toInt(state.accounts.brl.cashCents) + delta;
}

function notify(state, { title, body, txId = null, kind = 'info' }) {
  state.notifications.unshift({ id: uid('nf'), at: iso(now()), title, body, read: false, txId, kind });
  state.notifications = state.notifications.slice(0, 60);
}

export function scheduledDebits(state) {
  const future = new Date();
  return state.tx
    .filter((t) => t.status === 'scheduled' && new Date(t.at) > future && signedAmount(t) < 0)
    .reduce((acc, t) => acc + Math.abs(signedAmount(t)), 0);
}

export function availableBRL(state) {
  return toInt(state.accounts.brl.cashCents) - scheduledDebits(state);
}

/* ------------------------------------------------------------------ semente da conta */

const CONTACT_KEYS = {
  joao: 'joao.ribeiro@gmail.com',
  marina: '+5511998887766',
  mercado: cnpjWithDVs('203597360001'),
  paula: cpfWithDVs('250146094'),
  rafael: '+5521987654321',
};

const CONTACTS = [
  { key: CONTACT_KEYS.joao, holder: 'João Ribeiro', bank: 'Itaú Unibanco S.A.', lastPixCents: 8500 },
  { key: CONTACT_KEYS.marina, holder: 'Marina Duarte', bank: 'Banco Inter', lastPixCents: 4000 },
  { key: CONTACT_KEYS.mercado, holder: 'Café Aurora Ltda', bank: 'Banco do Brasil S.A.', lastPixCents: 15400 },
  { key: CONTACT_KEYS.paula, holder: 'Paula Nogueira', bank: 'Nubank', lastPixCents: 20000 },
];

const OWN_KEYS_SEED = [
  { type: 'cpf', value: DEFAULT_USER.cpfDigits, verifiedAt: iso(daysAgo(200)) },
  { type: 'email', value: DEFAULT_USER.email, verifiedAt: iso(daysAgo(120)) },
];

function seed(state) {
  const t = state.tx;
  const push = (tx) => t.push({ id: uid('tx'), status: 'done', currency: 'BRL', at: iso(new Date()), ...tx });

  // histórico coerente: da mais antiga para a mais nova
  push({ type: 'deposit', amountCents: 100_000, at: iso(daysAgo(88, 9)), title: 'Depósito recebido', subtitle: 'Transferência de Paula Nogueira' });
  push({ type: 'box_deposit', amountCents: 50_000, at: iso(daysAgo(84, 11)), title: 'Aporte na caixinha', subtitle: 'Reserva de emergência', details: { boxId: 'box_reserva' } });
  push({ type: 'card_purchase', amountCents: 32_900, at: iso(daysAgo(80, 13)), title: 'Supermercado Bonavia', subtitle: 'Crédito à vista' });
  push({ type: 'pix_out', amountCents: 15_400, at: iso(daysAgo(78, 18)), title: 'Pix enviado', subtitle: 'Café Aurora Ltda', details: { key: CONTACT_KEYS.mercado, holder: 'Café Aurora Ltda', e2e: makeE2E(daysAgo(78, 18)) } });
  push({ type: 'bill_automatic', amountCents: 11_990, at: iso(daysAgo(74, 6)), title: 'Cobrança automática', subtitle: 'Internet fibra — Enet' });
  push({ type: 'boleto_out', amountCents: 9_230, at: iso(daysAgo(70, 20)), title: 'Pagamento de boleto', subtitle: 'Energia — Enel SP', details: { barcode: 'demo', fator: 1400 } });
  push({ type: 'pix_in', amountCents: 40_000, at: iso(daysAgo(66, 15)), title: 'Pix recebido', subtitle: 'Marina Duarte', details: { key: CONTACT_KEYS.marina, holder: 'Marina Duarte', e2e: makeE2E(daysAgo(66, 15)) } });
  const fxSeedDetails = { eurCents: 10_000, rate: 56_440, changeBRL: 564_40, iofCents: 19_76, totalBRL: 584_16, contract: 'CTR-9931746210', pair: 'seed_fx' };
  push({ type: 'fx_buy', amountCents: 584_16, at: iso(daysAgo(60, 10)), title: 'Compra de euros', subtitle: `Saída de ${fmt(584_16, 'BRL')}`, currency: 'BRL', details: fxSeedDetails });
  push({ type: 'fx_credit_eur', amountCents: 10_000, at: iso(daysAgo(60, 10)), title: 'Entrada de euros', subtitle: 'Câmbio CTR-9931746210', currency: 'EUR', details: fxSeedDetails });
  push({ type: 'deposit', amountCents: DEMO_EUR_CENTS - 10_000, at: iso(daysAgo(45, 15)), title: 'Depósito em euros', subtitle: 'Recebido de Lisboa', currency: 'EUR', details: { holder: 'Studio Alfama', simulated: false } });
  push({ type: 'recharge', amountCents: 3_000, at: iso(daysAgo(57, 12)), title: 'Recarga de celular', subtitle: 'Vivo • (11) 97777-1024', details: { operator: 'Vivo', phone: '+5511977771024', creditsCents: 2_400 } });
  push({ type: 'card_purchase', amountCents: 17_800, at: iso(daysAgo(52, 19)), title: 'Restaurante Tanjão', subtitle: 'Crédito à vista' });
  push({ type: 'card_payment', amountCents: 61_700, at: iso(daysAgo(50, 9)), title: 'Pagamento da fatura', subtitle: 'Fatura de setembro', details: { invoiceId: 'inv_set' } });
  push({ type: 'box_deposit', amountCents: 15_000, at: iso(daysAgo(46, 16)), title: 'Aporte na caixinha', subtitle: 'Viagem', details: { boxId: 'box_viagem' } });
  push({ type: 'box_withdraw', amountCents: 2_000, at: iso(daysAgo(30, 11)), title: 'Resgate da caixinha', subtitle: 'Viagem', details: { boxId: 'box_viagem', irCents: 20 } });
  push({ type: 'pix_in', amountCents: 25_000, at: iso(daysAgo(40, 11)), title: 'Pix recebido', subtitle: 'João Ribeiro', details: { key: CONTACT_KEYS.joao, holder: 'João Ribeiro', e2e: makeE2E(daysAgo(40, 11)) } });
  push({ type: 'card_purchase', amountCents: 9_600, at: iso(daysAgo(33, 12)), title: 'Uber *Trip', subtitle: 'Crédito à vista' });
  push({ type: 'deposit', amountCents: 250_000, at: iso(daysAgo(31, 8)), title: 'Salário', subtitle: 'PIX salário — ACME Ltda' });
  push({ type: 'boleto_out', amountCents: 8_450, at: iso(daysAgo(28, 21)), title: 'Pagamento de boleto', subtitle: 'Água — Sabesp' });
  push({ type: 'pix_out', amountCents: 8_500, at: iso(daysAgo(24, 13)), title: 'Pix enviado', subtitle: 'João Ribeiro', details: { key: CONTACT_KEYS.joao, holder: 'João Ribeiro', e2e: makeE2E(daysAgo(24, 13)) } });
  push({ type: 'card_purchase', amountCents: 4_350, at: iso(daysAgo(21, 15)), title: 'Farmácia Pague Menos', subtitle: 'Crédito à vista' });
  push({ type: 'box_deposit', amountCents: 10_000, at: iso(daysAgo(19, 10)), title: 'Aporte na caixinha', subtitle: 'Viagem', details: { boxId: 'box_viagem' } });
  push({ type: 'card_purchase', amountCents: 28_900, at: iso(daysAgo(16, 20)), title: 'Cinemark Shopping Norte', subtitle: 'Crédito à vista' });
  push({ type: 'pix_out', amountCents: 20_000, at: iso(daysAgo(12, 17)), title: 'Pix enviado', subtitle: 'Paula Nogueira', details: { key: CONTACT_KEYS.paula, holder: 'Paula Nogueira', e2e: makeE2E(daysAgo(12, 17)) } });
  push({ type: 'card_purchase', amountCents: 23_900, at: iso(daysAgo(9, 11)), title: 'Mercado Livre', subtitle: 'Crédito à vista' });
  push({ type: 'boleto_out', amountCents: 6_890, at: iso(daysAgo(7, 19)), title: 'Pagamento de boleto', subtitle: 'Mensalidade academia' });
  push({ type: 'pix_in', amountCents: 12_000, at: iso(daysAgo(5, 16)), title: 'Pix recebido', subtitle: 'Paula Nogueira', details: { key: CONTACT_KEYS.paula, holder: 'Paula Nogueira', e2e: makeE2E(daysAgo(5, 16)) } });
  push({ type: 'card_purchase', amountCents: 3_990, at: iso(daysAgo(4, 8)), title: 'Spotify', subtitle: 'Assinatura' });
  push({ type: 'pix_out', amountCents: 4_000, at: iso(daysAgo(2, 12, 35)), title: 'Pix enviado', subtitle: 'Marina Duarte', details: { key: CONTACT_KEYS.marina, holder: 'Marina Duarte', e2e: makeE2E(daysAgo(2, 12)) } });
  push({ type: 'card_purchase', amountCents: 19_900, at: iso(daysAgo(1, 20, 10)), title: 'PaperStack Livraria', subtitle: 'Crédito à vista' });
  push({ type: 'card_purchase', amountCents: 7_400, at: iso(daysAgo(0, 9, 40)), title: 'Padaria Estrela', subtitle: 'Crédito à vista' });

  // agendado: mostra que existe fila de Pix futuros
  t.push({
    id: uid('tx'), type: 'pix_out', amountCents: 6_000, status: 'scheduled',
    at: iso(daysAgo(-3, 10)), title: 'Pix agendado', subtitle: 'Marina Duarte',
    details: { key: CONTACT_KEYS.marina, holder: 'Marina Duarte', scheduled: true },
  });

  t.sort((a, b) => new Date(b.at) - new Date(a.at));

  applyCardDemoSetup(state);
  const netBRL = t.filter((x) => x.currency !== 'EUR' && x.status === 'done').reduce((acc, x) => acc + signedAmount(x), 0);
  const targetBRL = DEMO_BRL_CENTS;
  state.accounts.brl.openingCents = targetBRL - netBRL;
  state.accounts.brl.cashCents = targetBRL;
  const netEUR = t.filter((x) => x.currency === 'EUR' && x.status === 'done').reduce((acc, x) => acc + signedAmount(x), 0);
  state.accounts.eur.openingCents = 0;
  state.accounts.eur.cashCents = netEUR;
  state.accounts.eur.openedAt = iso(daysAgo(60));
  state.accounts.eur.iban = BANK.eurIban;

  state.pix.keys = OWN_KEYS_SEED.map((k, i) => ({ id: `key_${i}`, ...k, isDefault: i === 0 }));
  state.pix.favorites = CONTACTS.map((c, i) => ({ id: `fav_${i}`, ...c }));
  state.pix.directory = CONTACTS.map((c) => ({ key: c.key, holder: c.holder, bank: c.bank }));
  state.pix.directory.push({ key: CONTACT_KEYS.rafael, holder: 'Rafael Lima', bank: 'Caixa Econômica Federal' });

  state.boxes = [
    {
      id: 'box_reserva', name: 'Reserva de emergência', icon: 'bank', goalCents: BOX_PLAN.box_reserva.goalCents,
      balanceCents: BOX_PLAN.box_reserva.balanceCents, yieldCents: BOX_PLAN.box_reserva.yieldCents, percentCdi: 10000,
      createdAt: iso(daysAgo(84)), lastAccrualAt: iso(daysAgo(1)),
    },
    {
      id: 'box_viagem', name: 'Viagem a Lisboa', icon: 'globe', goalCents: BOX_PLAN.box_viagem.goalCents,
      balanceCents: BOX_PLAN.box_viagem.balanceCents, yieldCents: BOX_PLAN.box_viagem.yieldCents, percentCdi: 9000,
      createdAt: iso(daysAgo(46)), lastAccrualAt: iso(daysAgo(1)),
    },
  ];

  state.invoices = [
    { id: 'inv_set', monthStart: iso(daysAgo(50)), closeAt: iso(daysAgo(15)), dueAt: iso(daysAgo(-3)), status: 'paid', totalCents: 61_700 },
  ];

  state.notifications = [
    { id: uid('nf'), at: iso(daysAgo(0, 9, 42)), title: 'Compra no crédito', body: 'Padaria Estrela • R$ 74,00', read: false, kind: 'card' },
    { id: uid('nf'), at: iso(daysAgo(1, 20, 12)), title: 'Compra no crédito', body: 'PaperStack Livraria • R$ 199,00', read: false, kind: 'card' },
    { id: uid('nf'), at: iso(daysAgo(2, 12, 36)), title: 'Pix enviado', body: 'Marina Duarte • R$ 40,00', read: true, kind: 'pix' },
    { id: uid('nf'), at: iso(daysAgo(5, 16, 4)), title: 'Pix recebido', body: 'Paula Nogueira enviou R$ 120,00', read: true, kind: 'pix' },
    { id: uid('nf'), at: iso(daysAgo(7, 19, 1)), title: 'Pagamento confirmado', body: 'Boleto da academia pago', read: true, kind: 'bill' },
  ];

  state.charges = [
    {
      id: 'chg_1', amountCents: 7_500, key: DEFAULT_USER.email, txid: makeTxid(10),
      createdAt: iso(daysAgo(3)), paidAt: null, status: 'open', note: 'Rifa do bolão',
    },
  ];
  return state;
}

/* ------------------------------------------------------------------ onboarding / conta */

export async function createAccount({ name, password, email }) {
  const state = emptyState();
  const first = String(name || '').trim().split(/\s+/)[0] || 'Você';
  const full = String(name || '').trim();
  const initials = full
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'IP';
  state.profile = { ...state.profile, name: full || first, firstName: first, initials, email: email || '' };
  state.onboardedAt = iso(now());
  const salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  state.security.salt = salt;
  state.security.hash = password ? await hashPassword(password, salt) : '';
  state.security.tempPassword = password ? null : DEFAULT_USER.password;
  seed(state);
  memory = state;
  persist(true);
  return state;
}

/** Primeiro acesso sem senha definida: permite criar a senha na hora. */
export function needsPasswordSetup() {
  const s = getState();
  return Boolean(s.onboardedAt) && !s.security.hash && Boolean(s.security.tempPassword);
}

export function passwordHint() {
  return getState().security.tempPassword || null;
}

/* ------------------------------------------------------------------ login / bloqueio */

export function readDeviceFlags() {
  return read(DEVICE_KEY) || { locked: true, lastActiveAt: 0 };
}
export function writeDeviceFlags(patch) {
  const next = { ...readDeviceFlags(), ...patch };
  write(DEVICE_KEY, next);
  return next;
}

export function isLocked() {
  const s = getState();
  if (!s.onboardedAt) return false;
  const flags = readDeviceFlags();
  const autoLock = toInt(s.security.autoLockSeconds) || 60;
  const idle = (Date.now() - toInt(flags.lastActiveAt)) / 1000;
  if (flags.locked === false && idle <= autoLock) return false;
  return true;
}

export function markActive() {
  writeDeviceFlags({ lastActiveAt: Date.now() });
}

export function lockApp() {
  writeDeviceFlags({ locked: true, lastActiveAt: 0 });
  emit();
}

export function attempts() {
  return read(ATTEMPTS_KEY) || { attempts: 0, lockedUntil: 0 };
}

export async function unlockWithPassword(password) {
  const s = getState();
  const st = attempts();
  const status = lockStatus(st);
  if (status.locked) {
    return { ok: false, code: 'locked', secondsLeft: status.secondsLeft };
  }
  const input = String(password || '').trim();
  const usingTemp = Boolean(s.security.tempPassword);
  const ok = usingTemp ? input === s.security.tempPassword : await checkPassword(input, s.security.salt, s.security.hash);
  if (ok) {
    if (usingTemp) {
      s.security.salt = s.security.salt || Math.random().toString(36).slice(2);
      s.security.hash = await hashPassword(input, s.security.salt);
      s.security.tempPassword = null;
    }
    write(ATTEMPTS_KEY, { attempts: 0, lockedUntil: 0 });
    writeDeviceFlags({ locked: false, lastActiveAt: Date.now() });
    memory = s;
    persist(true);
    return { ok: true };
  }
  const nextAttempt = registerAttempt(st, false);
  write(ATTEMPTS_KEY, nextAttempt);
  if (nextAttempt.lockedUntil) {
    return { ok: false, code: 'locked', secondsLeft: Math.ceil((nextAttempt.lockedUntil - Date.now()) / 1000) };
  }
  return { ok: false, code: 'wrong', attemptsLeft: Math.max(0, 5 - (nextAttempt.attempts || 0)) };
}

export async function setPassword(password) {
  const s = getState();
  s.security.salt = s.security.salt || Math.random().toString(36).slice(2) + Date.now().toString(36);
  s.security.hash = await hashPassword(password, s.security.salt);
  s.security.tempPassword = null;
  memory = s;
  persist(true);
  return { ok: true };
}

export async function changePassword(current, next) {
  const s = getState();
  if (s.security.tempPassword) {
    if (current !== s.security.tempPassword) return { ok: false, code: 'wrongCurrent' };
  } else {
    const ok = await checkPassword(current, s.security.salt, s.security.hash);
    if (!ok) return { ok: false, code: 'wrongCurrent' };
  }
  s.security.salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
  s.security.hash = await hashPassword(next, s.security.salt);
  memory = s;
  persist(true);
  return { ok: true };
}

export function setBiometric(credentialId) {
  return act((s) => {
    s.security.biometric = credentialId;
    return { ok: true };
  });
}

/** Confirma a senha para autorizar uma operação (não desbloqueia o app). */
export async function authorizePassword(password) {
  const s = getState();
  const st = attempts();
  const status = lockStatus(st);
  if (status.locked) return { ok: false, code: 'locked', secondsLeft: status.secondsLeft };
  const ok = s.security.tempPassword
    ? String(password) === s.security.tempPassword
    : await checkPassword(String(password), s.security.salt, s.security.hash);
  const next = registerAttempt(st, ok);
  write(ATTEMPTS_KEY, next);
  if (ok) return { ok: true };
  if (next.lockedUntil) {
    return { ok: false, code: 'locked', secondsLeft: Math.ceil((next.lockedUntil - Date.now()) / 1000) };
  }
  return { ok: false, code: 'wrong', attemptsLeft: Math.max(0, 5 - (next.attempts || 0)) };
}

/* ------------------------------------------------------------------ configurações */

export function setCurrency(currency) {
  return act((s) => {
    s.settings.currency = currency === 'EUR' ? 'EUR' : 'BRL';
    return { ok: true, currency: s.settings.currency };
  });
}

export function setTheme(theme) {
  return act((s) => {
    s.settings.theme = theme;
    return { ok: true };
  });
}

export function setHideBalance(value) {
  return act((s) => {
    s.security.hideBalance = Boolean(value);
    return { ok: true };
  });
}

export function setAutoLock(seconds) {
  return act((s) => {
    s.security.autoLockSeconds = toInt(seconds) || 60;
    return { ok: true };
  });
}

export function setRate(rateCents) {
  return act((s) => {
    const value = toInt(rateCents);
    if (value < 10_000 || value > 200_000) return { ok: false, error: 'Cotação fora da faixa (R$ 100,00 a R$ 2.000,00 por euro).' };
    s.settings.fx.rate = value;
    s.settings.fx.updatedAt = iso(now()).slice(0, 10);
    s.settings.fx.manual = true;
    return { ok: true, rate: value };
  });
}

export function resetRate() {
  return act((s) => {
    s.settings.fx = { rate: FX.defaultRateBRLPerEUR, updatedAt: FX.rateUpdatedAt, manual: false };
    return { ok: true };
  });
}

export function updateProfile(patch) {
  return act((s) => {
    const name = patch.name != null ? String(patch.name).trim() : s.profile.name;
    if (patch.name != null && name.length < 2) return { ok: false, error: 'Informe seu nome completo.' };
    const parts = name.split(/\s+/).filter(Boolean);
    s.profile = {
      ...s.profile,
      ...patch,
      name,
      firstName: parts[0] || 'Você',
      initials: (parts[0]?.[0] || 'I').toUpperCase() + (parts[1]?.[0] || '').toUpperCase(),
    };
    return { ok: true, profile: s.profile };
  });
}

/* ------------------------------------------------------------------ Pix */

export function ownKeyValues(state = getState()) {
  return state.pix.keys.map((k) => k.value.replace(/\D/g, '').toLowerCase());
}

export function resolveKey(state, keyObj) {
  if (!keyObj || !keyObj.value) return { found: false };
  const normalized = keyObj.value.replace(/\s/g, '').toLowerCase();
  const own = state.pix.keys.find((k) => k.value.replace(/\s/g, '').toLowerCase() === normalized);
  if (own) return { found: true, own: true, holder: state.profile.name, bank: `${BANK.name}` };
  const dir = state.pix.directory.find((d) => d.key.replace(/\s/g, '').toLowerCase() === normalized);
  if (dir) return { found: true, holder: dir.holder, bank: dir.bank };
  const fav = state.pix.favorites.find((f) => f.key.replace(/\s/g, '').toLowerCase() === normalized);
  if (fav) return { found: true, holder: fav.holder, bank: fav.bank };
  return { found: false };
}

export function sendPix({ keyObj, amountCents, message = '', when = null, fromChargeNote = '' }) {
  return act((s) => {
    const amount = toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    const date = when ? new Date(when) : now();
    const resolved = resolveKey(s, keyObj);
    if (resolved.own) return { ok: false, code: 'self' };
    if (!resolved.found) return { ok: false, code: 'unknownKey' };
    const future = date > new Date(Date.now() + 60_000);
    const limit = checkLimit(s, amount, date);
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    if (!limit.ok) return { ok: false, code: 'limit', win: limit.win, remaining: limit.remaining, limit: limit.limit, used: limit.used };

    const tx = addTx(s, {
      type: 'pix_out',
      amountCents: amount,
      at: iso(date),
      status: future ? 'scheduled' : 'done',
      title: future ? 'Pix agendado' : 'Pix enviado',
      subtitle: resolved.holder,
      details: {
        key: keyObj.value,
        keyType: keyObj.type,
        holder: resolved.holder,
        bank: resolved.bank,
        sender: s.profile.name,
        message: message.slice(0, 40),
        e2e: makeE2E(date),
        ispbOrigin: BANK.ispb,
        note: fromChargeNote,
      },
    });
    if (!future) applyMovement(s, tx);
    notify(s, {
      title: future ? 'Pix agendado' : 'Pix enviado',
      body: `${resolved.holder} • ${fmt(amount, 'BRL')}`,
      txId: tx.id,
      kind: 'pix',
    });
    return { ok: true, tx, future };
  });
}

/** Transferência sem chave Pix (agência e conta de outro banco). */
export function manualTransfer({ bank, agency, account, holder, accountType = '01', amountCents }) {
  return act((s) => {
    const amount = toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    const bankCode = String(bank).replace(/\D/g, '');
    if (bankCode.length !== 3) return { ok: false, code: 'invalid', error: 'O código do banco precisa ter 3 dígitos.' };
    if (!String(holder || '').trim()) return { ok: false, code: 'invalid', error: 'Informe o nome de quem recebe.' };
    if (bankCode === BANK.code) return { ok: false, code: 'self' };
    const date = now();
    const limit = checkLimit(s, amount, date);
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    if (!limit.ok) return { ok: false, code: 'limit', win: limit.win, remaining: limit.remaining };
    const tx = addTx(s, {
      type: 'manual_out',
      amountCents: amount,
      title: 'Transferência enviada',
      subtitle: String(holder).trim(),
      details: {
        holder: String(holder).trim(),
        bank: BOLETO.banks[bankCode] || `Banco ${bankCode}`,
        bankCode,
        agency: String(agency).replace(/\D/g, ''),
        account: String(account).replace(/\D/g, ''),
        accountType,
        e2e: makeE2E(date),
      },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Transferência enviada', body: `${holder} • ${fmt(amount, 'BRL')}`, txId: tx.id, kind: 'pix' });
    return { ok: true, tx };
  });
}

/** Pagamento de um BR Code já lido (QR ou copia e cola). */
export function payBRCode({ parsed, amountCents = null, message = '' }) {
  return act((s) => {
    if (!parsed?.ok) return { ok: false, code: 'parse', error: parsed?.error };
    const amount = amountCents == null ? toInt(parsed.amountCents) : toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    const own = s.pix.keys.some((k) => k.value.replace(/\s/g, '').toLowerCase() === String(parsed.key).replace(/\s/g, '').toLowerCase());
    if (own) return { ok: false, code: 'selfCharge' };
    const limit = checkLimit(s, amount, now());
    if (!limit.ok) return { ok: false, code: 'limit', win: limit.win, remaining: limit.remaining };
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    const date = now();
    const tx = addTx(s, {
      type: 'pix_out',
      amountCents: amount,
      title: 'Pagamento via Pix',
      subtitle: parsed.merchantName || parsed.key,
      details: {
        key: parsed.key,
        holder: parsed.merchantName,
        city: parsed.merchantCity,
        txid: parsed.txid,
        e2e: makeE2E(date),
        message: message.slice(0, 40),
        payload: parsed.payload,
        brCode: true,
      },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Pagamento confirmado', body: `${parsed.merchantName || parsed.key}`, txId: tx.id, kind: 'pix' });
    return { ok: true, tx };
  });
}

/** Cria uma cobrança: gera BR Code + QR e fica pendente até "receber". */
export function createCharge({ amountCents, key, txid, note = '' }) {
  return act((s) => {
    const amount = toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    const chosen = s.pix.keys.find((k) => k.value === key) ? key : s.pix.keys[0]?.value;
    if (!chosen) return { ok: false, code: 'noKey', error: 'Cadastre uma chave Pix antes de cobrar.' };
    const charge = {
      id: uid('chg'),
      amountCents: amount,
      key: chosen,
      txid: (txid || makeTxid(10)).slice(0, 25),
      note: note.slice(0, 34),
      createdAt: iso(now()),
      paidAt: null,
      status: 'open',
    };
    s.charges.unshift(charge);
    s.charges = s.charges.slice(0, 40);
    return { ok: true, charge };
  });
}

export function receiveCharge(chargeId) {
  return act((s) => {
    const charge = s.charges.find((c) => c.id === chargeId);
    if (!charge) return { ok: false, code: 'notFound' };
    if (charge.status === 'paid') return { ok: false, code: 'alreadyPaid' };
    if (charge.status === 'canceled') return { ok: false, code: 'canceled' };
    charge.status = 'paid';
    charge.paidAt = iso(now());
    const tx = addTx(s, {
      type: 'charge_paid',
      amountCents: charge.amountCents,
      title: 'Cobrança Pix recebida',
      subtitle: charge.note || 'Recebido via QR Code',
      details: { key: charge.key, txid: charge.txid, e2e: makeE2E(now()), chargeId: charge.id },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Você recebeu um Pix', body: `Cobrança de ${charge.key} paga`, txId: tx.id, kind: 'pix' });
    return { ok: true, tx, charge };
  });
}

export function cancelCharge(chargeId) {
  return act((s) => {
    const charge = s.charges.find((c) => c.id === chargeId);
    if (!charge || charge.status === 'paid') return { ok: false, code: 'notOpen' };
    charge.status = 'canceled';
    return { ok: true };
  });
}

export function registerKey({ type, value, code, expectedCode }) {
  return act((s) => {
    if (expectedCode != null && String(code) !== String(expectedCode)) return { ok: false, code: 'sms' };
    if (s.pix.keys.some((k) => k.value.replace(/\s/g, '') === String(value).replace(/\s/g, ''))) {
      return { ok: false, code: 'duplicate' };
    }
    if (s.pix.keys.length >= PIX.maxKeysPerPerson) return { ok: false, code: 'maxKeys' };
    if (type === 'cpf' && value !== s.profile.cpf.replace(/\D/g, '')) return { ok: false, code: 'cpfMismatch' };
    s.pix.keys.push({ id: uid('key'), type, value, verifiedAt: iso(now()), isDefault: s.pix.keys.length === 0 });
    return { ok: true };
  });
}

export function deleteKey(keyId) {
  return act((s) => {
    const idx = s.pix.keys.findIndex((k) => k.id === keyId);
    if (idx === -1) return { ok: false, code: 'notFound' };
    const hadDefault = s.pix.keys[idx].isDefault;
    s.pix.keys.splice(idx, 1);
    if (hadDefault && s.pix.keys[0]) s.pix.keys[0].isDefault = true;
    return { ok: true };
  });
}

export function setDefaultKey(keyId) {
  return act((s) => {
    s.pix.keys.forEach((k) => { k.isDefault = k.id === keyId; });
    return { ok: true };
  });
}

export function addFavorite({ key, holder, bank }) {
  return act((s) => {
    if (!key || !holder) return { ok: false, code: 'incomplete' };
    if (s.pix.favorites.some((f) => f.key === key)) return { ok: false, code: 'duplicate' };
    s.pix.favorites.push({ id: uid('fav'), key, holder, bank: bank || 'Outro banco', lastPixCents: 0 });
    return { ok: true };
  });
}

export function removeFavorite(id) {
  return act((s) => {
    s.pix.favorites = s.pix.favorites.filter((f) => f.id !== id);
    return { ok: true };
  });
}

export function requestLimitChange({ win, valueCents }) {
  return act((s) => {
    const current = toInt(s.limits[win]);
    const value = toInt(valueCents);
    if (value < 0) return { ok: false, code: 'invalid' };
    if (value > 100_000_000) return { ok: false, code: 'tooHigh', max: 100_000_000 };
    if (value === current) return { ok: false, code: 'same' };
    const result = scheduleLimitChange(s, win, value, now());
    notify(s, {
      title: 'Limite Pix atualizado',
      body: result.applied === 'immediate' ? 'Redução aplicada na hora' : 'Aumento passa a valer em 24h',
      kind: 'security',
    });
    return { ok: true, ...result };
  });
}

/* ------------------------------------------------------------------ boleto / recarga */

export function payBoleto({ linha, amountCentsOverride = null }) {
  return act((s) => {
    const parsed = readLinhaDigitavel(linha);
    if (!parsed.ok) return { ok: false, code: 'parse', error: parsed.error };
    if (parsed.overdue) return { ok: false, code: 'overdue' };
    const amount = parsed.needsManualAmount ? toInt(amountCentsOverride) : toInt(parsed.valorCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    const limit = checkLimit(s, amount, now());
    if (!limit.ok) return { ok: false, code: 'limit', win: limit.win, remaining: limit.remaining };
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    const tx = addTx(s, {
      type: 'boleto_out',
      amountCents: amount,
      title: 'Pagamento de boleto',
      subtitle: parsed.bankName,
      details: {
        barcode: parsed.digits,
        banco: parsed.banco,
        fator: parsed.fator ?? null,
        vencimento: parsed.vencimento ? iso(parsed.vencimento) : null,
        kind: parsed.kind,
        confirmedValue: parsed.needsManualAmount,
      },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Pagamento confirmado', body: `${parsed.bankName} • boleto`, txId: tx.id, kind: 'bill' });
    return { ok: true, tx, parsed };
  });
}

export function payRecharge({ operator, phone, amountCents }) {
  return act((s) => {
    const amount = toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    if (!/\d{10,11}/.test(String(phone).replace(/\D/g, ''))) return { ok: false, code: 'phone' };
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    const credits = Math.round(amount * 0.82);
    const tx = addTx(s, {
      type: 'recharge',
      amountCents: amount,
      title: 'Recarga de celular',
      subtitle: `${operator} • ${phone}`,
      details: { operator, phone, creditsCents: credits },
    });
    applyMovement(s, tx);
    return { ok: true, tx, credits };
  });
}

/* ------------------------------------------------------------------ câmbio */

export function buyEuros(eurCents) {
  return act((s) => {
    const q = quoteBuy(s, toInt(eurCents));
    if (q.eurCents < FX.minBuyEurCents) return { ok: false, code: 'min' };
    const today = new Date().toISOString().slice(0, 10);
    const used = s.tx
      .filter((t) => t.type === 'fx_buy' && String(t.at).slice(0, 10) === today)
      .reduce((acc, t) => acc + toInt(t.details?.eurCents), 0);
    if (used + q.eurCents > FX.maxDailyBuyEurCents) return { ok: false, code: 'dailyLimit' };
    if (q.totalBRL > availableBRL(s)) return { ok: false, code: 'funds' };
    const pair = uid('pair');
    const contract = `CTR-${makeContractNumber(10)}`;
    const shared = {
      eurCents: q.eurCents,
      rate: q.rate,
      changeBRL: q.changeBRL,
      iofCents: q.iofBRL,
      totalBRL: q.totalBRL,
      vetRate: q.vetRate,
      contract,
      pair,
      rateUpdatedAt: s.settings.fx.updatedAt,
    };
    const tx = addTx(s, {
      type: 'fx_buy',
      amountCents: q.totalBRL,
      currency: 'BRL',
      title: 'Compra de euros',
      subtitle: `Saída de ${fmt(q.totalBRL, 'BRL')}`,
      details: shared,
    });
    const leg = addTx(s, {
      type: 'fx_credit_eur',
      amountCents: q.eurCents,
      currency: 'EUR',
      title: 'Entrada de euros',
      subtitle: `Câmbio ${contract}`,
      details: shared,
    });
    applyMovement(s, tx);
    applyMovement(s, leg);
    if (!s.accounts.eur.openedAt) s.accounts.eur.openedAt = iso(now());
    if (!s.accounts.eur.iban) s.accounts.eur.iban = BANK.eurIban;
    notify(s, { title: 'Câmbio realizado', body: `Você comprou ${fmt(q.eurCents, 'EUR')}`, txId: leg.id, kind: 'fx' });
    return { ok: true, tx, leg, quote: q };
  });
}

export function sellEuros(eurCents) {
  return act((s) => {
    const q = quoteSell(s, toInt(eurCents));
    if (q.eurCents < FX.minBuyEurCents) return { ok: false, code: 'min' };
    if (q.eurCents > toInt(s.accounts.eur.cashCents)) return { ok: false, code: 'fundsEur' };
    const pair = uid('pair');
    const contract = `CTR-${makeContractNumber(10)}`;
    const shared = {
      eurCents: q.eurCents,
      rate: q.rate,
      changeBRL: q.changeBRL,
      iofCents: q.iofBRL,
      totalBRL: q.totalBRL,
      vetRate: q.vetRate,
      contract,
      pair,
    };
    const debit = addTx(s, {
      type: 'fx_debit_eur',
      amountCents: q.eurCents,
      currency: 'EUR',
      title: 'Saída de euros',
      subtitle: `Venda ${contract}`,
      details: shared,
    });
    const tx = addTx(s, {
      type: 'fx_sell',
      amountCents: q.totalBRL,
      currency: 'BRL',
      title: 'Venda de euros',
      subtitle: `Crédito de ${fmt(q.totalBRL, 'BRL')}`,
      details: shared,
    });
    applyMovement(s, debit);
    applyMovement(s, tx);
    notify(s, { title: 'Câmbio realizado', body: `Você vendeu ${fmt(q.eurCents, 'EUR')}`, txId: tx.id, kind: 'fx' });
    return { ok: true, tx, debit, quote: q };
  });
}

export function sepaTransfer({ iban, eurCents, message = '' }) {
  return act((s) => {
    const amount = toInt(eurCents);
    if (amount < FX.minBuyEurCents) return { ok: false, code: 'min' };
    if (amount > toInt(s.accounts.eur.cashCents)) return { ok: false, code: 'fundsEur' };
    const check = validateIban(iban);
    if (!check.ok) return { ok: false, code: 'iban', error: check.error };
    const tx = addTx(s, {
      type: 'sepa_out',
      amountCents: amount,
      currency: 'EUR',
      title: 'Transferência internacional',
      subtitle: check.countryName,
      details: { iban: check.value, country: check.country, message: message.slice(0, 40), eurCents: amount },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Transferência enviada', body: `${fmt(amount, 'EUR')} para ${check.countryName}`, txId: tx.id, kind: 'fx' });
    return { ok: true, tx, iban: check };
  });
}

/* ------------------------------------------------------------------ cartão */

export function setCardFlag(flag, value) {
  return act((s) => {
    if (!(flag in s.card)) return { ok: false, code: 'unknown' };
    s.card[flag] = Boolean(value);
    return { ok: true, flag, value: s.card[flag] };
  });
}

export function createVirtualCard() {
  return act((s) => {
    if (s.card.virtual) return { ok: false, code: 'exists' };
    s.card.virtual = {
      number: luhnNumber('5412'),
      expiry: s.card.expiry,
      cvv: String(Math.floor(100 + Math.random() * 900)),
      createdAt: iso(now()),
      limitCents: Math.round(s.card.limitCents * 0.4),
    };
    notify(s, { title: 'Cartão virtual criado', body: 'Use para assinaturas e compras online', kind: 'card' });
    return { ok: true, virtual: s.card.virtual };
  });
}

export function deleteVirtualCard() {
  return act((s) => {
    if (!s.card.virtual) return { ok: false, code: 'none' };
    s.card.virtual = null;
    return { ok: true };
  });
}

export function setCardLimit(valueCents) {
  return act((s) => {
    const value = toInt(valueCents);
    if (value < 50_000) return { ok: false, code: 'min', error: 'O limite mínimo é R$ 500,00.' };
    if (value > 50_000_000) return { ok: false, code: 'max', error: 'Limite acima do permitido para este perfil.' };
    s.card.limitCents = value;
    return { ok: true, limitCents: value };
  });
}

/** Compra no crédito simulada (o único jeito de gerar fatura sem loja de verdade). */
export function simulateCardPurchase({ merchant, amountCents, international = false }) {
  return act((s) => {
    const amount = toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    if (s.card.blocked) return { ok: false, code: 'blocked' };
    if (international && !s.card.international) return { ok: false, code: 'internationalOff' };
    const remaining = Math.max(0, s.card.limitCents - invoiceOf(s).remainingCents);
    if (amount > remaining) return { ok: false, code: 'limit' };
    const tx = addTx(s, {
      type: 'card_purchase',
      amountCents: amount,
      title: merchant,
      subtitle: international ? 'Compra internacional' : 'Crédito à vista',
      currency: international ? 'EUR' : 'BRL',
      details: { international, installments: 1 },
    });
    notify(s, { title: 'Compra no crédito', body: `${merchant}`, txId: tx.id, kind: 'card' });
    return { ok: true, tx };
  });
}

export function payInvoice({ amountCents, invoiceId }) {
  return act((s) => {
    const inv = invoiceOf(s);
    const amount = toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    if (inv.remainingCents <= 0) return { ok: false, code: 'settled' };
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    const tx = addTx(s, {
      type: 'card_payment',
      amountCents: amount,
      title: 'Pagamento da fatura',
      subtitle: amount >= inv.remainingCents ? 'Fatura quitada' : 'Pagamento parcial',
      details: { invoiceId: inv.id, remaining: Math.max(0, inv.remainingCents - amount), dueAt: iso(inv.dueAt) },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Fatura', body: tx.subtitle, txId: tx.id, kind: 'card' });
    return { ok: true, tx, invoice: invoiceOf(s) };
  });
}

/** Fatura do ciclo corrente, calculada a partir dos lançamentos. */
export function invoiceOf(state = getState(), reference = new Date()) {
  const cycleDay = toInt(state.card.cycleDay) || 15;
  const dueOffset = toInt(state.card.dueOffsetDays) || 12;
  const build = (ref) => {
    const y = ref.getFullYear();
    const m = ref.getMonth();
    let closeAt = new Date(y, m, cycleDay, 23, 59, 59);
    if (ref.getDate() > cycleDay) closeAt = new Date(y, m + 1, cycleDay, 23, 59, 59);
    else closeAt = new Date(y, m, cycleDay, 23, 59, 59);
    const monthStart = new Date(closeAt.getFullYear(), closeAt.getMonth() - 1, cycleDay + 1);
    const nextCycleStart = new Date(closeAt.getFullYear(), closeAt.getMonth() + 1, cycleDay + 1);
    const purchases = state.tx.filter(
      (t) => t.type === 'card_purchase' && new Date(t.at) > monthStart && new Date(t.at) <= nextCycleStart,
    );
    const totalCents = purchases.reduce((acc, t) => acc + toInt(t.amountCents), 0);
    const id = `inv_${closeAt.getFullYear()}${String(closeAt.getMonth() + 1).padStart(2, '0')}`;
    const paidCents = state.tx
      .filter((t) => t.type === 'card_payment' && new Date(t.at) >= monthStart)
      .reduce((acc, t) => acc + toInt(t.amountCents), 0);
    const dueAt = new Date(closeAt);
    dueAt.setDate(dueAt.getDate() + dueOffset);
    return {
      id,
      monthStart: iso(monthStart),
      closeAt: iso(closeAt),
      dueAt,
      totalCents,
      paidCents: Math.min(paidCents, totalCents),
      remainingCents: Math.max(0, totalCents - paidCents),
      purchases: purchases.sort((a, b) => new Date(b.at) - new Date(a.at)),
      status: totalCents === 0 ? 'empty' : Math.max(0, totalCents - paidCents) === 0 ? 'paid' : 'open',
      overDue: new Date() > dueAt && totalCents - paidCents > 0,
    };
  };
  const current = build(reference);
  const previous = build(new Date(reference.getFullYear(), reference.getMonth() - 1, 20));
  return { ...current, previous };
}

/* ------------------------------------------------------------------ caixinhas */

export function createBox({ name, icon = 'safe', goalCents = 0, percentCdi = 10000 }) {
  return act((s) => {
    const label = String(name || '').trim();
    if (label.length < 2) return { ok: false, code: 'name' };
    const box = {
      id: uid('box'),
      name: label.slice(0, 28),
      icon,
      goalCents: Math.max(0, toInt(goalCents)),
      balanceCents: 0,
      yieldCents: 0,
      percentCdi: toInt(percentCdi) || 10000,
      createdAt: iso(now()),
      lastAccrualAt: iso(now()),
    };
    s.boxes.push(box);
    return { ok: true, box };
  });
}

export function depositBox({ boxId, amountCents }) {
  return act((s) => {
    const box = s.boxes.find((b) => b.id === boxId);
    const amount = toInt(amountCents);
    if (!box) return { ok: false, code: 'notFound' };
    if (amount <= 0) return { ok: false, code: 'amount' };
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    const tx = addTx(s, {
      type: 'box_deposit',
      amountCents: amount,
      title: 'Aporte na caixinha',
      subtitle: box.name,
      details: { boxId: box.id },
    });
    applyMovement(s, tx);
    box.balanceCents = toInt(box.balanceCents) + amount;
    return { ok: true, tx, box };
  });
}

export function withdrawBox({ boxId, amountCents }) {
  return act((s) => {
    const box = s.boxes.find((b) => b.id === boxId);
    if (!box) return { ok: false, code: 'notFound' };
    const amount = Math.min(toInt(amountCents), toInt(box.balanceCents));
    if (amount <= 0) return { ok: false, code: 'amount' };
    const plan = planWithdraw(box, amount, now());
    if (!plan.ok) return { ok: false, code: 'amount', error: plan.error };
    const tx = addTx(s, {
      type: 'box_withdraw',
      amountCents: plan.netCents,
      title: 'Resgate da caixinha',
      subtitle: box.name,
      details: {
        boxId: box.id,
        grossCents: amount,
        irCents: plan.irCents,
        irRate: plan.irRate,
        principalCents: plan.principalCents,
        yieldCents: plan.yieldCents,
        ageDays: plan.ageDays,
      },
    });
    box.balanceCents = toInt(box.balanceCents) - amount;
    box.yieldCents = Math.max(0, toInt(box.yieldCents) - plan.yieldCents);
    applyMovement(s, tx);
    return { ok: true, tx, plan, box };
  });
}

export function deleteBox(boxId) {
  return act((s) => {
    const box = s.boxes.find((b) => b.id === boxId);
    if (!box) return { ok: false, code: 'notFound' };
    if (toInt(box.balanceCents) > 0) return { ok: false, code: 'notEmpty' };
    s.boxes = s.boxes.filter((b) => b.id !== boxId);
    return { ok: true };
  });
}

export function renameBox({ boxId, name }) {
  return act((s) => {
    const box = s.boxes.find((b) => b.id === boxId);
    if (!box) return { ok: false, code: 'notFound' };
    const label = String(name || '').trim();
    if (label.length < 2) return { ok: false, code: 'name' };
    box.name = label.slice(0, 28);
    return { ok: true, box };
  });
}

/** Rende todos os saldos até agora. Chamado na abertura do app. */
export function accrueAll(date = now()) {
  const s = getState();
  let changed = false;
  for (const box of s.boxes) {
    const res = accrue(box, date);
    if (res.gained > 0) {
      changed = true;
      box.balanceCents = res.box.balanceCents;
      box.yieldCents = res.box.yieldCents;
      box.lastAccrualAt = res.box.lastAccrualAt;
      addTx(s, {
        type: 'box_yield',
        amountCents: res.gained,
        title: 'Rendimento da caixinha',
        subtitle: box.name,
        details: { boxId: box.id, days: res.days, cdiAnnual: YIELD.cdiAnnualPct, percentCdi: box.percentCdi },
      });
    } else {
      box.lastAccrualAt = res.box.lastAccrualAt;
    }
  }
  if (promotePendingLimits(s, date)) changed = true;
  if (processSchedules(s, date)) changed = true;
  if (changed) persist(true);
  return changed;
}

/** Executa agendamentos que venceram. */
export function processSchedules(state = getState(), date = now()) {
  let changed = false;
  for (const tx of state.tx) {
    if (tx.status !== 'scheduled') continue;
    if (new Date(tx.at) > date) continue;
    const delta = signedAmount(tx);
    const reserved = state.tx
      .filter((o) => o.id !== tx.id && o.status === 'scheduled' && new Date(o.at) > date && signedAmount(o) < 0)
      .reduce((acc, o) => acc + Math.abs(signedAmount(o)), 0);
    if (delta < 0 && Math.abs(delta) > toInt(state.accounts.brl.cashCents) - reserved) {
      tx.status = 'failed';
      notify(state, { title: 'Pix agendado não enviado', body: tx.subtitle, txId: tx.id, kind: 'alert' });
      changed = true;
      continue;
    }
    tx.status = 'done';
    tx.title = txMeta(tx.type).label;
    applyMovement(state, tx);
    changed = true;
  }
  return changed;
}

/* ------------------------------------------------------------------ movimentar a conta */

const MERCHANTS = [
  'Supermercado Condor', 'Posto Shell', 'Loja Magalu', 'iFood', 'Farmácia Droga Raia',
  'Cinema Cinemark', 'Amazon.es', 'Booking.com', 'Apple.com.br', 'Padaria Estrela',
];
export const DEMO_MERCHANTS = MERCHANTS;

/** Simula um Pix recebido — é assim que entra dinheiro neste app sem banco de verdade. */
export function simulateIncoming({ holder, amountCents, message = '' }) {
  return act((s) => {
    const amount = toInt(amountCents);
    if (amount <= 0) return { ok: false, code: 'amount' };
    const who = String(holder || '').trim() || 'Remetente desconhecido';
    const tx = addTx(s, {
      type: 'pix_in',
      amountCents: amount,
      title: 'Pix recebido',
      subtitle: who,
      details: { holder: who, key: '', e2e: makeE2E(now()), message: message.slice(0, 40), simulated: true },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Você recebeu um Pix', body: `${who} enviou ${fmt(amount, 'BRL')}`, txId: tx.id, kind: 'pix' });
    return { ok: true, tx };
  });
}

export function markNotificationsRead(ids = null) {
  return act((s) => {
    s.notifications.forEach((n) => {
      if (!ids || ids.includes(n.id)) n.read = true;
    });
    return { ok: true };
  });
}

export function deleteNotification(id) {
  return act((s) => {
    s.notifications = s.notifications.filter((n) => n.id !== id);
    return { ok: true };
  });
}

export function cancelScheduled(txId) {
  return act((s) => {
    const tx = s.tx.find((t) => t.id === txId);
    if (!tx || tx.status !== 'scheduled') return { ok: false, code: 'notScheduled' };
    s.tx = s.tx.filter((t) => t.id !== txId);
    return { ok: true };
  });
}

/** Devolve o Pix recebido para quem enviou (prazo do Bacen: até 28 dias). */
export function refundPix(txId) {
  return act((s) => {
    const original = s.tx.find((t) => t.id === txId);
    if (!original || !['pix_in', 'charge_paid'].includes(original.type)) return { ok: false, code: 'notRefundable' };
    const ageDays = (Date.now() - new Date(original.at).getTime()) / 86_400_000;
    if (ageDays > 28) return { ok: false, code: 'expired' };
    const amount = Math.abs(toInt(original.amountCents));
    if (amount > availableBRL(s)) return { ok: false, code: 'funds' };
    const dev = `${makeE2E(now()).slice(1, 18)}${original.details?.e2e?.slice(1, 4) || '0000'}`;
    const tx = addTx(s, {
      type: 'pix_out',
      amountCents: amount,
      title: 'Pix devolvido',
      subtitle: original.details?.holder || original.subtitle,
      details: {
        key: original.details?.key || '',
        holder: original.details?.holder || original.subtitle,
        e2e: makeE2E(now()),
        devolutionOf: original.details?.e2e,
        refundId: dev.slice(0, 18),
      },
    });
    applyMovement(s, tx);
    notify(s, { title: 'Pix devolvido', body: `Valor devolvido para ${tx.subtitle}`, txId: tx.id, kind: 'pix' });
    return { ok: true, tx };
  });
}

export function resetAll() {
  memory = provision(seed(emptyState()));
  persist(true);
  if (hasStorage()) localStorage.removeItem(DEVICE_KEY);
  write(ATTEMPTS_KEY, { attempts: 0, lockedUntil: 0 });
  return { ok: true };
}

/* ------------------------------------------------------------------ exportações de apoio */

export { signedAmount, txMeta, TX_TYPES, dateLabel };
export function listTx(filter = () => true) {
  return getState().tx.filter(filter);
}
export function save() {
  persist(false);
}
