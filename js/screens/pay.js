// Pagar boleto (linha digitável decodificada de verdade) e recarga de celular.
import { icon } from '../ui/icons.js';
import { alert, amountPad, confirm, copyText, el, esc, processing, resultScreen, toast } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { BOLETO, isNightHour } from '../logic/rules.js';
import { fmt, parseAmount } from '../logic/money.js';
import { dateToFactor, formatLinhaDigitavel, linhaFromParts, readLinhaDigitavel } from '../logic/boleto.js';
import { S, authorize, errorText, show } from '../ui/shared.js';

const OPERATORS = [
  { id: 'Vivo', color: '#f5b301' },
  { id: 'Claro', color: '#123c8c' },
  { id: 'TIM', color: '#2b2b2b' },
  { id: 'Oi', color: '#00b3e1' },
];
const PLANS = [2000, 2500, 3000, 4000, 5000, 7500, 10000];

/** Boleto de exemplo, montado com os DVs calculados de verdade. */
function demoBoleto() {
  return linhaFromParts({
    banco: '237',
    fator: dateToFactor(new Date(Date.now() + 5 * 86_400_000)),
    valorCents: 15990,
    campoLivre: '0000000000000000015990001',
  });
}

function barcodeHtml(digits) {
  const bars = String(digits)
    .replace(/\D/g, '')
    .slice(0, 44)
    .split('')
    .map((d) => `<i style="width:${1 + (Number(d) % 4)}px;height:${28 + (Number(d) % 5) * 3}px"></i>`)
    .join('');
  return `<div class="barcode">${bars}</div>`;
}

