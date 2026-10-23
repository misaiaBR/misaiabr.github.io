// Camadas de interface no padrão iOS: alertas, folhas, avisos e teclados.
import { icon } from './icons.js';
import { fmt, keypadAppend, keypadBackspace, keypadText } from '../logic/money.js';

export const layers = () => document.getElementById('layers');

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function shortTime(date) {
  return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function longDate(date) {
  return new Date(date).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
}

export function dayHeading(date) {
  const d = new Date(date);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
  if (same(d, today)) return `Hoje, ${label}`;
  if (same(d, y)) return `Ontem, ${label}`;
  return label;
}

/* ---------------- scrim + camadas ---------------- */

function withScrim(node, onDismiss) {
  const scrim = el('<div class="scrim"></div>');
  scrim.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (onDismiss) onDismiss('dismiss');
  });
  layers().append(scrim, node);
  requestAnimationFrame(() => {
    scrim.classList.add('in');
    node.classList.add('in');
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    node.classList.remove('in');
    scrim.classList.remove('in');
    setTimeout(() => {
      node.remove();
      scrim.remove();
    }, 280);
  };
  return { close, scrim };
}

/** Alerta central no padrão iOS. */
export function alert({ title, message = '', actions = [{ label: 'OK', value: 'ok' }], columns = false }) {
  return new Promise((resolve) => {
    const node = el(`
      <div class="alert" role="alertdialog" aria-live="assertive">
        <h4>${esc(title)}</h4>
        ${message ? `<p>${esc(message)}</p>` : ''}
        <div class="acts ${actions.length === 2 && columns ? 'row2' : ''}"></div>
      </div>`);
    const acts = node.querySelector('.acts');
    const wrap = withScrim(node, null);
    actions.forEach((action, index) => {
      const btn = el(`<button class="${action.bold ? 'b' : ''} ${action.destructive ? 'destructive' : ''}">${esc(action.label)}</button>`);
      btn.addEventListener('click', () => {
        wrap.close();
        setTimeout(() => resolve(action.value), 120);
      });
      acts.append(btn);
      if (index === actions.length - 1 && actions.length > 2) btn.classList.add('b');
    });
    if (!actions.length) {
      const btn = el('<button class="b">OK</button>');
      btn.addEventListener('click', () => {
        wrap.close();
        resolve('ok');
      });
      acts.append(btn);
    }
  });
}

export function confirm({ title, message, confirmLabel = 'Confirmar', destructive = false }) {
  return alert({
    title,
    message,
    columns: true,
    actions: [
      { label: 'Cancelar', value: false },
      { label: confirmLabel, value: true, bold: true, destructive },
    ],
  });
}

/** Bottom sheet com título e corpo. */
export function sheet({ title, body, onDismiss, dismissable = true }) {
  const node = el(`
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grip"></div>
      ${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
      <div class="sheet-body"></div>
    </div>`);
  node.querySelector('.sheet-body').append(typeof body === 'string' ? el(`<div>${body}</div>`) : body);
  const wrap = withScrim(node, dismissable ? onDismiss : null);
  if (!dismissable) wrap.scrim.remove();

  // arrastar para baixo fecha
  let startY = 0;
  let dy = 0;
  let dragging = false;
  const grab = (clientY) => {
    startY = clientY;
    dragging = true;
    node.style.transition = 'none';
  };
  const move = (clientY) => {
    if (!dragging) return;
    dy = Math.max(0, clientY - startY);
    node.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (!dragging) return;
    dragging = false;
    node.style.transition = '';
    if (dy > 110 && dismissable) {
      closeSheet();
      onDismiss?.('dismiss');
    } else {
      node.style.transform = '';
    }
    dy = 0;
  };
  const onStart = (e) => grab(e.touches ? e.touches[0].clientY : e.clientY);
  const onMove = (e) => move(e.touches ? e.touches[0].clientY : e.clientY);
  const onEnd = () => end();
  node.addEventListener('touchstart', onStart, { passive: true });
  node.addEventListener('touchmove', onMove, { passive: true });
  node.addEventListener('touchend', onEnd);
  node.addEventListener('mousedown', onStart);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onEnd);

  const closeSheet = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onEnd);
    // durante a animação de saída, tira os ids para não conflitar com a próxima folha
    node.querySelectorAll('[id]').forEach((inner) => inner.removeAttribute('id'));
    node.style.transition = '';
    wrap.close();
  };

  return { node, close: closeSheet };
}

