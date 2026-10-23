// Central de notificações do app.
import { icon } from '../ui/icons.js';
import { confirm, esc, timeAgo } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { S } from '../ui/shared.js';

const KIND_ICON = {
  pix: 'pix',
  card: 'card',
  bill: 'barcode',
  fx: 'euro',
  security: 'shield',
  alert: 'info',
  info: 'bell',
};

export const screens = {
  notifications: () => ({
    title: 'Notificações',
    right: [
      {
        icon: 'check',
        aria: 'Marcar todas como lidas',
        label: 'Lidas',
        onClick: () => {
          store.markNotificationsRead();
          Router.refreshTop();
        },
      },
    ],
    content: () => {
      const list = S().notifications;
      const unread = list.filter((n) => !n.read).length;
      return `
      <div class="scroll flush">
        ${unread ? `<div class="note" style="padding:12px 16px 4px">${unread} não lida${unread > 1 ? 's' : ''}</div>` : ''}
        ${list.length === 0 ? `<div class="empty">${icon('bell')}<div>Nada por aqui. Avisos de Pix, cartão e câmbio aparecem nesta lista.</div></div>` : ''}
        <div class="group" style="margin:8px 16px 0" data-list></div>
      </div>`;
    },
    mount: (node) => {
      const host = node.querySelector('[data-list]');
      S().notifications.forEach((n) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
          <span class="lead">${icon(KIND_ICON[n.kind] || 'bell')}</span>
          <span class="main">
            <span class="t">${esc(n.title)}</span>
            <span class="s">${esc(n.body)} · ${esc(timeAgo(n.at))}</span>
          </span>
          <span class="trailing">${n.read ? '' : '<i style="width:9px;height:9px;border-radius:50%;background:var(--danger);display:block"></i>'}</span>`;
        row.addEventListener('click', async () => {
          if (!n.read) store.markNotificationsRead([n.id]);
          if (n.txId && S().tx.some((t) => t.id === n.txId)) {
            Router.push('receipt', { id: n.txId });
            return;
          }
          Router.refreshTop();
        });
        row.addEventListener('contextmenu', async (ev) => {
          ev.preventDefault();
          const go = await confirm({ title: 'Apagar aviso?', message: n.title, confirmLabel: 'Apagar', destructive: true });
          if (go) {
            store.deleteNotification(n.id);
            Router.refreshTop();
          }
        });
        host.append(row);
      });
    },
  }),
};
