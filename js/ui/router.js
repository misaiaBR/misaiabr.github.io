// Casco do app: abas, pilha de telas por aba, gesto de voltar e recarga ao mudar o estado.
import { icon } from './icons.js';
import * as store from '../logic/store.js';

const registry = new Map();
export const TABS = [
  { id: 'home', label: 'Início', icon: 'home', root: 'home' },
  { id: 'statement', label: 'Extrato', icon: 'list', root: 'statement' },
  { id: 'pix', label: 'Pix', icon: 'pix', root: 'pix' },
  { id: 'card', label: 'Cartão', icon: 'card', root: 'card' },
  { id: 'profile', label: 'Você', icon: 'user', root: 'profile' },
];

const state = {
  tab: 'home',
  stacks: new Map(TABS.map((t) => [t.id, []])),
  global: [],
  seq: 0,
};

let shell = null;
let refreshQueued = null;

export function register(name, factory) {
  registry.set(name, factory);
}

export function currentTab() {
  return state.tab;
}

/** Re-renderiza a tela visível (para estados que não passam pelo store). */
export function refreshTop() {
  const frame = topFrame();
  if (frame) rerender(frame, { force: true });
}

function activeStack() {
  if (state.global.length) return state.global;
  return state.stacks.get(state.tab);
}

export function topFrame() {
  const stack = activeStack();
  return stack[stack.length - 1] || null;
}

function makeFrame(name, params) {
  const factory = registry.get(name);
  if (!factory) throw new Error(`tela desconhecida: ${name}`);
  const id = `f${++state.seq}`;
  const ctx = { id, params: params || {}, name };
  const screen = factory(ctx.params, ctx);
  return { id, name, params: ctx.params, screen, node: null, ctx };
}

/* ---------------- construção do DOM de uma tela ---------------- */

function buildNode(frame, { isRoot = false } = {}) {
  const s = frame.screen;
  const node = document.createElement('div');
  node.className = 'screen';
  if (!s.hideTabbar) node.classList.add('with-tabbar');
  if (s.transparentNav) node.classList.add('no-nav');
  node.dataset.frame = frame.id;
  const back = isRoot || s.back === false ? null : s.back;
  const title = s.title || '';
  node.innerHTML = `
    ${s.transparentNav ? '' : `<header class="nav">
      <div class="nav-row">
        ${back === undefined ? `<button class="nav-btn" data-back>${icon('chevron', 'chev')}<span>Voltar</span></button>` : back ? `<button class="nav-btn" data-back>${icon('chevron', 'chev')}<span>${back === true ? 'Voltar' : back}</span></button>` : '<span style="width:44px"></span>'}
        <div class="nav-title">${title}</div>
        <span class="nav-btn right" data-right></span>
      </div>
    </header>`}
    <div class="content"></div>
    ${s.footer ? '<div class="footer-slot"></div>' : ''}
    <div class="body-peek"></div>
  `;
  const content = node.querySelector('.content');
  content.innerHTML = typeof s.content === 'function' ? s.content() : s.content || '';
  const footerSlot = node.querySelector('.footer-slot');
  if (s.footer && footerSlot) {
    footerSlot.innerHTML = typeof s.footer === 'function' ? s.footer() : s.footer;
  }
  const right = node.querySelector('[data-right]');
  if (right && s.right) {
    s.right.forEach((action) => {
      const btn = document.createElement('button');
      btn.className = 'nav-btn icon-only';
      btn.innerHTML = action.icon ? icon(action.icon) : `<span>${action.label}</span>`;
      btn.setAttribute('aria-label', action.aria || action.label || action.icon);
      btn.addEventListener('click', () => action.onClick?.(frame));
      right.append(btn);
    });
  }
  node.querySelector('[data-back]')?.addEventListener('click', () => pop());
  frame.contentEl = content;
  frame.footerEl = footerSlot;
  frame.node = node;
  return node;
}

function runMount(frame) {
  if (typeof frame.screen.mount === 'function' && !frame.mounted) {
    frame.mounted = true;
    try {
      frame.screen.mount(frame.node, frame);
    } catch (err) {
      console.error('[mount]', frame.name, err);
    }
  }
}

function keepScroll(frame) {
  const scroller = frame.node?.querySelector('.scroll, .list-scroll');
  return scroller ? scroller.scrollTop : 0;
}

function restoreScroll(frame, top) {
  const scroller = frame.node?.querySelector('.scroll, .list-scroll');
  if (scroller && top) scroller.scrollTop = top;
}

function rerender(frame, { force = false } = {}) {
  if (!frame.node) return;
  if (!force && frame.screen.live === false) return;
  const top = keepScroll(frame);
  const old = frame.node;
  const stack = state.global.includes(frame) ? state.global : state.stacks.get(state.tab);
  const fresh = buildNode(frame, { isRoot: stack ? stack[0] === frame && stack !== state.global : false });
  ['at-top', 'under', 'no-anim'].forEach((cls) => {
    if (old.classList.contains(cls)) fresh.classList.add(cls);
  });
  fresh.style.transform = '';
  old.replaceWith(fresh);
  frame.node = fresh;
  frame.mounted = false;
  runMount(frame);
  restoreScroll(frame, top);
}

