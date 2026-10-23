// Pix: chaves, BR Code (payload do QR) e identificadores de transação.
import { PIX } from './rules.js';

function dvCpf1(base9) {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(base9[i]) * (10 - i);
  const r = (sum * 10) % 11;
  return r === 10 ? 0 : r;
}
function dvCpf2(base10) {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(base10[i]) * (11 - i);
  const r = (sum * 10) % 11;
  return r === 10 ? 0 : r;
}

/** Gera um CPF válido a partir de 9 dígitos (usado nos contatos do histórico). */
export function cpfWithDVs(base) {
  const b = String(base).replace(/\D/g, '').slice(0, 9).padStart(9, '0');
  const d1 = String(dvCpf1(b));
  return b + d1 + dvCpf2(b + d1);
}

/** Gera um CNPJ válido a partir de 12 dígitos. */
export function cnpjWithDVs(base) {
  const b = String(base).replace(/\D/g, '').slice(0, 12).padStart(12, '0');
  const dv = (seed, weights) => {
    let sum = 0;
    for (let i = 0; i < seed.length; i++) sum += Number(seed[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(b, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv(b + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${b}${d1}${d2}`;
}

/* ---------------- validação de CPF/CNPJ ---------------- */

export function isValidCPF(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let dv1 = (sum * 10) % 11;
  if (dv1 === 10) dv1 = 0;
  if (dv1 !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  let dv2 = (sum * 10) % 11;
  if (dv2 === 10) dv2 = 0;
  return dv2 === Number(d[10]);
}

export function isValidCNPJ(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const dv = (weights, len) => {
    let s = 0;
    for (let i = 0; i < len; i++) s += Number(d[i]) * weights[i];
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(w1, 12) === Number(d[12]) && dv(w2, 13) === Number(d[13]);
}

const EVP_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const DDD = [11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34,
  35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99];

export function isValidPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 13 || d.length === 14)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (!DDD.includes(ddd)) return false;
  const rest = d.slice(2);
  if (d.length === 11 && rest[0] !== '9') return false;
  return /^[3-578]$/.test(rest[0]) || rest[0] === '9' || rest[0] === '6';
}

export function normalizePhone(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 13 || d.length === 14)) d = d.slice(2);
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  return `+55${ddd}${rest}`;
}

export function formatKey(type, value) {
  const d = value.replace(/\D/g, '');
  if (type === 'cpf') return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (type === 'cnpj') return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (type === 'phone') {
    let n = value.replace(/\D/g, '');
    if (n.startsWith('55')) n = n.slice(2);
    return `+55 (${n.slice(0, 2)}) ${n.slice(2, n.length - 4)}-${n.slice(-4)}`;
  }
  return value;
}

/** Detecta o tipo de uma chave Pix e diz se é válida. */
export function detectKey(rawInput) {
  const raw = String(rawInput || '').trim();
  if (!raw) return { type: null, value: '', valid: false, error: null };
  if (EVP_RE.test(raw)) return { type: 'evp', value: raw.toLowerCase(), valid: true, error: null };
  if (raw.includes('@')) {
    const value = raw.toLowerCase();
    return { type: 'email', value, valid: EMAIL_RE.test(value), error: EMAIL_RE.test(value) ? null : 'E-mail inválido.' };
  }
  const digits = raw.replace(/\D/g, '');
  const looksPhone = raw.startsWith('+') || /^\(\d{2}\)/.test(raw) || (digits.length >= 12 && digits.startsWith('55'));
  if (looksPhone || digits.length === 10) {
    const ok = isValidPhone(digits);
    return { type: 'phone', value: normalizePhone(digits), valid: ok, error: ok ? null : 'Telefone inválido: informe DDD + número.' };
  }
  if (digits.length === 11) {
    return {
      type: 'cpf',
      value: digits,
      valid: isValidCPF(digits),
      error: isValidCPF(digits) ? null : 'CPF com dígito verificador inválido.',
    };
  }
  if (digits.length === 14) {
    return {
      type: 'cnpj',
      value: digits,
      valid: isValidCNPJ(digits),
      error: isValidCNPJ(digits) ? null : 'CNPJ com dígito verificador inválido.',
    };
  }
  return { type: null, value: raw, valid: false, error: 'Chave inválida. Use CPF, CNPJ, telefone, e-mail ou chave aleatória.' };
}

export function keyLabel(type) {
  return { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Telefone', evp: 'Chave aleatória' }[type] || 'Chave';
}

/* ---------------- BR Code ---------------- */

function tlv(id, value) {
  const v = String(value);
  if (v.length > PIX.maxCharsPerSegment) throw new Error(`Campo ${id} excede o tamanho do BR Code`);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

/** CRC16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — mesmo cálculo do padrão do Bacen. */
export function crc16(payload) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function sanitizeText(text, max) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

/** Monta o payload "copia e cola" de um Pix estático. */
export function buildBRCode({ key, description, amountCents, name, city, txid }) {
  const merchant = tlv('26', tlv('00', PIX.gui) + tlv('01', key) + (description ? tlv('02', description.slice(0, PIX.descriptionMax)) : ''));
  let payload =
    tlv('00', '01') +
    merchant +
    tlv('52', PIX.mcc) +
    tlv('53', PIX.currencyCode);
  if (amountCents != null && Number(amountCents) > 0) {
    payload += tlv('54', (Number(amountCents) / 100).toFixed(2));
  }
  payload +=
    tlv('58', PIX.country) +
    tlv('59', sanitizeText(name, PIX.nameMax)) +
    tlv('60', sanitizeText(city, PIX.cityMax)) +
    tlv('62', tlv('05', (txid || '***').slice(0, PIX.txidMax)));
  payload += '6304';
  return payload + crc16(payload);
}

/** Lê um payload (aceita o código puro, o link .../v2/... ou ?emv=...). */
export function parseBRCode(input) {
  let raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Nenhum código informado.' };
  if (/^https?:\/\//i.test(raw)) {
    const withParam = raw.match(/[?&]emv=([^&]+)/i);
    const v2 = raw.lastIndexOf('/v2/');
    if (withParam) {
      raw = decodeURIComponent(withParam[1]);
    } else if (v2 >= 0) {
      raw = decodeURIComponent(raw.slice(v2 + 4));
    } else {
      return { ok: false, error: 'O link não contém um código Pix.' };
    }
  }
  // espaços só nas pontas: dentro do nome/cidade o espaço é parte do campo
  raw = raw.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, '');

  const fields = {};
  let i = 0;
  while (i < raw.length) {
    const id = raw.slice(i, i + 2);
    const len = Number(raw.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isFinite(len) || len < 1 || len > 99) {
      return { ok: false, error: 'Código Pix malformado.' };
    }
    const value = raw.slice(i + 4, i + 4 + len);
    if (value.length !== len) return { ok: false, error: 'Código Pix truncado.' };
    fields[id] = value;
    i += 4 + len;
  }

  if (fields['00'] !== '01') return { ok: false, error: 'Formato de iniciação não suportado (precisa ser 01).' };
  if (!fields['63']) return { ok: false, error: 'Código sem CRC16.' };
  const body = raw.slice(0, raw.length - 4);
  if (crc16(body) !== fields['63'].toUpperCase()) {
    return { ok: false, error: 'CRC16 inválido — o código pode ter sido alterado.' };
  }
  if (fields['53'] !== PIX.currencyCode) {
    return { ok: false, error: `Moeda ${fields['53']} não é real (986).` };
  }

  const sub = {};
  const src = fields['26'] || fields['51'] || '';
  let j = 0;
  while (j < src.length) {
    const id = src.slice(j, j + 2);
    const len = Number(src.slice(j + 2, j + 4));
    if (!Number.isFinite(len)) break;
    sub[id] = src.slice(j + 4, j + 4 + len);
    j += 4 + len;
  }
  if (sub['00'] !== PIX.gui) return { ok: false, error: 'O QR não é uma chave Pix do Bacen.' };
  const key = sub['01'] || '';
  const amount = fields['54'] ? Math.round(Number(fields['54']) * 100) : null;
  const txidSub = parseSub(fields['62']);
  return {
    ok: true,
    key,
    keyDescription: sub['02'] || '',
    merchantName: fields['59'] || '',
    merchantCity: fields['60'] || '',
    amountCents: Number.isFinite(amount) ? amount : null,
    txid: txidSub['05'] || '***',
    fields,
    payload: raw,
  };
}

function parseSub(str) {
  const out = {};
  let i = 0;
  while (i < (str || '').length) {
    const id = str.slice(i, i + 2);
    const len = Number(str.slice(i + 2, i + 4));
    if (!Number.isFinite(len)) break;
    out[id] = str.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

/* ---------------- identificadores ---------------- */

function rand(n) {
  let s = '';
  const buf = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf);
  else for (let k = 0; k < n; k++) buf[k] = Math.floor(Math.random() * 256);
  for (let k = 0; k < n; k++) s += String(buf[k] % 10);
  return s;
}

/** ID E2E: E + ISPB (8) + data (4, MMDD?) + hora aleatória — 32 posições. */
export function makeE2E(date = new Date(), ispb = PIX.ispb || '99999999') {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const tail = rand(16);
  return `E${ispb}${mmdd}${tail}`.slice(0, PIX.e2eLength).padEnd(PIX.e2eLength, '0');
}

export function makeTxid(len = 12) {
  return rand(len);
}

export function makeContractNumber(len = 10) {
  return rand(len);
}

export function makeEvpKey() {
  const hex = '0123456789abcdef';
  const pick = (n) => {
    let s = '';
    for (let k = 0; k < n; k++) s += hex[Math.floor(Math.random() * 16)];
    return s;
  };
  return `${pick(8)}-${pick(4)}-4${pick(3)}-${hex[8 + Math.floor(Math.random() * 4)]}${pick(3)}-${pick(12)}`;
}