/** Lista de opções no padrão iOS. */
export function actionSheet({ title, message, options }) {
  return new Promise((resolve) => {
    const body = el(`<div>
      ${title ? `<div class="sheet-pad" style="text-align:center;font-size:13px;color:var(--text-2)">${esc(title)}${message ? `<div>${esc(message)}</div>` : ''}</div>` : ''}
      <div class="group sheet-cancel" style="border-radius:0;margin:0"></div>
      <div class="group" style="border-radius:14px;margin:8px 8px 0"></div>
    </div>`);
    const primary = body.querySelector('.sheet-cancel');
    const cancel = body.querySelectorAll('.group')[1];
    const handle = sheet({ body, dismissable: true, onDismiss: () => resolve(null) });
    options.forEach((opt) => {
      const target = opt.cancel ? cancel : primary;
      const row = el(`
        <button class="row ${opt.destructive ? 'danger' : ''}" style="justify-content:center;color:${opt.cancel ? 'var(--info)' : opt.destructive ? 'var(--danger)' : 'var(--info)'}">
          <span class="main" style="text-align:center"><span class="t">${esc(opt.label)}</span>${opt.subtitle ? `<span class="s">${esc(opt.subtitle)}</span>` : ''}</span>
        </button>`);
      if (opt.icon) row.prepend(el(`<span class="lead">${icon(opt.icon)}</span>`));
      row.addEventListener('click', () => {
        handle.close();
        setTimeout(() => resolve(opt.value), 120);
      });
      target.append(row);
    });
    const exit = el('<button class="row" style="justify-content:center;font-weight:600;color:var(--info)">Fechar</button>');
    exit.addEventListener('click', () => {
      handle.close();
      setTimeout(() => resolve(null), 120);
    });
    cancel.append(exit);
  });
}

let toastTimer = null;
export function toast(text, ms = 2000) {
  const node = el(`<div class="toast">${esc(text)}</div>`);
  layers().append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('in');
    setTimeout(() => node.remove(), 260);
  }, ms);
  return node;
}

/** Tela de processamento que vira sucesso ou erro. */
export function processing(label = 'Processando…') {
  const node = el(`
    <div class="overlay">
      <div class="spinner"></div>
      <div class="label" style="font-size:16px;color:var(--text-2)">${esc(label)}</div>
    </div>`);
  layers().append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  return {
    node,
    update(text) {
      node.querySelector('.label').textContent = text;
    },
    close() {
      node.classList.remove('in');
      setTimeout(() => node.remove(), 260);
    },
  };
}

export function resultScreen({ ok, title, lines = [], primary = { label: 'Concluir' }, secondary = null, onClose }) {
  const node = el(`
    <div class="overlay">
      <div class="tick ${ok ? '' : 'fail'}">${icon(ok ? 'check' : 'x')}</div>
      <div style="font-size:22px;font-weight:700;letter-spacing:-.4px">${esc(title)}</div>
      <div class="lines" style="font-size:14px;color:var(--text-2);max-width:280px"></div>
      <div style="width:100%;max-width:300px;margin-top:8px">
        <button class="btn primary" data-primary>${esc(primary.label)}</button>
        ${secondary ? `<button class="btn ghost" data-secondary style="margin-top:8px">${esc(secondary.label)}</button>` : ''}
      </div>
    </div>`);
  const box = node.querySelector('.lines');
  lines.forEach((line) => box.append(el(`<div>${esc(line)}</div>`)));
  layers().append(node);
  requestAnimationFrame(() => node.classList.add('in'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    node.classList.remove('in');
    setTimeout(() => node.remove(), 260);
    onClose?.();
  };
  node.querySelector('[data-primary]').addEventListener('click', () => {
    close();
    primary.onClick?.();
  });
  const second = node.querySelector('[data-secondary]');
  if (second) second.addEventListener('click', () => {
    node.remove();
    closed = true;
    secondary.onClick?.();
  });
  return { close, node };
}

/* ---------------- teclados ---------------- */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'dot', '0', 'del'];

export function numberPad({ onKey, extra = null, disabledDigits = false }) {
  const node = el(`<div class="keypad"><div class="keypad-grid"></div></div>`);
  const grid = node.querySelector('.keypad-grid');
  KEYS.forEach((key) => {
    const label = key === 'del' ? '⌫' : key === 'dot' ? (extra || ',') : key;
    const btn = el(`<button class="key ${key === 'del' || key === 'dot' ? 'fn' : ''}" data-key="${key}">${label}</button>`);
    if (key === 'dot' && !extra) btn.classList.add('hidden');
    btn.addEventListener('click', () => {
      if (disabledDigits) return;
      onKey(key);
    });
    grid.append(btn);
  });
  return node;
}