/* ---------------- animações de pilha ---------------- */

function paintStack(stack) {
  const viewport = stack === state.global ? shell.global : shell.tabs[state.tab];
  const layer = viewport.querySelector('.stack');
  // remove frames que não estão mais na pilha
  Array.from(layer.querySelectorAll(':scope > .screen')).forEach((node) => {
    if (!stack.some((f) => f.id === node.dataset.frame)) node.remove();
  });
  stack.forEach((frame, index) => {
    if (!frame.node) layer.append(buildNode(frame, { isRoot: index === 0 && stack !== state.global }));
    frame.node.classList.toggle('at-top', index === stack.length - 1);
    frame.node.classList.toggle('under', index < stack.length - 1);
    layer.append(frame.node); // garante a ordem visual
    runMount(frame);
  });
  const root = stack[0];
  if (root?.screen.rootNoBack) {
    root.node.querySelector('[data-back]')?.classList.add('hidden');
  }
  syncTabbar();
}

let aoSincronizarBarra = null;
/** Costura para quem precisa saber quando a barra de abas mudou de estado (medir a elevação). */
export function onTabbarSync(fn) { aoSincronizarBarra = fn; }

function syncTabbar() {
  const inGlobal = state.global.length > 0;
  const top = topFrame();
  const hide = inGlobal || top?.screen.hideTabbar;
  shell.tabbar.classList.toggle('hidden', Boolean(hide));
  shell.global.classList.toggle('in', inGlobal);
  shell.global.classList.toggle('hidden', !inGlobal);
  TABS.forEach((t) => {
    const btn = shell.tabbar.querySelector(`[data-tab="${t.id}"]`);
    if (btn) btn.classList.toggle('on', t.id === state.tab && !inGlobal);
  });
  if (aoSincronizarBarra) aoSincronizarBarra();
}

export function push(name, params = {}) {
  const stack = activeStack();
  stack.push(makeFrame(name, params));
  paintStack(stack);
}

export function replace(name, params = {}) {
  const stack = activeStack();
  const old = stack.pop();
  old?.node?.remove();
  stack.push(makeFrame(name, params));
  paintStack(stack);
}

export async function pop({ force = false } = {}) {
  const stack = activeStack();
  if (stack.length <= 1) return false;
  const top = stack[stack.length - 1];
  if (!force && typeof top.screen.onBack === 'function') {
    const allowed = await top.screen.onBack();
    if (allowed === false) return false;
  }
  const previous = stack[stack.length - 2];
  stack.pop();
  const node = top.node;
  if (node) {
    node.classList.remove('at-top');
    setTimeout(() => node.remove(), 340);
  }
  previous.node?.classList.remove('under');
  previous.node?.classList.add('at-top');
  runMount(previous);
  if (previous.screen.reveal) previous.screen.reveal(previous);
  rerender(previous, { force: true });
  syncTabbar();
  return true;
}

export function popToRoot() {
  const stack = activeStack();
  while (stack.length > 1) {
    const frame = stack.pop();
    frame.node?.remove();
  }
  paintStack(stack);
}

/** Pilha inteira nova sobre a aba atual (ex.: fluxo de Pix terminando no comprovante). */
export function reset(name, params = {}) {
  const stack = state.stacks.get(state.tab);
  stack.forEach((f) => f.node?.remove());
  state.stacks.set(state.tab, []);
  push(name, params);
}

export function present(name, params = {}) {
  state.global.push(makeFrame(name, params));
  paintStack(state.global);
}

export async function dismiss({ force = false } = {}) {
  if (!state.global.length) return pop({ force });
  const stack = state.global;
  if (stack.length <= 1 && !force) return false;
  const top = stack[stack.length - 1];
  if (!force && typeof top.screen.onBack === 'function') {
    if ((await top.screen.onBack()) === false) return false;
  }
  stack.pop();
  top.node?.remove();
  if (stack.length) {
    const previous = stack[stack.length - 1];
    previous.node?.classList.remove('under');
    previous.node?.classList.add('at-top');
    rerender(previous, { force: true });
  }
  syncTabbar();
  return true;
}

/** Fecha toda pilha global (usada ao terminar o onboarding). */
export function dismissAll() {
  state.global.forEach((frame) => frame.node?.remove());
  state.global = [];
  syncTabbar();
}

