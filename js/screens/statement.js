// Extrato com busca/filtros e comprovante com ações por tipo de lançamento.
import { icon } from '../ui/icons.js';
import { alert, copyText, dayHeading, el, esc, shareText, sheet, toast } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { BANK, CATS, FX, txMeta } from '../logic/rules.js';
import { fmt } from '../logic/money.js';
import { S, cur, errorText, money, otherHint, show, txRow } from '../ui/shared.js';
import { buildStatementPdf } from '../ui/statement-pdf.js';

const filter = { cat: 'all', text: '', month: null };

function matches(tx) {
  const meta = txMeta(tx.type);
  if (filter.cat === 'entrada' && store.signedAmount(tx) <= 0) return false;
  if (filter.cat === 'saida' && store.signedAmount(tx) >= 0) return false;
  if (['pix', 'pagamento', 'cartao', 'cambio', 'invest'].includes(filter.cat) && meta.cat !== filter.cat) return false;
  if (filter.text) {
    const haystack = `${tx.title} ${tx.subtitle} ${tx.details?.holder || ''} ${tx.details?.key || ''}`.toLowerCase();
    if (!haystack.includes(filter.text.toLowerCase())) return false;
  }
  if (filter.month) {
    const d = new Date(tx.at);
    if (`${d.getFullYear()}-${d.getMonth()}` !== filter.month) return false;
  }
  return true;
}

function monthOptions() {
  const seen = new Map();
  S().tx.forEach((t) => {
    const d = new Date(t.at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) seen.set(key, d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
  });
  return Array.from(seen.entries()).sort((a, b) => Number(b[0].split('-')[1]) - Number(a[0].split('-')[1]));
}

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readDateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function statementData(currency, from, to) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const state = S();
  const movements = state.tx
    .filter((tx) => tx.status === 'done' && (tx.currency || 'BRL') === currency && store.signedAmount(tx) !== 0)
    .map((tx) => ({ tx, at: new Date(tx.at).getTime(), signedCents: store.signedAmount(tx) }))
    .filter((item) => Number.isFinite(item.at))
    .sort((a, b) => a.at - b.at);
  const later = movements.filter((item) => item.at >= endMs).reduce((sum, item) => sum + item.signedCents, 0);
  const rows = movements.filter((item) => item.at >= startMs && item.at < endMs);
  const periodNet = rows.reduce((sum, item) => sum + item.signedCents, 0);
  const closing = Number(state.accounts[currency === 'EUR' ? 'eur' : 'brl'].cashCents) - later;
  let balance = closing - periodNet;
  let credits = 0;
  let debits = 0;
  const entries = rows.map(({ tx, signedCents }) => {
    balance += signedCents;
    if (signedCents > 0) credits += signedCents;
    else debits += Math.abs(signedCents);
    return {
      at: tx.at,
      valueDate: tx.details?.valueDate || tx.at,
      title: tx.title || txMeta(tx.type).label,
      subtitle: tx.subtitle || '',
      signedCents,
      balanceCents: balance,
    };
  });
  return { rows: entries, opening: closing - periodNet, credits, debits, closing };
}

