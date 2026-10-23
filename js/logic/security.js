// Segurança: senha com hash local, bloqueio por tentativas e Face ID (passkey).
export const MAX_ATTEMPTS = 5;
export const LOCK_SECONDS = 60;

const te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(arr);
  else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hash da senha guardado só no aparelho (localStorage), nunca enviado a lugar nenhum. */
export async function hashPassword(password, salt) {
  const data = `${salt}:${password}`;
  if (globalThis.crypto?.subtle && te) {
    const digest = await crypto.subtle.digest('SHA-256', te.encode(data));
    return toHex(digest);
  }
  // fallback determinístico para testes em Node sem webcrypto
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < data.length; i++) {
    h1 = Math.imul(h1 ^ data.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + data.charCodeAt(i) * (i + 7), 2654435761) >>> 0;
  }
  return `f${h1.toString(16)}${h2.toString(16)}`.padEnd(64, '0').slice(0, 64);
}

export async function checkPassword(password, salt, expectedHash) {
  if (!password || !salt || !expectedHash) return false;
  const hash = await hashPassword(password, salt);
  return hash === expectedHash;
}

/** Máquina de estados das tentativas de senha. */
export function lockStatus(stored, now = Date.now()) {
  const s = stored || { attempts: 0, lockedUntil: 0 };
  if (s.lockedUntil && s.lockedUntil > now) {
    return { locked: true, secondsLeft: Math.ceil((s.lockedUntil - now) / 1000), attemptsLeft: 0 };
  }
  return { locked: false, secondsLeft: 0, attemptsLeft: Math.max(0, MAX_ATTEMPTS - (s.attempts || 0)) };
}

export function registerAttempt(stored, success, now = Date.now()) {
  const base = { attempts: 0, lockedUntil: 0, ...(stored || {}) };
  if (success) return { attempts: 0, lockedUntil: 0, lastSuccessAt: now };
  const attempts = (base.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    return { attempts: 0, lockedUntil: now + LOCK_SECONDS * 1000, hits: (base.hits || 0) + 1 };
  }
  return { attempts, lockedUntil: 0 };
}

/* ---------------- Face ID / Touch ID via passkey ---------------- */

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function biometricAvailable() {
  if (typeof navigator === 'undefined' || !window?.isSecureContext) return { ok: false, reason: 'Contexto inseguro' };
  if (!navigator.credentials?.create) return { ok: false, reason: 'O navegador não suporta passkey' };
  if (!window.PublicKeyCredential) return { ok: false, reason: 'O navegador não suporta PublicKeyCredential' };
  return { ok: true, reason: null };
}

async function challenge() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

/** Cria a passkey e devolve o id (para guardar no estado local). */
export async function enrollBiometric(userName) {
  const avail = biometricAvailable();
  if (!avail.ok) throw new Error(avail.reason);
  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: await challenge(),
      rp: { name: document.title || 'Ipê Banco Digital' },
      user: { id: userId, name: userName || 'conta', displayName: userName || 'conta' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      attestation: 'none',
    },
  });
  if (!cred?.rawId) throw new Error('A leitura biométrica não foi concluída.');
  return b64url(new Uint8Array(cred.rawId));
}

/** Pede Face ID e confere se é a passkey desta conta. */
export async function verifyBiometric(credentialId) {
  const avail = biometricAvailable();
  if (!avail.ok) throw new Error(avail.reason);
  const id = Uint8Array.from(atob(credentialId.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: await challenge(),
      allowCredentials: [{ type: 'public-key', id }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  if (!assertion?.rawId) throw new Error('Biometria não reconhecida.');
  return b64url(new Uint8Array(assertion.rawId)) === credentialId;
}

/** Código de verificação gerado no aparelho (não sai dele). */
export function fakeVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}
