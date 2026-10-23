// Ponto de entrada: registra telas, aplica tema, controla bloqueio e o modo offline.
import * as store from './logic/store.js';
import { SITE_PATH } from './logic/rules.js';
import * as Router from './ui/router.js';
import { cancelAuthorize, toast } from './ui/shared.js';
import { screens as auth } from './screens/auth.js';
import { screens as home } from './screens/home.js';
import { screens as statement } from './screens/statement.js';
import { screens as pix } from './screens/pix.js';
import { screens as pay } from './screens/pay.js';
import { screens as card } from './screens/card.js';
import { screens as fx } from './screens/fx.js';
import { screens as boxes } from './screens/boxes.js';
import { screens as notifications } from './screens/notifications.js';
import { screens as profile } from './screens/profile.js';

const ALL = {
  ...auth, ...home, ...statement, ...pix, ...pay, ...card, ...fx, ...boxes, ...notifications, ...profile,
};

function markDisplayMode() {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  document.documentElement.dataset.display = standalone ? 'standalone' : 'browser';
}

function applyTheme() {
  const pref = store.getState().settings.theme || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#07090a' : '#f2f2f7');
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute('content', dark ? 'black-translucent' : 'default');
}

function gate() {
  if (!store.hasAccount()) {
    Router.present('onboarding', {});
    return;
  }
  if (store.isLocked()) {
    cancelAuthorize();
    Router.present('login', {});
    return;
  }
  store.markActive();
}

let lastActivity = 0;
function trackActivity() {
  const nowTs = Date.now();
  if (nowTs - lastActivity < 3000) {
    lastActivity = nowTs;
    return;
  }
  lastActivity = nowTs;
  store.markActive();
}

function watchLock() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      store.accrueAll();
      gate();
    } else {
      store.save();
    }
  });
  ['pointerdown', 'keydown'].forEach((evt) => window.addEventListener(evt, trackActivity, { passive: true }));
}

function watchNetwork() {
  window.addEventListener('offline', () => toast('Você ficou sem internet — o app continua funcionando.'));
  window.addEventListener('online', () => toast('De volta à rede. O app continua 100% local.'));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // quando um service worker novo assume, o documento em memória ainda é o pacote velho.
  // No iOS o app instalado sobrevive ao fechar, então a atualização só entrava na terceira
  // abertura. Recarregar uma vez na troca de controle faz a primeira abertura já mostrar a
  // versão nova; o estado da conta está no aparelho e não é perdido com o reload.
  let dono = navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (dono === navigator.serviceWorker.controller) return;
    dono = navigator.serviceWorker.controller;
    window.location.reload();
  });
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          // o sw já pula para ativado sozinho; o listener acima cuida do resto
          sw.postMessage && reg.waiting && reg.waiting.postMessage('skipWaiting');
        }
      });
    });
  }).catch((err) => console.warn('service worker', err));
}

/** Endereço canônico do app: /contas/conta-corrente/, como num banco de verdade. */
function canonicalPath() {
  if (location.protocol === 'file:') return;
  if (['127.0.0.1', 'localhost', '0.0.0.0'].includes(location.hostname)) return;
  const current = location.pathname.replace(/\/+$/, '');
  const wanted = SITE_PATH.replace(/\/+$/, '');
  if (current === wanted) return;
  try {
    history.replaceState(null, '', SITE_PATH + location.search + location.hash);
  } catch (err) {
    // alguns navegadores recusam sem o arquivo no servidor; o app segue funcionando na raiz
  }
}

/** Atalhos do ícone instalado: ?flow=copy-paste e ?flow=boleto abrem o fluxo direto. */
function applyFlowParam() {
  const flow = new URLSearchParams(location.search).get('flow');
  if (!flow || store.isLocked()) return;
  const target = flow === 'copy-paste' ? 'pixCopyPaste' : flow === 'boleto' ? 'payBoleto' : null;
  if (target) Router.push(target);
}

/**
 * O host injeta um selo de atribuição no canto inferior direito. Não escondemos nem
 * reservamos espaço "por via das dúvidas": medimos se ele realmente cruza a barra de
 * abas e levantamos só o necessário. Sem selo (app instalado), lift = 0 e a barra fica
 * encostada na área segura, como manda o iOS.
 */