function openStatementExport() {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const todayValue = dateInputValue(today);
  const body = el(`
    <div style="padding:0 16px 8px">
      <div class="form">
        <div class="field">
          <label for="statement-currency">Conta</label>
          <select id="statement-currency">
            <option value="BRL">Conta em reais (BRL)</option>
            <option value="EUR">Conta em euros (EUR)</option>
          </select>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label for="statement-from">Data inicial</label><input id="statement-from" type="date" value="${dateInputValue(startOfMonth)}" max="${todayValue}"></div>
          <div class="field"><label for="statement-to">Data final</label><input id="statement-to" type="date" value="${todayValue}" max="${todayValue}"></div>
        </div>
        <div class="field-hint">O PDF usa as movimentações salvas neste aparelho. Documento demonstrativo, não emitido por uma instituição financeira.</div>
        <button class="btn primary" type="button" data-create-statement>${icon('download')} Gerar extrato PDF</button>
      </div>
    </div>`);
  body.querySelector('#statement-currency').value = cur();
  const handle = sheet({ title: 'Exportar extrato', body });
  body.querySelector('[data-create-statement]').addEventListener('click', async () => {
    const currency = body.querySelector('#statement-currency').value;
    const from = readDateInput(body.querySelector('#statement-from').value);
    const to = readDateInput(body.querySelector('#statement-to').value);
    if (!from || !to || from > to || to > new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      toast('Confira o período selecionado.');
      return;
    }

    const totals = statementData(currency, from, to);
    const account = currency === 'EUR'
      ? `IBAN ${S().accounts.eur.iban || BANK.eurIbanDisplay}`
      : BANK.accountDisplay;
    const pdf = buildStatementPdf({
      ...totals,
      currency,
      from,
      to,
      holder: S().profile.name,
      account,
      bank: BANK.short,
    });
    const blob = new Blob([pdf], { type: 'application/pdf' });
    const file = new File([blob], `ipe-extrato-${currency.toLowerCase()}-${dateInputValue(from)}-${dateInputValue(to)}.pdf`, { type: 'application/pdf' });
    let sharePromise = null;
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        sharePromise = navigator.share({ files: [file], title: 'Extrato da conta' });
      }
    } catch {
      sharePromise = null;
    }
    handle.close();
    if (sharePromise) {
      try {
        await sharePromise;
      } catch (error) {
        if (error.name !== 'AbortError') openPdfPreview(blob, file.name);
      }
      return;
    }
    openPdfPreview(blob, file.name);
  });
}

function openPdfPreview(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  toast('PDF pronto. No visualizador, use Compartilhar para salvar em Arquivos.', 5000);
}

