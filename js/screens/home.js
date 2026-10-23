// Tela inicial: saldo total em euro/real, atalhos, contas por moeda e últimas transações.
import { bandeira, icon } from '../ui/icons.js';
import { esc } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { fmt } from '../logic/money.js';
import { brandOf } from '../logic/card.js';
import { S, balanceHidden, bothCurrencies, conv, cur, isRevealed, setRevealed, symbol, txRow } from '../ui/shared.js';

const TAB_ROOT = ['home', 'statement', 'pix', 'card', 'profile'];

const PILLS = [
  { action: 'send', label: 'Enviar', primary: true },
  { action: 'receive', label: 'Receber' },
  { action: 'scan', label: 'Ler QR code', icon: 'qr' },
  { action: 'euro', label: 'Euro' },
  { action: 'boleto', label: 'Boleto' },
  { action: 'boxes', label: 'Caixinhas' },
];

const ROUTES = {
  send: ['pixSend', {}],
  receive: ['pixCharge', {}],
  scan: ['pixScan', {}],
  euro: ['eur', {}],
  boleto: ['payBoleto', {}],
  boxes: ['boxes', {}],
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Boa madrugada';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export const screens = {
  home: () => ({
    transparentNav: true,
    hideTabbar: false,
    rootNoBack: true,
    content: () => {
      const s = S();
      const display = cur();
      const unread = s.notifications.filter((n) => !n.read).length;
      const hidden = balanceHidden();
      const raw = (cents, c) => (hidden ? `•••• ${c}` : fmt(cents, c));
      const total = conv(s.accounts.brl.cashCents, 'BRL') + conv(s.accounts.eur.cashCents, 'EUR');
      return `
      <div class="scroll home2">
        <div class="hero">
          <div class="hero-row">
            <button class="avatar" data-go="profile">${esc(s.profile.initials || 'IP')}</button>
            <div class="hi"><b>${greeting()}, ${esc(s.profile.firstName || 'você')}</b></div>
            <button class="bell" data-go="notifications" aria-label="Notificações">
              ${icon('bell')}${unread ? '<i class="dot"></i>' : ''}
            </button>
          </div>
        </div>

        <div class="total">
          <div class="label">Saldo total</div>
          <div class="total-line">
            <span class="value num">${hidden ? `${symbol()} ••••••` : fmt(total, display)}</span>
            <button class="disc-btn" data-action="eye" aria-label="Mostrar ou ocultar valores">${icon(isRevealed() ? 'eye-off' : 'eye')}</button>
            <button class="disc-btn" data-go="statement" aria-label="Ver extrato">${icon('gauge')}</button>
            <span class="cur-toggle" role="tablist" aria-label="Moeda de exibição">
              <button class="${display === 'BRL' ? 'on' : ''}" data-cur="BRL" role="tab" aria-selected="${display === 'BRL'}">R$</button>
              <button class="${display === 'EUR' ? 'on' : ''}" data-cur="EUR" role="tab" aria-selected="${display === 'EUR'}">€</button>
            </span>
          </div>
        </div>

        <div class="pills">
          ${PILLS.map((p) => `<button class="pill ${p.primary ? 'primary' : ''}" data-action="${p.action}">${p.icon ? icon(p.icon) : ''}${p.label}</button>`).join('')}
        </div>

        <div class="wallet">
          <button class="wallet-tab" data-go="card">
            <span>Seu cartão</span>${icon('chevron')}
            <span class="mark">${esc(brandOf(s.card.number))}</span>
            <i class="lobe" aria-hidden="true"></i>
          </button>
          <div class="wallet-body">
            <button class="wallet-head" data-go="statement">
              <span class="wh-main"><span class="wallet-title">Conta dia a dia</span><span class="wallet-sub num">${raw(total, display)}</span></span>
              ${icon('chevron')}
            </button>
            <div class="accts">
              <button class="acct" data-go="statement">
                <span class="flag band">${bandeira('BR')}</span>
                <span class="a-val num">${raw(s.accounts.brl.cashCents, 'BRL')}</span>
                ${icon('chevron', 'go')}
              </button>
              <button class="acct" data-go="eur">
                <span class="flag band">${bandeira('EUR')}</span>
                <span class="a-val num">${raw(s.accounts.eur.cashCents, 'EUR')}</span>
                ${icon('chevron', 'go')}
              </button>
              <button class="acct" data-go="card">
                <span class="flag">${icon('card')}</span>
                <span class="a-val num">${bothCurrencies(s.card.limitCents, 'BRL').eur}</span>
                ${icon('chevron', 'go')}
              </button>
            </div>
            <div class="wallet-foot">
              <button class="chip-btn" data-go="editProfile">${icon('bank')} Dados de conta</button>
              <button class="chip-btn" data-go="pix">${icon('pix')} Pix</button>
            </div>
          </div>
        </div>

        <div class="sec-head"><b>Transações</b><button class="link" data-go="statement">Ver todas</button></div>
        <div class="group" data-recent></div>
      </div>`;
    },
    mount: (node) => {
      const s = S();
      const recentHost = node.querySelector('[data-recent]');
      const recent = s.tx.filter((t) => t.status !== 'failed').slice(0, 5);
      if (!recent.length) {
        recentHost.innerHTML = '<div class="empty">Nenhum lançamento ainda</div>';
      } else {
        recent.forEach((tx) => recentHost.append(txRow(tx, () => Router.push('receipt', { id: tx.id }))));
      }

      node.addEventListener('click', (ev) => {
        const cur2 = ev.target.closest('[data-cur]');
        if (cur2) {
          store.setCurrency(cur2.dataset.cur);
          return;
        }
        const act = ev.target.closest('[data-action]');
        if (act) {
          const key = act.dataset.action;
          if (key === 'eye') {
            setRevealed(!isRevealed());
            Router.refreshTop();
            return;
          }
          const route = ROUTES[key];
          if (route) Router.push(route[0], route[1]);
          return;
        }
        const go = ev.target.closest('[data-go]');
        if (!go) return;
        const target = go.dataset.go;
        if (TAB_ROOT.includes(target)) Router.switchTab(target);
        else Router.push(target);
      });
    },
  }),
};

function escDate(iso) {
  if (!iso) return 'hoje';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
