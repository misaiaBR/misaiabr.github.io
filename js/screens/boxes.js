// Caixinhas: reserva com rendimento pós-fixado (% do CDI) e IR regressivo no resgate.
import { icon } from '../ui/icons.js';
import { alert, amountPad, confirm, el, esc, resultScreen, sheet, toast } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { YIELD } from '../logic/rules.js';
import { fmt, parseAmount } from '../logic/money.js';
import { businessDaysBetween, irRateForDays, totalInBoxes } from '../logic/boxes.js';
import { S, authorize, errorText, money, show, txRow } from '../ui/shared.js';

const ICONES = ['safe', 'bank', 'globe', 'target', 'home', 'calendar', 'shield', 'cash', 'star', 'doc'];
/** Caixinhas antigas guardavam emoji; cada uma vira o icone de linha equivalente. */
const EMOJI_PARA_ICONE = { '\u{1F437}': 'safe', '\u{1F3E6}': 'bank', '\u2708\uFE0F': 'globe', '\u{1F393}': 'target', '\u{1F3E0}': 'home',
  '\u{1F697}': 'gauge', '\u{1F48D}': 'star', '\u{1F6DF}': 'shield', '\u{1F4BB}': 'doc', '\u{1F381}': 'star' };
export function iconeDaCaixinha(box) {
  if (box?.icon && ICONES.includes(box.icon)) return box.icon;
  if (box?.emoji && EMOJI_PARA_ICONE[box.emoji]) return EMOJI_PARA_ICONE[box.emoji];
  return 'safe';
}

function monthYield(box) {
  const from = new Date();
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const days = businessDaysBetween(from, new Date());
  if (!days) return 0;
  const factor = Math.pow(1 + (YIELD.cdiAnnualPct / 10000) * ((box.percentCdi || 10000) / 10000), days / YIELD.businessDaysPerYear);
  return Math.floor(box.balanceCents * factor) - box.balanceCents;
}