export const screens = {
  statement: () => ({
    large: 'Extrato',
    back: false,
    rootNoBack: true,
    content: () => {
      const s = S();
      const months = monthOptions();
      const list = s.tx.filter(matches);
      const groups = new Map();
      list.forEach((tx) => {
        const key = new Date(tx.at).toDateString();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tx);
      });
      return `
      <div class="scroll flush">
        <div style="padding:0 16px 12px">
          <button class="btn tonal" data-statement-pdf>${icon('download')} Baixar extrato em PDF</button>
        </div>
        <div style="padding:0 16px">
          <div class="field" style="margin-bottom:10px">
            <label for="q">${icon('search')} Buscar no extrato</label>
            <input id="q" type="search" placeholder="Nome, chave ou valor" value="${esc(filter.text)}">
          </div>
          <div class="chips">
            ${CATS.map((c) => `<button class="chip ${filter.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.label}</button>`).join('')}
          </div>
          <div class="chips">
            <button class="chip ${!filter.month ? 'on' : ''}" data-month="">Todos os meses</button>
            ${months.slice(0, 4).map(([key, label]) => `<button class="chip ${filter.month === key ? 'on' : ''}" data-month="${key}">${label}</button>`).join('')}
          </div>
        </div>
        ${groups.size === 0 ? `<div class="empty">${icon('search')}<div>Nenhum lançamento com esse filtro.</div></div>` : ''}
        <div data-groups></div>
        <div class="note center">${s.tx.length} lançamentos</div>
      </div>`;
    },
    mount: (node) => {
      node.querySelector('[data-statement-pdf]')?.addEventListener('click', openStatementExport);
      const host = node.querySelector('[data-groups]');
      const list = S().tx.filter(matches);
      const groups = new Map();
      list.forEach((tx) => {
        const key = new Date(tx.at).toDateString();
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(tx);
      });
      groups.forEach((items, key) => {
        const entrada = items.filter((t) => store.signedAmount(t) > 0).reduce((a, t) => a + t.amountCents, 0);
        const saida = items.filter((t) => store.signedAmount(t) < 0).reduce((a, t) => a + Math.abs(t.amountCents), 0);
        host.append(el(`
          <div class="day-head">${dayHeading(key)}<span class="end num">${saida ? `- ${show(saida, 'BRL').replace(/^[+-]/, '')}` : ''}${entrada ? ` + ${show(entrada, 'BRL').replace(/^[+-]/, '')}` : ''}</span></div>`));
        const group = el('<div class="group" style="margin:0 16px 12px"></div>');
        items.forEach((tx) => group.append(txRow(tx, () => Router.push('receipt', { id: tx.id }))));
        host.append(group);
      });

      node.querySelector('#q')?.addEventListener('input', (ev) => {
        filter.text = ev.target.value;
        Router.refreshTop();
        const input = node.querySelector('#q');
        if (input) {
          input.focus();
          input.setSelectionRange(filter.text.length, filter.text.length);
        }
      });
      node.addEventListener('click', (ev) => {
        const cat = ev.target.closest('[data-cat]');
        if (cat) {
          filter.cat = cat.dataset.cat;
          Router.refreshTop();
          return;
        }
        const month = ev.target.closest('[data-month]');
        if (month) {
          filter.month = month.dataset.month || null;
          Router.refreshTop();
        }
      });
    },
  }),

  receipt: (params) => {
    const tx = S().tx.find((t) => t.id === params.id);
    if (!tx) {
      return { title: 'Comprovante', content: () => '<div class="empty">Lançamento não encontrado.</div>' };
    }
    const meta = txMeta(tx.type);
    const display = cur();
    const d = tx.details || {};
    const rows = [];
    const add = (label, value, hint = '') => rows.push({ label, value, hint });

    add('Data', new Date(tx.at).toLocaleString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    add('Situação', tx.status === 'scheduled' ? 'Agendado' : tx.status === 'failed' ? 'Não enviado' : 'Concluído');
    if (d.holder || d.key) add(tx.type === 'pix_in' || tx.type === 'charge_paid' ? 'De' : 'Para', d.holder || tx.subtitle, d.key ? `Chave ${d.key}` : d.bank || '');
    if (d.key) add('Chave Pix', d.key);
    if (d.bank) add('Banco do destinatário', d.bank);
    if (d.e2e) add('ID da transação (E2E)', d.e2e);
    if (d.txid && d.txid !== '***') add('Identificador da cobrança', d.txid);
    if (d.message) add('Mensagem enviada', d.message);
    if (d.barcode) {
      add('Boleto', `${d.banco ? `Banco ${d.banco}` : 'Concessionária'}`, d.vencimento ? `Vencimento ${new Date(d.vencimento).toLocaleDateString('pt-BR')}` : 'sem vencimento informado');
    }
    if (d.operator) add('Operadora', d.operator, d.creditsCents ? `Créditos ${fmt(d.creditsCents)}` : '');
    if (d.eurCents != null && d.rate != null) {
      add('Cotação aplicada', `${fmt(d.rate, 'BRL')} por € 1,00`);
      add('IOF (3,50%)', fmt(d.iofCents || 0));
      add('Valor efetivo (VET)', d.vetRate ? `${fmt(d.vetRate, 'BRL')} por € 1,00` : '—');
      if (d.contract) add('Contrato de câmbio', d.contract);
    }
    if (d.iban) add('IBAN de destino', d.iban);
    if (d.irCents) add('IR retido na fonte', fmt(d.irCents), d.irRate ? `${(d.irRate / 100).toFixed(2).replace('.', ',')}% sobre o rendimento` : '');
    if (d.principalCents != null) add('Principal', fmt(d.principalCents));
    if (d.international) add('Compra internacional', 'Sim', `IOF ${FX.iofCard / 100}% incluso no valor em reais`);
    if (d.boxId) {
      const box = S().boxes.find((b) => b.id === d.boxId);
      if (box) add('Caixinha', box.name);
    }
    if (d.scheduled) add('Envio automático', 'Agendado pelo app');

    const shareable = [
      `${BANK.name} — comprovante`,
      `${meta.label}`,
      `Valor: ${fmt(tx.amountCents, tx.currency || 'BRL')}`,
      ...(display !== (tx.currency || 'BRL') ? [`Na sua moeda: ${show(tx.amountCents, tx.currency || 'BRL')}`] : []),
      `Data: ${new Date(tx.at).toLocaleString('pt-BR')}`,
      d.holder ? `Contraparte: ${d.holder}` : '',
      d.e2e ? `ID E2E: ${d.e2e}` : '',
      d.contract ? `Contrato: ${d.contract}` : '',
    ].filter(Boolean).join('\n');

    const secondaryActions = [];
    if (tx.status === 'scheduled') {
      secondaryActions.push({
        label: 'Cancelar agendamento',
        icon: 'x',
        run: async () => {
          const res = store.cancelScheduled(tx.id);
          if (!res.ok) await alert({ title: 'Não foi possível', message: errorText(res) });
          else toast('Agendamento cancelado');
          Router.refreshTop();
        },
      });
    }
    if (['pix_in', 'charge_paid'].includes(tx.type)) {
      secondaryActions.push({
        label: 'Devolver este Pix',
        icon: 'refresh',
        run: async () => {
          const go = await alert({
            title: 'Devolver o Pix?',
            message: 'O valor volta para quem enviou. O Bacen permite a devolução em até 28 dias.',
            columns: true,
            actions: [{ label: 'Cancelar', value: false }, { label: 'Devolver', value: true, bold: true }],
          });
          if (!go) return;
          const auth = await import('../ui/shared.js').then((m) => m.authorize({ title: 'Senha para devolver', message: 'Autorize a devolução' }));
          if (!auth.ok) return;
          const res = store.refundPix(tx.id);
          if (!res.ok) await alert({ title: 'Não foi possível devolver', message: errorText(res) });
          else {
            Router.replace('receipt', { id: res.tx.id });
            toast('Pix devolvido');
          }
        },
      });
    }
    if (['pix_out', 'manual_out'].includes(tx.type) && d.key) {
      secondaryActions.push({
        label: 'Enviar de novo',
        icon: 'send',
        run: () => Router.push('pixSend', { key: d.key, amount: tx.amountCents }),
      });
    }
    if (tx.type === 'boleto_out' && d.barcode) {
      secondaryActions.push({
        label: 'Pagar este boleto de novo',
        icon: 'barcode',
        run: () => Router.push('payBoleto', { linha: d.barcode }),
      });
    }

    return {
      title: 'Comprovante',
      content: () => `
        <div class="scroll">
          <div class="receipt-hero">
            <div class="avatar-lg ${store.signedAmount(tx) > 0 ? 'in' : ''}">${icon(meta.icon)}</div>
            <div class="amount num">${show(tx.amountCents, tx.currency || 'BRL')}</div>
            <div class="who">${esc(meta.label)}${otherHint(tx.amountCents, tx.currency || 'BRL') ? ` · ${esc(otherHint(tx.amountCents, tx.currency || 'BRL'))}` : ''}</div>
          </div>
          <div class="group" data-rows></div>
          <div class="btn-row" data-actions></div>
        </div>`,
      mount: (node) => {
        const rowsHost = node.querySelector('[data-rows]');
        rows.forEach((r) => {
          rowsHost.append(el(`
            <div class="row bare">
              <span class="main"><span class="t" style="font-size:15px">${esc(r.label)}</span>${r.hint ? `<span class="s">${esc(r.hint)}</span>` : ''}</span>
              <span class="trailing" style="font-size:15px"><span class="selectable num">${esc(r.value)}</span></span>
            </div>`));
        });
        const actions = node.querySelector('[data-actions]');
        const share = document.createElement('button');
        share.className = 'btn primary';
        share.innerHTML = `${icon('share')} Compartilhar`;
        share.addEventListener('click', async () => {
          const outcome = await shareText({ title: 'Comprovante Ipê', text: shareable });
          if (outcome === 'copied') toast('Comprovante copiado');
          else if (outcome === 'unavailable') toast('Este navegador não conseguiu compartilhar agora');
        });
        actions.append(share);
        const copy = document.createElement('button');
        copy.className = 'btn tonal';
        copy.innerHTML = `${icon('copy')} Copiar`;
        copy.addEventListener('click', async () => {
          toast((await copyText(shareable)) ? 'Comprovante copiado' : 'Não foi possível copiar');
        });
        actions.append(copy);

        const listHost = document.createElement('div');
        listHost.style.cssText = 'width:100%;margin-top:14px';
        secondaryActions.forEach((action) => {
          const btn = document.createElement('button');
          btn.className = 'row';
          btn.innerHTML = `<span class="lead">${icon(action.icon)}</span><span class="main"><span class="t" style="color:var(--brand)">${esc(action.label)}</span></span>${icon('chevron', 'go')}`;
          btn.addEventListener('click', () => action.run());
          listHost.append(btn);
        });
        if (secondaryActions.length) {
          const wrap = document.createElement('div');
          wrap.className = 'group';
          wrap.append(listHost);
          actions.after(wrap);
        }
      },
    };
  },
};
