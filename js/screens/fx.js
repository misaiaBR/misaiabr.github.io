// Conta em euro: saldo, compra/venda de moeda com IOF e VET, envio SEPA e cotação editável.
import { icon } from '../ui/icons.js';
import { alert, amountPad, confirm, copyText, el, esc, processing, resultScreen, sheet, toast } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { FX } from '../logic/rules.js';
import { fmt, parseAmount, convert } from '../logic/money.js';
import { quoteBuy, quoteSell, quotation, validateIban } from '../logic/fx.js';
import { S, authorize, balanceHidden, errorText, ibanMasked, money, show, txRow } from '../ui/shared.js';

const MIN_LABEL = fmt(FX.minBuyEurCents, 'EUR');

export const screens = {
  eur: () => ({
    title: 'Conta em euro',
    content: () => {
      const s = S();
      const q = quotation(s);
      const eur = s.accounts.eur.cashCents;
      const movements = s.tx.filter((t) => t.currency === 'EUR').slice(0, 8);
      return `
      <div class="scroll">
        <div class="balance-card">
          <div class="label">Saldo em euro</div>
          <div class="value num">${balanceHidden() ? '€ ••••••' : esc(fmt(eur, 'EUR'))}</div>
          <div class="sub num">${balanceHidden() ? '' : `${esc(fmt(convert(eur, q.ref, 'EUR', 'BRL'), 'BRL'))} pela cotação de ${new Date(q.updatedAt).toLocaleDateString('pt-BR')}`}</div>
          <div class="meta"><span>IBAN ${esc(ibanMasked(s.accounts.eur.iban))}</span></div>
        </div>

        <div class="card" style="margin-top:12px">
          <div class="rate-strip">
            <span class="big num">${esc(fmt(q.ref, 'BRL'))}</span>
            <span style="font-size:13px;color:var(--text-2)">por € 1,00</span>
          </div>
          <div class="money-row mut"><span class="k">Você compra pagando</span><span class="v num">${esc(fmt(q.buy, 'BRL'))}</span></div>
          <div class="money-row mut"><span class="k">Você vende recebendo</span><span class="v num">${esc(fmt(q.sell, 'BRL'))}</span></div>
          <div class="money-row mut"><span class="k">Cotação de</span><span class="v">${new Date(q.updatedAt).toLocaleDateString('pt-BR')}${q.manual ? ' · ajustada por você' : ' · embutida no app'}</span></div>
        </div>

        <div class="group" style="margin-top:12px">
          <button class="row" data-go="buy">
            <span class="lead">${icon('plus')}</span>
            <span class="main"><span class="t">Comprar euros</span><span class="s">sai da conta em reais, entra no euro</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-go="sell">
            <span class="lead">${icon('minus')}</span>
            <span class="main"><span class="t">Vender euros</span><span class="s">volta para a conta em reais</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-go="sepa">
            <span class="lead">${icon('globe')}</span>
            <span class="main"><span class="t">Enviar para o exterior</span><span class="s">IBAN na zona SEPA</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-go="rate">
            <span class="lead">${icon('cog')}</span>
            <span class="main"><span class="t">Ajustar a cotação</span><span class="s">o app é offline, então a taxa é sua</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-iban>
            <span class="lead">${icon('copy')}</span>
            <span class="main"><span class="t">Copiar meu IBAN</span><span class="s">para receber da Europa</span></span>
          </button>
        </div>

        <div class="section-label">Movimentos em euro</div>
        <div class="group" data-mov></div>
        ${movements.length ? '' : `<div class="empty">${icon('euro')}<div>Compre euros para ver os movimentos aqui.</div></div>`}
      </div>`;
    },
    mount: (node) => {
      const mov = node.querySelector('[data-mov]');
      S().tx.filter((t) => t.currency === 'EUR').slice(0, 8).forEach((tx) => {
        mov.append(txRow(tx, () => Router.push('receipt', { id: tx.id })));
      });
      node.addEventListener('click', (ev) => {
        const go = ev.target.closest('[data-go]');
        if (go) {
          const target = go.dataset.go;
          if (target === 'buy' || target === 'sell') Router.push('fxConvert', { side: target });
          else Router.push(target === 'sepa' ? 'fxSepa' : 'fxRate');
          return;
        }
        if (ev.target.closest('[data-iban]')) {
          const iban = S().accounts.eur.iban;
          if (!iban) return toast('Complete uma compra de euros para liberar o IBAN.');
          copyText(iban).then((ok) => toast(ok ? 'IBAN copiado' : 'Não foi possível copiar'));
        }
      });
    },
  }),

  fxConvert: (params) => {
    let side = params.side === 'sell' ? 'sell' : 'buy';
    let amount = 0;
    let error = '';
    const quote = () => (side === 'buy' ? quoteBuy(S(), amount) : quoteSell(S(), amount));
    return {
      title: side === 'buy' ? 'Comprar euros' : 'Vender euros',
      live: false,
      content: () => {
        const s = S();
        const q = amount > 0 ? quote() : null;
        error = q ? validateLive(q) : '';
        return `
        <div class="scroll">
          <div class="segmented" style="margin-bottom:14px">
            <button class="${side === 'buy' ? 'on' : ''}" data-side="buy">Comprar</button>
            <button class="${side === 'sell' ? 'on' : ''}" data-side="sell">Vender</button>
          </div>
          <div class="review">
            <div class="amount num">${amount ? esc(fmt(amount, 'EUR')) : '€ 0,00'}</div>
            <div class="hint">${side === 'buy' ? 'euros que entram na conta' : 'euros que saem da conta'}</div>
          </div>
          <div class="chips" style="padding-left:16px">
            ${[10000, 25000, 50000, 100000].map((v) => `<button class="chip" data-quick="${v}">${esc(fmt(v, 'EUR'))}</button>`).join('')}
            ${side === 'sell' ? `<button class="chip" data-all>Tudo (${esc(fmt(s.accounts.eur.cashCents, 'EUR'))})</button>` : ''}
          </div>
          ${q ? `
          <div class="card" style="margin-top:8px">
            <div class="money-row"><span class="k">Cotação (${side === 'buy' ? 'compra' : 'venda'})</span><span class="v num">${esc(fmt(q.rate, 'BRL'))} / €</span></div>
            <div class="money-row"><span class="k">Valor do câmbio</span><span class="v num">${esc(fmt(q.changeBRL, 'BRL'))}</span></div>
            <div class="money-row"><span class="k">IOF ${(FX.iofExchange / 100).toFixed(2).replace('.', ',')}%</span><span class="v num">${esc(fmt(q.iofBRL, 'BRL'))}</span></div>
            <div class="money-row total"><span class="k">${side === 'buy' ? 'Total debitado em reais' : 'Total creditado em reais'}</span><span class="v num">${esc(fmt(q.totalBRL, 'BRL'))}</span></div>
            <div class="money-row mut"><span class="k">Custo efetivo (VET)</span><span class="v num">${esc(fmt(q.vetRate, 'BRL'))} / €</span></div>
          </div>
          ${side === 'buy' ? `<div class="fx-banner">${icon('wallet')}<span>Saldo em reais: <b>${esc(fmt(store.availableBRL(s)))}</b></span></div>` : `<div class="fx-banner">${icon('euro')}<span>Saldo em euro: <b>${esc(fmt(s.accounts.eur.cashCents, 'EUR'))}</b></span></div>`}
          ` : ''}
          ${error ? `<div class="field-hint error" style="margin-top:10px">${esc(error)}</div>` : ''}
        </div>
        <div data-pad class="pad-dock"></div>
        <div class="footer-bar"><button class="btn primary ${!amount || error ? 'off' : ''}" data-go>${side === 'buy' ? 'Comprar' : 'Vender'} ${esc(fmt(amount, 'EUR'))}</button></div>`;
      },
      mount: (node) => {
        const host = node.querySelector('[data-pad]');
        const pad = amountPad({
          currency: 'EUR',
          initial: amount,
          onChange: (cents) => {
            amount = cents;
            Router.refreshTop();
          },
        });
        host.append(pad.display, pad.pad);
        node.addEventListener('click', async (ev) => {
          const sw = ev.target.closest('[data-side]');
          if (sw) {
            side = sw.dataset.side;
            Router.refreshTop();
            return;
          }
          const quick = ev.target.closest('[data-quick]');
          if (quick) {
            pad.set(Number(quick.dataset.quick));
            return;
          }
          if (ev.target.closest('[data-all]')) {
            pad.set(S().accounts.eur.cashCents);
            return;
          }
          if (ev.target.closest('[data-go]')) {
            const q = quote();
            const live = validateLive(q);
            if (live) return toast(live);
            const auth = await authorize({
              title: 'Senha para o câmbio',
              message: side === 'buy' ? `Comprar ${fmt(amount, 'EUR')}` : `Vender ${fmt(amount, 'EUR')}`,
            });
            if (!auth.ok) return;
            const proc = processing('Executando a ordem de câmbio…');
            await new Promise((r) => setTimeout(r, 800));
            const res = side === 'buy' ? store.buyEuros(amount) : store.sellEuros(amount);
            proc.close();
            if (!res.ok) {
              await alert({ title: 'Câmbio não realizado', message: errorText(res) });
              return;
            }
            resultScreen({
              ok: true,
              title: side === 'buy' ? 'Euros comprados' : 'Euros vendidos',
              lines: [
                side === 'buy'
                  ? `+ ${fmt(res.quote.eurCents, 'EUR')} na conta em euro`
                  : `-${fmt(res.quote.eurCents, 'EUR')} da conta em euro`,
                side === 'buy'
                  ? `${fmt(res.quote.totalBRL, 'BRL')} debitados (com IOF)`
                  : `${fmt(res.quote.totalBRL, 'BRL')} creditados (menos IOF)`,
                `Contrato ${res.tx.details.contract}`,
              ],
              primary: {
                label: 'Ver comprovante',
                onClick: () => {
                  Router.popToRoot();
                  Router.push('receipt', { id: res.tx.id });
                },
              },
              secondary: { label: 'Voltar', onClick: () => Router.popToRoot() },
            });
          }
        });
      },
    };
  },

  fxSepa: () => {
    let iban = '';
    let amount = 0;
    let message = '';
    let check = null;
    return {
      title: 'Enviar para o exterior',
      live: false,
      content: () => {
        const s = S();
        const enough = amount > 0 && amount <= s.accounts.eur.cashCents;
        return `
        <div class="scroll">
          <div class="large-title">Transferência<br>SEPA</div>
          <div class="field">
            <label for="iban">IBAN de destino</label>
            <input id="iban" class="mono" autocapitalize="characters" spellcheck="false" placeholder="BE54 5390 0754 7092" value="${esc(iban)}">
          </div>
          ${check && !check.ok ? `<div class="field-hint error">${esc(check.error)}</div>` : ''}
          ${check?.ok ? `<div class="fx-banner" style="background:color-mix(in srgb, var(--pos) 14%, transparent)">${icon('check')}<span>IBAN válido · ${esc(check.countryName)} · ${esc(check.value)}</span></div>` : ''}
          <div class="section-label">Quanto enviar</div>
          <div class="chips" style="padding-left:16px">
            ${[5000, 10000, 20000].map((v) => `<button class="chip" data-quick="${v}">${esc(fmt(v, 'EUR'))}</button>`).join('')}
            <button class="chip" data-all>Tudo (${esc(fmt(s.accounts.eur.cashCents, 'EUR'))})</button>
          </div>
          <div class="field" style="margin-top:6px">
            <label for="msg">Descrição para o favorecido</label>
            <input id="msg" maxlength="40" value="${esc(message)}" placeholder="Ex.: aluguel outubro">
          </div>
          <div class="card" style="margin-top:12px">
            <div class="money-row"><span class="k">Sai da conta em euro</span><span class="v num">${esc(fmt(amount, 'EUR'))}</span></div>
            <div class="money-row mut"><span class="k">IOF</span><span class="v">não se aplica de novo — a conversão já pagou ${esc((FX.iofExchange / 100).toFixed(2).replace('.', ','))}%</span></div>
            <div class="money-row mut"><span class="k">Taxa de envio</span><span class="v">gratuita (SEPA)</span></div>
            <div class="money-row total"><span class="k">Chega para o favorecido</span><span class="v num">${esc(fmt(amount, 'EUR'))}</span></div>
          </div>
          ${!enough && amount > 0 ? `<div class="field-hint error">Saldo em euro insuficiente.</div>` : ''}
        </div>
        <div data-pad class="pad-dock"></div>
        <div class="footer-bar"><button class="btn primary ${!check?.ok || amount <= 0 || !enough ? 'off' : ''}" data-send>Enviar ${esc(fmt(amount, 'EUR'))}</button></div>`;
      },
      mount: (node) => {
        const host = node.querySelector('[data-pad]');
        const cta = node.querySelector('[data-send]');
        const paintCta = () => {
          if (!cta) return;
          const enough = amount > 0 && amount <= S().accounts.eur.cashCents;
          cta.textContent = `Enviar ${fmt(amount, 'EUR')}`;
          cta.classList.toggle('off', !check?.ok || amount <= 0 || !enough);
        };
        const pad = amountPad({
          currency: 'EUR',
          initial: amount,
          onChange: (c) => {
            amount = c;
            paintCta();
          },
        });
        host.append(pad.display, pad.pad);
        paintCta();
        node.querySelector('#iban').addEventListener('input', (ev) => {
          iban = ev.target.value.toUpperCase();
          check = iban.length > 5 ? validateIban(iban) : null;
          Router.refreshTop();
        });
        node.querySelector('#msg').addEventListener('input', (ev) => {
          message = ev.target.value;
        });
        node.addEventListener('click', async (ev) => {
          const quick = ev.target.closest('[data-quick]');
          if (quick) {
            pad.set(Number(quick.dataset.quick));
            return;
          }
          if (ev.target.closest('[data-all]')) {
            pad.set(S().accounts.eur.cashCents);
            return;
          }
          if (!ev.target.closest('[data-send]')) return;
          const final = validateIban(iban);
          if (!final.ok) return toast(final.error);
          const auth = await authorize({ title: 'Senha para enviar', message: `${fmt(amount, 'EUR')} para ${final.countryName}` });
          if (!auth.ok) return;
          const proc = processing('Transmitindo a ordem SEPA…');
          await new Promise((r) => setTimeout(r, 800));
          const res = store.sepaTransfer({ iban, eurCents: amount, message });
          proc.close();
          if (!res.ok) {
            await alert({ title: 'Não foi possível enviar', message: errorText(res) });
            return;
          }
          resultScreen({
            ok: true,
            title: 'Transferência enviada',
            lines: [`${fmt(amount, 'EUR')} para ${final.countryName}`, message ? `Descrição: ${message}` : 'Chega em até 1 dia útil'],
            primary: {
              label: 'Ver comprovante',
              onClick: () => {
                Router.popToRoot();
                Router.push('receipt', { id: res.tx.id });
              },
            },
            secondary: { label: 'Voltar', onClick: () => Router.popToRoot() },
          });
        });
      },
    };
  },

  fxRate: () => {
    let text = String((S().settings.fx.rate / 10000).toFixed(4)).replace('.', ',');
    let error = '';
    return {
      title: 'Cotação do euro',
      live: false,
      content: () => {
        const s = S();
        const q = quotation(s);
        return `
        <div class="scroll">
          <div class="card">
            <div class="money-row"><span class="k">Comercial de referência</span><span class="v num">${esc(fmt(q.ref, 'BRL'))}</span></div>
            <div class="money-row"><span class="k">Compra (você paga)</span><span class="v num">${esc(fmt(q.buy, 'BRL'))}</span></div>
            <div class="money-row"><span class="k">Venda (você recebe)</span><span class="v num">${esc(fmt(q.sell, 'BRL'))}</span></div>
            <div class="money-row mut"><span class="k">Spread</span><span class="v">${esc(q.spreadLabel)} para cada lado</span></div>
            <div class="money-row mut"><span class="k">Última atualização</span><span class="v">${new Date(q.updatedAt).toLocaleDateString('pt-BR')}</span></div>
          </div>
          <div class="section-label">Definir a cotação de referência</div>
          <div class="field">
            <label for="rate">Reais por 1 euro</label>
            <input id="rate" inputmode="decimal" value="${esc(text)}" placeholder="5,6440">
          </div>
          ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          <div class="btn-row">
            <button class="btn tonal" data-reset>Voltar à taxa embutida</button>
            <button class="btn primary" data-save>Usar esta taxa</button>
          </div>
          <div class="section-label">Na sua conta</div>
          <div class="card">
            <div class="money-row"><span class="k">Saldo em reais mostrado como</span><span class="v num">${esc(show(s.accounts.brl.cashCents, 'BRL'))}</span></div>
            <div class="money-row"><span class="k">Moeda de exibição</span><span class="v">${s.settings.currency === 'EUR' ? 'euro' : 'real'}</span></div>
          </div>
        </div>`;
      },
      mount: (node) => {
        node.querySelector('#rate').addEventListener('input', (ev) => {
          text = ev.target.value;
        });
        node.querySelector('[data-save]').addEventListener('click', () => {
          const cents = Math.round(parseAmount(text) * 10000 / 100);
          const res = store.setRate(Number.isFinite(cents) ? cents : 0);
          if (!res.ok) {
            error = res.error || 'Valor inválido.';
            Router.refreshTop();
            return;
          }
          toast('Cotação atualizada');
          Router.refreshTop();
        });
        node.querySelector('[data-reset]').addEventListener('click', () => {
          store.resetRate();
          text = String((S().settings.fx.rate / 10000).toFixed(4)).replace('.', ',');
          error = '';
          toast('Taxa embutida restaurada');
          Router.refreshTop();
        });
      },
    };
  },
};

function validateLive(q) {
  const s = S();
  if (q.eurCents < FX.minBuyEurCents) return `O mínimo é ${MIN_LABEL}.`;
  if (q.side === 'buy') {
    if (q.totalBRL > store.availableBRL(s)) return 'Saldo em reais insuficiente para pagar o câmbio com IOF.';
    const today = new Date().toISOString().slice(0, 10);
    const used = s.tx
      .filter((t) => t.type === 'fx_buy' && String(t.at).slice(0, 10) === today)
      .reduce((acc, t) => acc + (t.details?.eurCents || 0), 0);
    if (used + q.eurCents > FX.maxDailyBuyEurCents) return `Limite diário de ${fmt(FX.maxDailyBuyEurCents, 'EUR')} atingido.`;
  } else if (q.eurCents > s.accounts.eur.cashCents) {
    return 'Você não tem esses euros na conta.';
  }
  return '';
}