function watchBadge() {
  const root = document.documentElement;
  let ultimo = -1;

  /**
   * A faixa tocável que encosta na borda de baixo, medida como se não houvesse
   * elevação nenhuma: a pílula da barra de abas ou o botão fixo do rodapé.
   */
  const faixa = () => {
    const bar = document.querySelector('.tabbar');
    if (bar && bar.getClientRects().length) {
      const t = bar.getBoundingClientRect();
      const pillH = parseFloat(getComputedStyle(root).getPropertyValue('--tab-h')) || 56;
      return { top: t.top, bottom: t.top + pillH, left: t.left, right: t.right };
    }
    for (const sel of ['.footer-bar', '.pad-dock', '.keypad']) {
      const strip = document.querySelector(sel);
      if (!strip || !strip.getClientRects().length) continue;
      const botao = strip.querySelector('.btn, [data-pad], .pad') || strip;
      const r = botao.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }
    return null;
  };

  const medir = () => {
    let alvo = 0;
    const badge = document.getElementById('qoder-sites-watermark') || document.querySelector('qoder-sites-badge');
    const f = faixa();
    if (badge && f) {
      const cs = getComputedStyle(badge);
      const b = badge.getBoundingClientRect();
      const vivo = cs.display !== 'none' && cs.visibility !== 'hidden'
        && Number(cs.opacity || 1) >= 0.05 && b.height >= 4;
      if (vivo) {
        const lift = parseFloat(getComputedStyle(root).getPropertyValue('--badge-lift')) || 0;
        // somamos o lift de volta porque levantar a faixa é justamente o que tiraria o selo
        // de cima dela — sem isso o valor cairia para zero e ficaria oscilando
        const base = f.bottom + lift;
        const topo = f.top + lift;
        const cruza = b.left <= f.right && b.right >= f.left && b.top <= base && b.bottom >= topo;
        if (cruza) alvo = Math.min(64, Math.ceil(base - b.top) + 8);
      }
    }
    if (alvo === ultimo) return;
    ultimo = alvo;
    root.style.setProperty('--badge-lift', `${alvo}px`);
  };

  // o que pode mudar a conta: o selo entrando/saindo e a faixa de baixo mudando de nó ou
  // de visibilidade (a barra de abas, o botão do rodapé, o teclado). Todo o resto das
  // re-renderizações do app é ignorado antes de qualquer leitura de layout.
  const FAIXA = '.tabbar, .footer-bar, .pad-dock, .keypad, qoder-sites-badge, #qoder-sites-watermark';
  const interessa = (n) => {
    if (!n || n === document) return true;
    if (n === root) return true;
    if (n.nodeType !== 1) return false;
    return typeof n.closest === 'function' && Boolean(n.closest(FAIXA));
  };

  // o selo tem um × que some com ele. Fechar o selo tem de devolver a barra ao lugar,
  // então qualquer evento dele re-mede agora e mais três vezes enquanto a transição passa.
  const assentar = () => {
    medir();
    [120, 400, 900].forEach((ms) => setTimeout(medir, ms));
  };
  let seloVisto = null;
  let obsSelo = null;
  const vigiarSelo = () => {
    const selo = document.getElementById('qoder-sites-watermark') || document.querySelector('qoder-sites-badge');
    if (selo === seloVisto) return;
    if (obsSelo) obsSelo.disconnect();
    obsSelo = null;
    seloVisto = selo;
    if (!selo) return;
    selo.addEventListener('click', assentar, true);
    if (selo.shadowRoot) {
      obsSelo = new MutationObserver(assentar);
      obsSelo.observe(selo.shadowRoot, { childList: true, subtree: true, attributes: true });
    }
  };

  const remarcar = (mutacoes) => {
    // mede na hora, sem requestAnimationFrame: em página em segundo plano o quadro
    // pode nunca chegar. A escrita repetida do mesmo valor é barrada por `ultimo`.
    const vale = mutacoes.some((m) => interessa(m.target)
      || [...m.addedNodes, ...m.removedNodes].some(interessa));
    if (!vale) return;
    vigiarSelo();
    medir();
  };
  new MutationObserver(remarcar).observe(document, { childList: true, subtree: true, attributes: true });
  // o × costuma esconder o selo com transição: o fim dela é o momento em que o espaço
  // embaixo da barra realmente libera
  document.addEventListener('transitionend', vigiarSelo);
  document.addEventListener('transitionend', medir);
  document.addEventListener('animationend', medir);
  // o ponto certo: o roteador avisa cada vez que mostra/esconde a barra de abas
  Router.onTabbarSync(medir);

  vigiarSelo();
  medir();
  window.addEventListener('resize', medir);
  window.addEventListener('orientationchange', medir);
  // costura para o QA: permite medir de novo e ver o último valor calculado
  window.IPE.selo = { medir, assentar, estado: () => ({ ultimo, elevacao: root.style.getPropertyValue('--badge-lift') }) };
}

export function start() {
  canonicalPath();
  Object.entries(ALL).forEach(([name, factory]) => Router.register(name, factory));
  window.IPE = { store, Router, screens: ALL };
  markDisplayMode();
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => {
    if ((store.getState().settings.theme || 'auto') === 'auto') {
      applyTheme();
      Router.repaint();
    }
  });
  store.subscribe(() => applyTheme());
  Router.start();
  store.accrueAll();
  gate();
  applyFlowParam();
  watchLock();
  watchNetwork();
  watchBadge();
  registerServiceWorker();
  const boot = document.getElementById('boot');
  if (boot) {
    boot.classList.add('out');
    setTimeout(() => boot.remove(), 400);
  }
}

start();