export const screens = {
  boxes: () => ({
    title: 'Caixinhas',
    content: () => {
      const s = S();
      const total = totalInBoxes(s.boxes);
      const saved = s.boxes.reduce((acc, b) => acc + (b.yieldCents || 0), 0);
      return `
      <div class="scroll flush">
        <div class="balance-card" style="margin:0 16px 6px">
          <div class="label">Guardado nas caixinhas</div>
          <div class="value num">${money(total, 'BRL')}</div>
          <div class="meta">
            <span>rendimento acumulado ${money(saved, 'BRL')}</span>
            <span>${(YIELD.cdiAnnualPct / 100).toFixed(2).replace('.', ',')}% CDI a.a.</span>
          </div>
        </div>
        <div class="group" style="margin:12px 16px 0">
          ${s.boxes.map((b) => {
            const pct = b.goalCents ? Math.min(100, Math.round((b.balanceCents / b.goalCents) * 100)) : 0;
            return `
            <button class="pig" data-box="${b.id}">
              <span class="ico">${icon(iconeDaCaixinha(b))}</span>
              <span class="main">
                <span class="v num">${money(b.balanceCents, 'BRL')}</span>
                <span class="s">${esc(b.name)}${b.goalCents ? ` · ${pct}% da meta de ${esc(fmt(b.goalCents))}` : ` · ${esc((b.percentCdi / 100).toFixed(0))}% do CDI`}</span>
              </span>
              ${icon('chevron', 'go')}
            </button>`;
          }).join('') || `<div class="empty">${icon('safe')}<div>Sem caixinha ainda. Crie uma para guardar dinheiro com rendimento.</div></div>`}
        </div>
      </div>
      <div class="footer-bar"><button class="btn primary" data-new>${icon('plus')} Nova caixinha</button></div>`;
    },
    mount: (node) => {
      node.addEventListener('click', (ev) => {
        const box = ev.target.closest('[data-box]');
        if (box) {
          Router.push('boxDetail', { id: box.dataset.box });
          return;
        }
        if (ev.target.closest('[data-new]')) Router.push('boxCreate');
      });
    },
  }),

  boxDetail: (params) => {
    const box = S().boxes.find((b) => b.id === params.id);
    if (!box) {
      return { title: 'Caixinha', content: () => '<div class="empty">Caixinha não encontrada.</div>' };
    }
    return {
      title: box.name,
      content: () => {
        const s = S();
        const current = s.boxes.find((b) => b.id === params.id) || box;
        const pct = current.goalCents ? Math.min(100, Math.round((current.balanceCents / current.goalCents) * 100)) : 0;
        const age = Math.floor((Date.now() - new Date(current.createdAt)) / 86_400_000);
        const ir = irRateForDays(age);
        const history = s.tx.filter((t) => t.details?.boxId === current.id).slice(0, 12);
        return `
        <div class="scroll">
          <div class="receipt-hero">
            <div class="avatar-lg">${icon(iconeDaCaixinha(current))}</div>
            <div class="amount num">${money(current.balanceCents, 'BRL')}</div>
            <div class="who">${esc(current.name)} · ${(current.percentCdi / 100).toFixed(0)}% do CDI</div>
          </div>
          <div class="card">
            <div class="progress"><i style="width:${pct}%"></i></div>
            <div class="money-row" style="margin-top:8px"><span class="k">Meta</span><span class="v num">${current.goalCents ? esc(fmt(current.goalCents)) : 'sem meta'}</span></div>
            ${current.goalCents ? `<div class="money-row mut"><span class="k">Falta</span><span class="v num">${esc(fmt(Math.max(0, current.goalCents - current.balanceCents)))}</span></div>` : ''}
            <div class="money-row"><span class="k">Rendimento acumulado</span><span class="v num">${esc(fmt(current.yieldCents))}</span></div>
            <div class="money-row mut"><span class="k">Rendimento deste mês</span><span class="v num">${esc(fmt(monthYield(current)))}</span></div>
            <div class="money-row mut"><span class="k">IR se resgatar hoje</span><span class="v">${(ir / 100).toFixed(2).replace('.', ',')}% (${age} dias)</span></div>
          </div>
          <div class="btn-row">
            <button class="btn primary" data-deposit>${icon('plus')} Aportar</button>
            <button class="btn tonal" data-withdraw>${icon('arrowDown')} Resgatar</button>
          </div>
          <div class="section-label">Histórico</div>
          <div class="group" data-history></div>
          <div class="group" style="margin-top:12px">
            <button class="row" data-rename><span class="lead">${icon('doc')}</span><span class="main"><span class="t">Renomear caixinha</span></span></button>
            <button class="row danger" data-delete><span class="lead">${icon('trash')}</span><span class="main"><span class="t">Excluir caixinha</span><span class="s">só com saldo zerado</span></span></button>
          </div>
        </div>`;
      },
      mount: (node) => {
        const s = S();
        const current = s.boxes.find((b) => b.id === params.id) || box;
        const host = node.querySelector('[data-history]');
        const history = s.tx.filter((t) => t.details?.boxId === current.id).slice(0, 12);
        if (!history.length) host.innerHTML = '<div class="empty">Sem movimentos ainda.</div>';
        history.forEach((tx) => host.append(txRow(tx, () => Router.push('receipt', { id: tx.id }))));

        node.querySelector('[data-deposit]').addEventListener('click', () => {
          amountSheet({
            title: `Aportar em ${current.name}`,
            initial: 0,
            cta: 'Aportar',
            hint: `Disponível na conta: ${fmt(store.availableBRL(S()))}`,
            onConfirm: async (cents, close) => {
              const auth = await authorize({ title: 'Senha para aportar', message: fmt(cents) });
              if (!auth.ok) return;
              const res = store.depositBox({ boxId: current.id, amountCents: cents });
              close();
              if (!res.ok) {
                await alert({ title: 'Não foi possível aportar', message: errorText(res) });
                return;
              }
              toast('Aporte aplicado');
              Router.refreshTop();
            },
          });
        });

        node.querySelector('[data-withdraw]').addEventListener('click', () => {
          amountSheet({
            title: `Resgatar de ${current.name}`,
            initial: 0,
            max: current.balanceCents,
            cta: 'Resgatar',
            hint: 'O IR incide só sobre a parte de rendimento, retido na fonte.',
            onConfirm: async (cents, close) => {
              const auth = await authorize({ title: 'Senha para resgatar', message: fmt(cents) });
              if (!auth.ok) return;
              const res = store.withdrawBox({ boxId: current.id, amountCents: cents });
              close();
              if (!res.ok) {
                await alert({ title: 'Não foi possível resgatar', message: errorText(res) });
                return;
              }
              resultScreen({
                ok: true,
                title: 'Resgate concluído',
                lines: [
                  `${fmt(res.plan.netCents)} caíram na conta em reais`,
                  `IR retido: ${fmt(res.plan.irCents)} (${(res.plan.irRate / 100).toFixed(2).replace('.', ',')}% do rendimento)`,
                ],
                primary: {
                  label: 'Ver comprovante',
                  onClick: () => {
                    Router.popToRoot();
                    Router.push('receipt', { id: res.tx.id });
                  },
                },
                secondary: { label: 'Voltar', onClick: () => Router.refreshTop() },
              });
            },
          });
        });

        node.querySelector('[data-rename]').addEventListener('click', () => {
          const body = el(`<div class="sheet-pad"><div class="field"><label for="nm">Nome da caixinha</label><input id="nm" maxlength="28" value="${esc(current.name)}"></div><button class="btn primary" id="ok" style="margin-top:12px">Salvar</button></div>`);
          const handle = sheet({ title: 'Renomear', body });
          requestAnimationFrame(() => {
            document.getElementById('ok').addEventListener('click', () => {
              const res = store.renameBox({ boxId: current.id, name: document.getElementById('nm').value });
              handle.close();
              if (!res.ok) toast(errorText(res));
              else Router.refreshTop();
            });
          });
        });

        node.querySelector('[data-delete]').addEventListener('click', async () => {
          const go = await confirm({
            title: 'Excluir caixinha?',
            message: current.balanceCents ? 'Zere o saldo resgatando antes de excluir.' : 'O histórico fica no extrato.',
            confirmLabel: 'Excluir',
            destructive: true,
          });
          if (!go) return;
          const res = store.deleteBox(current.id);
          if (!res.ok) {
            await alert({ title: 'Dá para excluir não', message: errorText(res) });
            return;
          }
          toast('Caixinha excluída');
          Router.pop({ force: true });
        });
      },
    };
  },

  boxCreate: () => {
    let name = '';
    let icone = ICONES[0];
    let goal = 0;
    let percent = 10000;
    let error = '';
    return {
      title: 'Nova caixinha',
      live: false,
      content: () => `
        <div class="scroll">
          <div class="large-title">Para que<br>você está<br>guardando?</div>
          <div class="field">
            <label for="nm">Nome da caixinha</label>
            <input id="nm" maxlength="28" placeholder="Ex.: troca de notebook" value="${esc(name)}">
          </div>
          ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          <div class="section-label">Ícone</div>
          <div class="chips">
            ${ICONES.map((e) => `<button class="chip ${icone === e ? 'on' : ''}" data-icone="${e}" aria-label="${e}">${icon(e)}</button>`).join('')}
          </div>
          <div class="field" style="margin-top:8px">
            <label for="goal">Meta (opcional)</label>
            <input id="goal" inputmode="decimal" placeholder="Ex.: 4.000,00">
          </div>
          <div class="section-label">Rendimento</div>
          <div class="segmented">
            ${[[9000, '90% CDI'], [10000, '100% CDI'], [10500, '105% CDI']].map(([v, label]) => `<button class="${percent === v ? 'on' : ''}" data-pct="${v}">${label}</button>`).join('')}
          </div>
          <div class="card" style="margin-top:12px">
            <div class="money-row mut"><span class="k">CDI hoje</span><span class="v num">${(YIELD.cdiAnnualPct / 100).toFixed(2).replace('.', ',')}% a.a.</span></div>
            <div class="money-row mut"><span class="k">Selic</span><span class="v num">${(YIELD.selicAnnualPct / 100).toFixed(2).replace('.', ',')}% a.a.</span></div>
            <div class="money-row mut"><span class="k">Base de cálculo</span><span class="v">${YIELD.businessDaysPerYear} dias úteis</span></div>
          </div>
        </div>
        <div class="footer-bar"><button class="btn primary" data-create>Criar caixinha</button></div>`,
      mount: (node) => {
        node.querySelector('#nm').addEventListener('input', (ev) => {
          name = ev.target.value;
        });
        node.querySelector('#goal').addEventListener('input', (ev) => {
          goal = parseAmount(ev.target.value);
        });
        node.addEventListener('click', (ev) => {
          const em = ev.target.closest('[data-icone]');
          if (em) {
            icone = em.dataset.icone;
            Router.refreshTop();
            return;
          }
          const pct = ev.target.closest('[data-pct]');
          if (pct) {
            percent = Number(pct.dataset.pct);
            Router.refreshTop();
            return;
          }
          if (ev.target.closest('[data-create]')) {
            const res = store.createBox({ name, icon: icone, goalCents: goal, percentCdi: percent });
            if (!res.ok) {
              error = errorText(res);
              Router.refreshTop();
              return;
            }
            toast('Caixinha criada');
            Router.replace('boxDetail', { id: res.box.id });
          }
        });
      },
    };
  },
};

/** Folha com teclado de valor, usada em aporte e resgate. */
function amountSheet({ title, initial, cta, hint, onConfirm, max }) {
  let cents = initial || 0;
  const body = el(`<div class="sheet-pad">
    <div id="pad" style="text-align:center"></div>
    ${hint ? `<p class="note" style="margin:6px 0 12px">${esc(hint)}</p>` : ''}
    <button class="btn primary" id="go">${esc(cta)}</button>
  </div>`);
  const handle = sheet({ title, body });
  requestAnimationFrame(() => {
    const host = document.getElementById('pad');
    if (!host) return;
    const pad = amountPad({
      currency: 'BRL',
      initial: cents,
      max: max || 1_000_000_00,
      onChange: (c) => {
        cents = c;
      },
    });
    host.append(pad.display, pad.pad);
    document.getElementById('go').addEventListener('click', () => {
      if (cents <= 0) {
        toast('Digite um valor.');
        return;
      }
      onConfirm(cents, () => handle.close());
    });
  });
  return handle;
}
