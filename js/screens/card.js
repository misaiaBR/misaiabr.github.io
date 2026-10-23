// Cartão de crédito: visual, fatura, pagamento, limite, bloqueio e virtual.
import { icon } from '../ui/icons.js';
import { alert, amountPad, confirm, copyText, el, esc, processing, resultScreen, sheet, toast } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { CARD, FX } from '../logic/rules.js';
import { fmt } from '../logic/money.js';
import { brandOf, maskNumber } from '../logic/card.js';
import { S, authorize, bothCurrencies, errorText, money, show } from '../ui/shared.js';

function statusBadge(invoice) {
  if (invoice.status === 'empty') return '<span class="badge">sem compras</span>';
  if (invoice.status === 'paid') return '<span class="badge green">quitada</span>';
  if (invoice.overDue) return '<span class="badge red">vencida</span>';
  return '<span class="badge amber">a pagar</span>';
}

function dateText(value) {
  return new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

export const screens = {
  card: () => ({
    title: 'Cartão',
    back: false,
    rootNoBack: true,
    content: () => {
      const s = S();
      const invoice = store.invoiceOf(s);
      const used = invoice.remainingCents;
      const free = Math.max(0, s.card.limitCents - used);
      const pctUsed = s.card.limitCents ? Math.min(100, Math.round((used / s.card.limitCents) * 100)) : 0;
      const freePair = bothCurrencies(free);
      const totalPair = bothCurrencies(s.card.limitCents);
      const usedPair = bothCurrencies(used);
      return `
      <div class="scroll">
        <div class="card-visual ${s.card.blocked ? 'blocked' : ''}">
          <div class="brandline">
            <span class="chip-emv"></span>
            <span style="font-size:13px;letter-spacing:.12em;font-weight:700">${brandOf(s.card.number)}</span>
          </div>
          <div>
            <div class="num-line" data-num>${esc(maskNumber(s.card.number))}</div>
            <div class="foot" style="margin-top:10px">
              <span><b>${esc(s.profile.name.toUpperCase().slice(0, 22))}</b>titular</span>
              <span><b>${esc(s.card.expiry)}</b>validade</span>
              <span><b>${esc(s.card.blocked ? 'BLOQUEADO' : 'ATIVO')}</b>status</span>
            </div>
          </div>
          <span class="wave">${icon('wave')}</span>
        </div>

        <div class="group" style="margin-top:14px">
          <button class="row" data-open="cardInvoice">
            <span class="lead">${icon('doc')}</span>
            <span class="main">
              <span class="t">Fatura</span>
              <span class="s">${invoice.totalCents ? `vence ${dateText(invoice.dueAt)} · fecha ${dateText(invoice.closeAt)}` : 'sem compras neste ciclo'}</span>
            </span>
            <span class="trailing"><b class="num">${invoice.remainingCents ? money(invoice.remainingCents, 'BRL') : money(invoice.totalCents, 'BRL')}</b>${statusBadge(invoice)}</span>
          </button>
          <button class="row" data-open="cardLimit">
            <span class="lead">${icon('gauge')}</span>
            <span class="main"><span class="t">Limite disponível</span><span class="s">${freePair.brl} · ${pctUsed}% usado neste ciclo</span></span>
            <span class="trailing num"><b>${freePair.eur}</b></span>
          </button>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="progress"><i class="${pctUsed > 85 ? 'over' : pctUsed > 60 ? 'warn' : ''}" style="width:${pctUsed}%"></i></div>
          <div class="money-row mut" style="margin-top:8px"><span class="k">Limite total</span><span class="v num">${totalPair.eur}</span></div>
          <div class="money-row mut"><span class="k">em reais</span><span class="v num">${totalPair.brl}</span></div>
          <div class="money-row mut"><span class="k">Usado neste ciclo</span><span class="v num">${usedPair.eur}</span></div>
          <div class="money-row mut"><span class="k">em reais</span><span class="v num">${usedPair.brl}</span></div>
        </div>

        <div class="group" style="margin-top:12px">
          <button class="row" data-open="cardPay">
            <span class="lead">${icon('card')}</span>
            <span class="main"><span class="t">Pagar fatura</span><span class="s">${invoice.remainingCents ? `${dateText(invoice.dueAt)} · ${fmt(invoice.remainingCents)}` : 'nada a pagar agora'}</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-open="cardVirtual">
            <span class="lead">${icon('shield')}</span>
            <span class="main"><span class="t">Cartão virtual</span><span class="s">${s.card.virtual ? 'ativo para compras online' : 'crie um número descartável'}</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-open="cardSecurity">
            <span class="lead">${icon('cog')}</span>
            <span class="main"><span class="t">Configurações do cartão</span><span class="s">contato, online, internacional, dados</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row ${s.card.blocked ? '' : 'danger'}" data-block>
            <span class="lead">${icon(s.card.blocked ? 'unlock' : 'lock')}</span>
            <span class="main"><span class="t">${s.card.blocked ? 'Desbloquear cartão' : 'Bloquear cartão'}</span><span class="s">${s.card.blocked ? 'libera as compras de novo' : 'ninguém consegue usar, nem você'}</span></span>
          </button>
        </div>
      </div>`;
    },
    mount: (node) => {
      node.addEventListener('click', async (ev) => {
        const open = ev.target.closest('[data-open]');
        if (open) {
          if (open.dataset.open === 'cardPay') {
            const invoice = store.invoiceOf(S());
            if (!invoice.remainingCents) {
              await alert({ title: 'Fatura quitada', message: 'Não há valor a pagar neste ciclo. Você pode acompanhar as compras na fatura.' });
              return;
            }
          }
          Router.push(open.dataset.open);
          return;
        }
        if (ev.target.closest('[data-block]')) {
          const s = S();
          if (s.card.blocked) {
            const auth = await authorize({ title: 'Senha para desbloquear', message: 'Confirme para liberar as compras.' });
            if (!auth.ok) return;
            store.setCardFlag('blocked', false);
            toast('Cartão desbloqueado');
          } else {
            const go = await confirm({
              title: 'Bloquear o cartão?',
              message: 'Compras presenciais, online e assinaturas param até você desbloquear.',
              confirmLabel: 'Bloquear',
              destructive: true,
            });
            if (!go) return;
            store.setCardFlag('blocked', true);
            toast('Cartão bloqueado');
          }
          Router.refreshTop();
        }
      });
    },
  }),

  cardInvoice: () => {
    let which = 'current';
    return {
      title: 'Fatura',
      live: false,
      content: () => {
        const s = S();
        const current = store.invoiceOf(s);
        const previous = current.previous;
        const inv = which === 'previous' ? previous : current;
        return `
        <div class="scroll">
          <div class="segmented" style="margin-bottom:12px">
            <button class="${which === 'current' ? 'on' : ''}" data-which="current">Atual</button>
            <button class="${which === 'previous' ? 'on' : ''}" data-which="previous">Fechada</button>
          </div>
          <div class="review">
            <div class="amount num">${show(inv.remainingCents || inv.totalCents, 'BRL')}</div>
            <div class="hint">${which === 'previous' ? `venceu ${dateText(inv.dueAt)}` : `vence em ${dateText(inv.dueAt)}`}</div>
          </div>
          <div class="card">
            <div class="money-row"><span class="k">Compras do ciclo</span><span class="v num">${esc(fmt(inv.totalCents))}</span></div>
            <div class="money-row"><span class="k">Pagado</span><span class="v num">${esc(fmt(inv.paidCents))}</span></div>
            <div class="money-row total"><span class="k">${inv.remainingCents ? 'Resta' : 'Situação'}</span><span class="v num">${inv.remainingCents ? esc(fmt(inv.remainingCents)) : 'quitada'}</span></div>
            <div class="money-row mut"><span class="k">Fechamento</span><span class="v">${dateText(inv.closeAt)}</span></div>
          </div>
          <div class="section-label">Lançamentos (${inv.purchases.length})</div>
          <div class="group" data-purchases></div>
          ${inv.remainingCents && which === 'current' ? `<div style="margin-top:14px"><button class="btn primary" data-pay>Pagar ${esc(fmt(inv.remainingCents))}</button></div>` : ''}
        </div>`;
      },
      mount: (node) => {
        const s = S();
        const current = store.invoiceOf(s);
        const inv = which === 'previous' ? current.previous : current;
        const host = node.querySelector('[data-purchases]');
        if (!inv.purchases.length) {
          host.innerHTML = '<div class="empty">Nenhuma compra neste ciclo.</div>';
        } else {
          inv.purchases.forEach((tx) => {
            const node2 = document.createElement('button');
            node2.className = 'tx';
            node2.innerHTML = `
              <span class="glyph">${icon(tx.details?.international ? 'globe' : 'card')}</span>
              <span class="main"><span class="t">${esc(tx.title)}</span><span class="s">${new Date(tx.at).toLocaleDateString('pt-BR')} · ${esc(tx.subtitle || 'crédito')}</span></span>
              <span class="v num">${esc(fmt(tx.amountCents, tx.currency || 'BRL'))}${tx.currency === 'EUR' ? `<small>${esc(show(tx.amountCents, 'EUR'))}</small>` : ''}</span>`;
            node2.addEventListener('click', () => Router.push('receipt', { id: tx.id }));
            host.append(node2);
          });
        }
        node.addEventListener('click', (ev) => {
          const w = ev.target.closest('[data-which]');
          if (w) {
            which = w.dataset.which;
            Router.refreshTop();
            return;
          }
          if (ev.target.closest('[data-pay]')) Router.push('cardPay');
        });
      },
    };
  },

  cardPay: () => {
    const invoice = store.invoiceOf(S());
    let mode = 'total';
    let amount = invoice.remainingCents;
    return {
      title: 'Pagar fatura',
      live: false,
      content: () => `
        <div class="scroll">
          <div class="segmented" style="margin-bottom:12px">
            <button class="${mode === 'total' ? 'on' : ''}" data-mode="total">Fatura cheia</button>
            <button class="${mode === 'min' ? 'on' : ''}" data-mode="min">Valor livre</button>
          </div>
          <div class="card">
            <div class="money-row"><span class="k">Fatura deste ciclo</span><span class="v num">${esc(fmt(invoice.totalCents))}</span></div>
            <div class="money-row"><span class="k">Já pago</span><span class="v num">${esc(fmt(invoice.paidCents))}</span></div>
            <div class="money-row total"><span class="k">Restante</span><span class="v num">${esc(fmt(invoice.remainingCents))}</span></div>
            <div class="money-row mut"><span class="k">Saldo em conta</span><span class="v num">${esc(fmt(store.availableBRL(S())))}</span></div>
          </div>
          ${mode === 'min' ? '<div class="section-label">Quanto pagar</div><div data-amount style="text-align:center"></div>' : ''}
          ${mode === 'min' ? `<div class="chips" style="padding-left:16px"><button class="chip" data-part="${Math.round(invoice.remainingCents / 2)}">Metade (${esc(fmt(Math.round(invoice.remainingCents / 2)))})</button><button class="chip" data-part="${invoice.remainingCents}">Tudo (${esc(fmt(invoice.remainingCents))})</button></div>` : ''}
        </div>
        <div class="footer-bar"><button class="btn primary ${amount <= 0 ? 'off' : ''}" data-confirm>Pagar ${esc(fmt(amount))}</button></div>`,
      mount: (node) => {
        const btn = node.querySelector('[data-confirm]');
        const refresh = () => {
          btn.textContent = `Pagar ${fmt(amount)}`;
          btn.classList.toggle('off', amount <= 0);
        };
        if (mode === 'min') {
          const host = node.querySelector('[data-amount]');
          const pad = amountPad({
            currency: 'BRL',
            initial: amount,
            onChange: (c) => {
              amount = c;
              refresh();
            },
          });
          host.append(pad.display, pad.pad);
        }
        node.addEventListener('click', (ev) => {
          const m = ev.target.closest('[data-mode]');
          if (m) {
            mode = m.dataset.mode;
            amount = mode === 'total' ? invoice.remainingCents : Math.min(1000, invoice.remainingCents);
            Router.refreshTop();
            return;
          }
          const part = ev.target.closest('[data-part]');
          if (part) {
            amount = Number(part.dataset.part);
            Router.refreshTop();
          }
        });
        btn.addEventListener('click', async () => {
          if (amount <= 0) return toast('Escolha um valor.');
          const auth = await authorize({ title: 'Senha para pagar a fatura', message: fmt(amount) });
          if (!auth.ok) return;
          const proc = processing('Registrando o pagamento…');
          await new Promise((r) => setTimeout(r, 650));
          const res = store.payInvoice({ amountCents: amount });
          proc.close();
          if (!res.ok) {
            await alert({ title: 'Não foi possível', message: errorText(res) });
            return;
          }
          resultScreen({
            ok: true,
            title: 'Fatura paga',
            lines: [
              `${fmt(amount)} saíram da conta em reais`,
              res.invoice.remainingCents ? `Restam ${fmt(res.invoice.remainingCents)} no ciclo` : 'Fatura zerada: limite voltando',
            ],
            primary: {
              label: 'Ver comprovante',
              onClick: () => {
                Router.popToRoot();
                Router.push('receipt', { id: res.tx.id });
              },
            },
            secondary: { label: 'Voltar ao cartão', onClick: () => Router.popToRoot() },
          });
        });
      },
    };
  },

  cardLimit: () => {
    const s = S();
    const invoice = store.invoiceOf(s);
    const min = 500_000;
    const max = 30_000_000;
    let value = s.card.limitCents;
    let error = '';
    return {
      title: 'Limite do cartão',
      live: false,
      content: () => {
        const pct = Math.round(((value - min) / (max - min)) * 100);
        const free = Math.max(0, value - invoice.remainingCents);
        const pair = bothCurrencies(value);
        const freePair = bothCurrencies(free);
        const openPair = bothCurrencies(invoice.remainingCents);
        return `
        <div class="scroll">
          <div class="review">
            <div class="amount num">${esc(pair.eur)}</div>
            <div class="hint">${esc(pair.brl)} · novo limite total do cartão</div>
          </div>
          <div class="card">
            <input type="range" min="${min}" max="${max}" step="50000" value="${value}" data-slider>
            <div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--text-2)">
              <span>${esc(bothCurrencies(min).eur)}</span><span>${pct}%</span><span>${esc(bothCurrencies(max).eur)}</span>
            </div>
            <div class="money-row" style="margin-top:10px"><span class="k">Fatura em aberto</span><span class="v num">${esc(openPair.eur)} · ${esc(openPair.brl)}</span></div>
            <div class="money-row total"><span class="k">Disponível com o novo limite</span><span class="v num">${esc(freePair.eur)} · ${esc(freePair.brl)}</span></div>
          </div>
          ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          <div class="group" style="margin-top:14px">
            <button class="row" data-preset="2822000"><span class="main"><span class="t">€ 5.000,00</span><span class="s">R$ 28.220,00</span></span>${icon('chevron', 'go')}</button>
            <button class="row" data-preset="5644000"><span class="main"><span class="t">€ 10.000,00</span><span class="s">R$ 56.440,00</span></span>${icon('chevron', 'go')}</button>
            <button class="row" data-preset="11288000"><span class="main"><span class="t">€ 20.000,00</span><span class="s">limite atual</span></span>${icon('chevron', 'go')}</button>
          </div>
        </div>
        <div class="footer-bar"><button class="btn primary" data-save>Salvar limite</button></div>`;
      },
      mount: (node) => {
        const slider = node.querySelector('[data-slider]');
        slider?.addEventListener('input', (ev) => {
          value = Number(ev.target.value);
          Router.refreshTop();
        });
        node.addEventListener('click', (ev) => {
          const preset = ev.target.closest('[data-preset]');
          if (preset) {
            value = Number(preset.dataset.preset);
            Router.refreshTop();
            return;
          }
          if (ev.target.closest('[data-save]')) {
            const res = store.setCardLimit(value);
            if (!res.ok) {
              error = errorText(res);
              Router.refreshTop();
              return;
            }
            toast('Limite atualizado');
            Router.pop({ force: true });
          }
        });
      },
    };
  },

  cardVirtual: () => ({
    title: 'Cartão virtual',
    content: () => {
      const s = S();
      const v = s.card.virtual;
      return `
      <div class="scroll">
        ${!v ? `
          <div class="empty">${icon('shield')}<div>Você não tem cartão virtual. Ele serve para assinaturas e sites, com um número separado do físico.</div></div>
          <div style="padding:0 16px"><button class="btn primary" data-create>Criar cartão virtual</button></div>
        ` : `
          <div class="card-visual virtual">
            <div class="brandline"><span class="chip-emv"></span><span style="font-size:12px;letter-spacing:.1em;font-weight:700">${esc(brandOf(v.number))}</span></div>
            <div>
              <div class="num-line" data-num>${esc(maskNumber(v.number))}</div>
              <div class="foot" style="margin-top:10px">
                <span><b>${esc(s.profile.name.toUpperCase().slice(0, 22))}</b>titular</span>
                <span><b>${esc(v.expiry)}</b>validade</span>
                <span><b>virtual</b>uso online</span>
              </div>
            </div>
          </div>
          <div class="group" style="margin-top:14px">
            <button class="row" data-reveal>
              <span class="lead">${icon('eye')}</span>
              <span class="main"><span class="t">Mostrar número e CVV</span><span class="s">pede sua senha</span></span>
            </button>
            <button class="row" data-copy><span class="lead">${icon('copy')}</span><span class="main"><span class="t">Copiar número</span></span></button>
            <div class="row"><span class="lead">${icon('gauge')}</span><span class="main"><span class="t">Limite do virtual</span></span><span class="trailing num">${esc(fmt(v.limitCents))}</span></div>
            <button class="row danger" data-delete><span class="lead">${icon('trash')}</span><span class="main"><span class="t">Excluir cartão virtual</span></span></button>
          </div>
        `}
      </div>`;
    },
    mount: (node) => {
      node.querySelector('[data-create]')?.addEventListener('click', () => {
        const res = store.createVirtualCard();
        if (!res.ok) {
          toast(errorText(res));
          return;
        }
        toast('Cartão virtual criado');
        Router.refreshTop();
      });
      node.querySelector('[data-delete]')?.addEventListener('click', async () => {
        const go = await confirm({ title: 'Excluir cartão virtual?', message: 'Assinaturas que usam esse número vão falhar.', confirmLabel: 'Excluir', destructive: true });
        if (!go) return;
        store.deleteVirtualCard();
        Router.refreshTop();
      });
      node.querySelector('[data-copy]')?.addEventListener('click', async () => {
        const v = S().card.virtual;
        if (!v) return;
        const auth = await authorize({ title: 'Senha para copiar', message: 'O número completo do cartão é dado sensível.' });
        if (!auth.ok) return;
        toast((await copyText(v.number.replace(/\s/g, ''))) ? 'Número copiado' : 'Não foi possível copiar');
      });
      node.querySelector('[data-reveal]')?.addEventListener('click', async () => {
        const v = S().card.virtual;
        if (!v) return;
        const auth = await authorize({ title: 'Senha para mostrar', message: 'Não compartilhe tela com CVV.' });
        if (!auth.ok) return;
        sheet({
          title: 'Dados do cartão virtual',
          body: el(`<div class="sheet-pad">
            <div class="group">
              <div class="row"><span class="main"><span class="t">Número</span></span><span class="trailing selectable mono">${esc(v.number)}</span></div>
              <div class="row"><span class="main"><span class="t">Validade</span></span><span class="trailing selectable mono">${esc(v.expiry)}</span></div>
              <div class="row"><span class="main"><span class="t">CVV</span></span><span class="trailing selectable mono">${esc(v.cvv)}</span></div>
            </div>
          </div>`),
        });
      });
    },
  }),

  cardSecurity: () => ({
    title: 'Configurações do cartão',
    content: () => {
      const s = S();
      const item = (flag, title, sub) => `
        <div class="row">
          <span class="lead">${icon(flag === 'contactless' ? 'wave' : flag === 'onlinePurchases' ? 'globe' : 'euro')}</span>
          <span class="main"><span class="t">${title}</span><span class="s">${sub}</span></span>
          <span class="trailing"><span data-toggle="${flag}"></span></span>
        </div>`;
      return `
      <div class="scroll flush">
        <div class="group" style="margin:0 16px">
          ${item('contactless', 'Aproximação', 'Pagar encostando o iPhone no terminal')}
          ${item('onlinePurchases', 'Compras online', 'Permite usar o número em sites')}
          ${item('international', 'Compras internacionais', `IOF de ${(FX.iofCard / 100).toFixed(2).replace('.', ',')}% somado ao valor`)}
        </div>
        <div class="section-label" style="padding-left:16px">Situação</div>
        <div class="card" style="margin:0 16px">
          <div class="money-row"><span class="k">Cartão</span><span class="v">${s.card.blocked ? 'bloqueado' : 'ativo'}</span></div>
          <div class="money-row mut"><span class="k">Para bloquear</span><span class="v">use o botão na tela do cartão</span></div>
        </div>
        <div class="section-label" style="padding-left:16px">Dados do cartão físico</div>
        <div class="group" style="margin:0 16px">
          <button class="row" data-reveal>
            <span class="lead">${icon('eye')}</span>
            <span class="main"><span class="t">Mostrar número, validade e CVV</span><span class="s">protegido pela sua senha</span></span>
          </button>
        </div>
      </div>`;
    },
    mount: (node) => {
      const s = S();
      node.querySelectorAll('[data-toggle]').forEach((host) => {
        const flag = host.dataset.toggle;
        import('../ui/kit.js').then(({ toggle }) => {
          host.append(toggle(Boolean(s.card[flag]), (value) => {
            const res = store.setCardFlag(flag, value);
            if (!res.ok) {
              toast(errorText(res));
              return;
            }
            toast(`${flagLabel(flag)} ${value ? 'ativado' : 'desativado'}`);
            Router.refreshTop();
          }));
        });
      });
      node.querySelector('[data-reveal]').addEventListener('click', async () => {
        const auth = await authorize({ title: 'Senha para revelar', message: 'Mostra o número completo do cartão.' });
        if (!auth.ok) return;
        const cur = S().card;
        sheet({
          title: 'Cartão físico',
          body: el(`<div class="sheet-pad">
            <div class="group">
              <div class="row"><span class="main"><span class="t">Número</span></span><span class="trailing selectable mono">${esc(cur.number)}</span></div>
              <div class="row"><span class="main"><span class="t">Validade</span></span><span class="trailing selectable mono">${esc(cur.expiry)}</span></div>
              <div class="row"><span class="main"><span class="t">CVV</span></span><span class="trailing selectable mono">${esc(cur.cvv)}</span></div>
              <div class="row"><span class="main"><span class="t">Bandeira</span></span><span class="trailing">${esc(brandOf(cur.number))}</span></div>
            </div>
          </div>`),
        });
      });
    },
  }),
};

function flagLabel(flag) {
  return {
    contactless: 'Aproximação',
    onlinePurchases: 'Compras online',
    international: 'Compras internacionais',
    blocked: 'Bloqueio do cartão',
  }[flag] || flag;
}