export function switchTab(id) {
  if (state.global.length) return;
  state.tab = id;
  TABS.forEach((t) => {
    shell.tabs[t.id].classList.toggle('hidden', t.id !== id);
  });
  const definition = TABS.find((t) => t.id === id);
  let stack = state.stacks.get(id);
  // aba volta sempre para a própria tela raiz (comportamento padrão do iOS)
  if (!stack.length || stack[0].name !== definition.root) {
    stack.forEach((f) => f.node?.remove());
    stack = [makeFrame(definition.root, {})];
    state.stacks.set(id, stack);
  }
  paintStack(stack);
  syncTabbar();
}

/* ---------------- casca ---------------- */

function buildShell() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  const tabsHost = document.createElement('div');
  tabsHost.className = 'tabs-host';
  app.append(tabsHost);
  const tabbar = document.createElement('nav');
  tabbar.className = 'tabbar';
  tabbar.innerHTML = TABS.map((t) => `
    <button class="tab-item ${t.id === state.tab ? 'on' : ''}" data-tab="${t.id}">
      ${icon(t.icon)}<span>${t.label}</span>
    </button>`).join('');
  app.append(tabbar);

  const tabs = {};
  TABS.forEach((t) => {
    const view = document.createElement('div');
    view.className = 'tab-view';
    view.dataset.view = t.id;
    view.innerHTML = '<div class="stack"></div>';
    tabsHost.append(view);
    tabs[t.id] = view;
  });
  const globalView = document.createElement('div');
  globalView.className = 'tab-view global hidden';
  globalView.innerHTML = '<div class="stack"></div>';
  tabsHost.append(globalView);

  tabbar.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-tab]');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });

  return { app, tabs, tabbar, global: globalView, tabsHost };
}

/* gesto de voltar arrastando da borda esquerda */
function installBackGesture() {
  let startX = 0;
  let startY = 0;
  let active = null;
  let dx = 0;
  const width = () => shell.app.clientWidth;

  shell.app.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    const stack = activeStack();
    if (stack.length < 2) return;
    if (ev.clientX > 28) return;
    const target = ev.target;
    if (target.closest('input, textarea, [data-peek-off]')) return;
    const top = stack[stack.length - 1];
    if (top.screen.noSwipe) return;
    active = top;
    startX = ev.clientX;
    startY = ev.clientY;
    dx = 0;
    top.node.classList.add('no-anim');
  });

  shell.app.addEventListener('pointermove', (ev) => {
    if (!active) return;
    const dy = ev.clientY - startY;
    dx = ev.clientX - startX;
    if (dx < 0) dx = 0;
    if (Math.abs(dy) > 90 && dx < 40) {
      active = null;
      return;
    }
    active.node.style.transform = `translateX(${Math.min(dx, width())}px)`;
    const previous = activeStack()[activeStack().length - 2];
    if (previous?.node) {
      const p = Math.min(1, dx / width());
      previous.node.style.transform = `translateX(${-24 + 24 * p}%)`;
      previous.node.style.opacity = String(0.85 + 0.15 * p);
    }
  });

  const finish = () => {
    if (!active) return;
    const frame = active;
    active = null;
    const stack = activeStack();
    const previous = stack[stack.length - 2];
    frame.node.classList.remove('no-anim');
    frame.node.style.transform = '';
    if (previous?.node) {
      previous.node.style.transform = '';
      previous.node.style.opacity = '';
    }
    if (dx > width() * 0.32) pop();
  };
  shell.app.addEventListener('pointerup', finish);
  shell.app.addEventListener('pointercancel', finish);
}

export function setViewportHeight() {
  document.documentElement.style.setProperty('--h', `${window.innerHeight}px`);
}

export function start() {
  shell = buildShell();
  installBackGesture();
  setViewportHeight();
  window.addEventListener('resize', setViewportHeight);
  if (visualViewport) {
    visualViewport.addEventListener('resize', setViewportHeight);
  }
  store.subscribe(() => scheduleRefresh());
  switchTab(state.tab);
}

function scheduleRefresh() {
  if (refreshQueued) return;
  refreshQueued = requestAnimationFrame(() => {
    refreshQueued = null;
    const top = topFrame();
    if (top) rerender(top);
    // raiz de cada aba fica suja: re-renderiza quando voltar a aparecer
    TABS.forEach((t) => {
      const stack = state.stacks.get(t.id);
      stack.slice(0, Math.max(0, stack.length - 1)).forEach((f) => {
        f.node?.classList.add('under');
        if (f.screen.live !== false) rerender(f);
      });
    });
    syncTabbar();
  });
}

/** Força a reconstrução de tudo (troca de tema, moeda, desbloqueio). */
export function repaint() {
  TABS.forEach((t) => {
    state.stacks.get(t.id).forEach((f) => {
      if (f.node) {
        f.node.remove();
        f.node = null;
        f.mounted = false;
      }
    });
    if (t.id === state.tab || state.global.length) paintStack(state.stacks.get(t.id));
  });
  if (state.global.length) paintStack(state.global);
  syncTabbar();
}

export function resetAll() {
  state.stacks = new Map(TABS.map((t) => [t.id, []]));
  state.global = [];
  shell = null;
  start();
}