export const screens = {
  payBoleto: (params) => {
    let linha = params.linha || '';
    let parsed = linha ? readLinhaDigitavel(linha) : null;
    let manual = 0;
    return {
      title: 'Pagar boleto',
      live: false,
      content: () => {
        const ok = parsed?.ok;
        const amount = ok ? (parsed.needsManualAmount ? manual : parsed.valorCents) : 0;
        return `
        <div class="scroll">
          <div class="large-title">Número do<br>boleto</div>
          <div class="field">
            <label for="linha">Linha digitável (47 ou 48 dígitos)</label>
            <input id="linha" inputmode="numeric" autocorrect="off" spellcheck="false"
              class="mono" style="font-size:14px" placeholder="00000.00000 00000.000000 ..." value="${esc(formatLinhaDigitavel(linha))}">
          </div>
          <div class="btn-row">
            <button class="btn tonal sm" data-paste>${icon('copy')} Colar</button>
            <button class="btn tonal sm" data-demo>Preencher código de barras</button>
          </div>

          ${ok ? `
            <div class="card" style="margin-top:16px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                  <div style="font-size:13px;color:var(--text-2)">Banco cobrador</div>
                  <div style="font-size:17px;font-weight:600">${esc(parsed.bankName)}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:13px;color:var(--text-2)">Valor</div>
                  <div class="num" style="font-size:22px;font-weight:700">${esc(fmt(amount))}</div>
                </div>
              </div>
              ${parsed.vencimento ? `
                <div class="money-row mut"><span class="k">Vencimento</span><span class="v">${new Date(parsed.vencimento).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' })}</span></div>
                <div class="money-row mut"><span class="k">Fator de vencimento</span><span class="v num">${esc(String(parsed.fator))}</span></div>` : ''}
              <div style="margin-top:10px">${barcodeHtml(parsed.digits)}</div>
              <div class="money-row mut"><span class="k">Sai da conta</span><span class="v">${esc(S().profile.firstName)} · ${esc(store.getState().accounts ? 'conta em reais' : '')}</span></div>
            </div>
            ${parsed.warning ? `<div class="fx-banner" style="background:var(--danger-soft)">${icon('info')}<span>${esc(parsed.warning)}</span></div>` : ''}
            ${parsed.needsManualAmount ? `<div class="section-label">Digite o valor do boleto</div><div data-amount style="text-align:center"></div>` : ''}
            ${isNightHour() ? `<div class="fx-banner">${icon('clock')}<span>Pagamento feito agora: o beneficiário recebe no próximo dia útil.</span></div>` : ''}
          ` : ''}
          ${parsed && !ok ? `<div class="field-hint error" style="margin-top:12px">${esc(parsed.error)}</div>` : ''}
        </div>
        ${ok ? `<div class="footer-bar"><button class="btn primary ${amount <= 0 ? 'off' : ''}" data-pay>${amount > 0 ? `Pagar ${esc(fmt(amount))}` : 'Pagar boleto'}</button></div>` : ''}`;
      },
      mount: (node) => {
        const input = node.querySelector('#linha');
        input?.addEventListener('input', (ev) => {
          const digits = ev.target.value.replace(/\D/g, '').slice(0, 48);
          linha = digits;
          parsed = digits ? readLinhaDigitavel(digits) : null;
          manual = 0;
          Router.refreshTop();
        });
        if (parsed?.ok && parsed.needsManualAmount) {
          const host = node.querySelector('[data-amount]');
          if (host) {
            const cta = node.querySelector('[data-pay]');
            const pad = amountPad({
              currency: 'BRL',
              initial: manual,
              onChange: (c) => {
                manual = c;
                if (!cta) return;
                cta.classList.toggle('off', c <= 0);
                cta.textContent = c > 0 ? `Pagar ${fmt(c)}` : 'Pagar boleto';
              },
            });
            host.append(pad.display, pad.pad);
          }
        }
        node.querySelector('[data-paste]')?.addEventListener('click', async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (!text) return toast('Área de transferência vazia.');
            linha = text.replace(/\D/g, '').slice(0, 48);
            parsed = readLinhaDigitavel(linha);
            manual = 0;
            Router.refreshTop();
          } catch {
            toast('Segure o dedo no campo para colar.');
          }
        });
        node.querySelector('[data-demo]')?.addEventListener('click', () => {
          linha = demoBoleto();
          parsed = readLinhaDigitavel(linha);
          manual = 0;
          Router.refreshTop();
        });
        node.querySelector('[data-pay]')?.addEventListener('click', async () => {
          const amount = parsed.needsManualAmount ? manual : parsed.valorCents;
          if (!amount) return toast('Informe o valor do boleto.');
          if (parsed.dvGeralOk === false) {
            const go = await confirm({
              title: 'Dígito divergente',
              message: 'O dígito verificador do código de barras não confere. Pagar assim pode significar erro de digitação.',
              confirmLabel: 'Pagar mesmo assim',
            });
            if (!go) return;
          }
          if (parsed.overdue) {
            await alert({ title: 'Boleto vencido', message: errorText({ code: 'overdue' }) });
            return;
          }
          const auth = await authorize({ title: 'Senha para pagar', message: `Boleto de ${show(amount, 'BRL')}` });
          if (!auth.ok) return;
          const proc = processing('Enviando pagamento…');
          await new Promise((r) => setTimeout(r, 650));
          const res = store.payBoleto({ linha, amountCentsOverride: parsed.needsManualAmount ? manual : null });
          proc.close();
          if (!res.ok) {
            await alert({ title: 'Não foi possível pagar', message: errorText(res) });
            return;
          }
          resultScreen({
            ok: true,
            title: 'Pagamento confirmado',
            lines: [`${parsed.bankName} recebeu ${show(amount, 'BRL')}`, parsed.vencimento ? `Vencimento em ${new Date(parsed.vencimento).toLocaleDateString('pt-BR')}` : ''],
            primary: {
              label: 'Ver comprovante',
              onClick: () => {
                Router.popToRoot();
                Router.push('receipt', { id: res.tx.id });
              },
            },
            secondary: { label: 'Fechar', onClick: () => Router.popToRoot() },
          });
        });
      },
    };
  },

  recharge: () => {
    let operator = OPERATORS[0].id;
    let phone = S().profile.phone || '';
    let amount = 3000;
    let error = '';
    return {
      title: 'Recarga',
      live: false,
      content: () => {
        const credits = Math.round(amount * 0.82);
        return `
        <div class="scroll">
          <div class="large-title">Recarga de<br>celular</div>
          <div class="segmented" data-ops style="margin-bottom:12px">
            ${OPERATORS.map((o) => `<button class="${operator === o.id ? 'on' : ''}" data-op="${o.id}">${o.id}</button>`).join('')}
          </div>
          <div class="field">
            <label for="ph">Número que vai receber</label>
            <input id="ph" inputmode="tel" value="${esc(phone)}" placeholder="(11) 97777-1024">
          </div>
          ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          <div class="section-label">Quanto recarregar</div>
          <div class="chips">
            ${PLANS.map((p) => `<button class="chip ${amount === p ? 'on' : ''}" data-plan="${p}">${esc(fmt(p))}</button>`).join('')}
          </div>
          <div class="field" style="margin-top:4px">
            <label for="outro">Outro valor</label>
            <input id="outro" inputmode="numeric" placeholder="Ex.: 45,00" value="${amount && !PLANS.includes(amount) ? fmtNumberLocal(amount) : ''}">
          </div>
          <div class="card" style="margin-top:14px">
            <div class="money-row"><span class="k">Você paga</span><span class="v num">${esc(fmt(amount))}</span></div>
            <div class="money-row"><span class="k">Créditos para o linha</span><span class="v num">${esc(fmt(credits))}</span></div>
            <div class="money-row mut"><span class="k">Operadora</span><span class="v">${esc(operator)}</span></div>
            <div class="money-row mut"><span class="k">Sai de</span><span class="v">${esc(show(S().accounts.brl.cashCents, 'BRL'))} disponíveis</span></div>
          </div>
        </div>
        <div class="footer-bar"><button class="btn primary ${amount <= 0 ? 'off' : ''}" data-buy>Recarregar ${esc(fmt(amount))}</button></div>`;
      },
      mount: (node) => {
        node.querySelector('[data-ops]').addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-op]');
          if (!btn) return;
          operator = btn.dataset.op;
          Router.refreshTop();
        });
        node.querySelector('#ph').addEventListener('input', (ev) => {
          phone = ev.target.value;
        });
        node.querySelector('#outro').addEventListener('input', (ev) => {
          amount = parseAmount(ev.target.value);
          Router.refreshTop();
        });
        node.addEventListener('click', (ev) => {
          const plan = ev.target.closest('[data-plan]');
          if (plan) {
            amount = Number(plan.dataset.plan);
            Router.refreshTop();
          }
        });
        node.querySelector('[data-buy]').addEventListener('click', async () => {
          if (amount <= 0) return toast('Escolha um valor.');
          const res = await authorize({ title: 'Senha para recarregar', message: `${operator} ${phone}` });
          if (!res.ok) return;
          const proc = processing('Confirmando com a operadora…');
          await new Promise((r) => setTimeout(r, 700));
          const out = store.payRecharge({ operator, phone, amountCents: amount });
          proc.close();
          if (!out.ok) {
            error = errorText(out);
            Router.refreshTop();
            return;
          }
          resultScreen({
            ok: true,
            title: 'Recarga concluída',
            lines: [`${fmt(amount)} para ${phone}`, `Créditos: ${fmt(out.credits)}`],
            primary: {
              label: 'Ver comprovante',
              onClick: () => {
                Router.popToRoot();
                Router.push('receipt', { id: out.tx.id });
              },
            },
            secondary: { label: 'Fechar', onClick: () => Router.popToRoot() },
          });
        });
      },
    };
  },
};

function fmtNumberLocal(cents) {
  return (cents / 100).toFixed(2).replace('.', ',');
}