/** Campo de valor com teclado numérico, em centavos. onChange só dispara em toque real. */
export function amountPad({ currency = 'BRL', initial = 0, onChange, max = 1_000_000_00 }) {
  let cents = initial;
  let ready = false;
  const value = el(`<div class="big-amount num"><span class="cur">${currency === 'EUR' ? '€' : 'R$'}</span><span data-digits>0,00</span><span class="caret"></span></div>`);
  const digitsEl = value.querySelector('[data-digits]');
  const paint = () => {
    digitsEl.textContent = keypadText(cents);
    if (ready) onChange?.(cents);
  };
  const pad = numberPad({
    onKey: (key) => {
      ready = true;
      if (key === 'del') cents = keypadBackspace(cents);
      else if (/[0-9]/.test(key)) {
        const next = keypadAppend(cents, key);
        if (next <= max) cents = next;
      }
      paint();
    },
  });
  paint();
  return {
    display: value,
    pad,
    get: () => cents,
    set: (v) => {
      cents = v;
      paint();
    },
    setMax: (v) => {
      cents = Math.min(cents, v);
    },
  };
}

/** Teclado de senha com pontos e callback ao completar. */
export function pinPad({ length = 6, onDigit, onComplete, extraKey = null, onExtra }) {
  const dots = el(`<div class="dots" role="textbox" aria-label="senha"></div>`);
  const paint = (count) => {
    dots.innerHTML = '';
    for (let i = 0; i < length; i++) dots.append(el(`<i class="${i < count ? 'fill' : ''}"></i>`));
  };
  paint(0);
  let count = 0;
  const pad = numberPad({
    onKey: (key) => {
      if (key === 'del') {
        count = Math.max(0, count - 1);
        paint(count);
        onDigit?.({ value: null, back: true, count });
        return;
      }
      if (key === 'dot') {
        onExtra?.();
        return;
      }
      if (count >= length) return;
      count += 1;
      paint(count);
      onDigit?.({ digit: key, count });
      if (count === length) onComplete?.();
    },
  });
  if (extraKey) {
    const btn = pad.querySelector('.key.fn');
    if (btn) {
      btn.textContent = extraKey.label;
      btn.dataset.key = 'dot';
    }
  }
  return {
    dots,
    pad,
    reset: () => {
      count = 0;
      paint(0);
    },
    get count() {
      return count;
    },
  };
}

/* ---------------- componentes reutilizáveis ---------------- */

export function row({ icon: iconName, title, subtitle, trailing, chevron = true, danger = false, accent = false, onClick = null, leadClass = '' }) {
  const node = el(`
    <button class="row ${danger ? 'danger' : ''} ${accent ? 'accent' : ''}" type="button">
      ${iconName ? `<span class="lead ${leadClass}">${icon(iconName)}</span>` : ''}
      <span class="main"><span class="t">${esc(title)}</span>${subtitle ? `<span class="s">${esc(subtitle)}</span>` : ''}</span>
      <span class="trailing">${trailing || ''}${chevron ? icon('chevron', 'go') : ''}</span>
    </button>`);
  const trail = node.querySelector('.trailing');
  if (typeof trailing === 'object' && trailing instanceof Node) {
    trail.insertBefore(trailing, trail.firstChild);
  } else if (trailing) {
    trail.innerHTML = `${trailing}${chevron ? icon('chevron', 'go') : ''}`;
  }
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function toggle(value, onChange) {
  const node = el(`<button class="switch ${value ? 'on' : ''}" role="switch" aria-checked="${Boolean(value)}"></button>`);
  node.addEventListener('click', () => {
    const next = !node.classList.contains('on');
    node.classList.toggle('on', next);
    node.setAttribute('aria-checked', String(next));
    onChange?.(next);
  });
  return node;
}

export function moneyLine(label, cents, currency, opts = {}) {
  return el(`<div class="money-row ${opts.mut ? 'mut' : ''} ${opts.total ? 'total' : ''}">
    <span class="k">${esc(label)}</span><span class="v num">${esc(fmt(Math.abs(cents), currency))}</span></div>`);
}

export function sectionLabel(text, first = false) {
  return el(`<div class="section-label ${first ? 'first' : ''}">${esc(text)}</div>`);
}

export function emptyState(iconName, text) {
  return el(`<div class="empty">${icon(iconName)}<div>${esc(text)}</div></div>`);
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  return Promise.resolve(false);
}

export async function shareText({ title, text, files = null }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, files: files || undefined });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'canceled';
      return 'error';
    }
  }
  return (await copyText(text)) ? 'copied' : 'unavailable';
}
