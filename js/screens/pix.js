// Área Pix: hub, enviar, copia-e-cola, ler QR, cobrar, chaves, limites, agendados e favoritos.
import { icon } from '../ui/icons.js';
import { alert, amountPad, confirm, copyText, el, esc, processing, resultScreen, sheet, toast } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { BANK, PIX, isNightHour } from '../logic/rules.js';
import { fmt } from '../logic/money.js';
import { buildBRCode, detectKey, formatKey, keyLabel, makeEvpKey, makeTxid, parseBRCode } from '../logic/pix.js';
import { activeLimit, operationWindow, usedInWindow } from '../logic/limits.js';
import { cameraSupported, decodeFrom, decodeFromFile, ensureDecoder, renderQR, startCamera } from '../ui/qr.js';
import { S, authorize, cur, errorText, show, showFail } from '../ui/shared.js';

const draft = { step: 'key', key: '', keyInfo: null, holder: '', bank: '', amount: 0, message: '', when: '', parsed: null };

function resetDraft() {
  draft.step = 'key';
  draft.key = '';
  draft.keyInfo = null;
  draft.holder = '';
  draft.bank = '';
  draft.amount = 0;
  draft.message = '';
  draft.when = '';
  draft.parsed = null;
}

async function finalize({ actionLabel, action, successTitle, lines }) {
  const auth = await authorize({ title: 'Digite sua senha', message: `Autorize o ${actionLabel.toLowerCase()}` });
  if (!auth.ok) return false;
  const proc = processing(`Enviando ${actionLabel.toLowerCase()}…`);
  await new Promise((r) => setTimeout(r, 650));
  const res = action();
  proc.close();
  if (!res.ok) {
    await showFail(res);
    return false;
  }
  resultScreen({
    ok: true,
    title: successTitle,
    lines,
    primary: {
      label: 'Ver comprovante',
      onClick: () => {
        Router.popToRoot();
        Router.push('receipt', { id: res.tx.id });
      },
    },
    secondary: {
      label: 'Voltar ao início',
      onClick: () => {
        resetDraft();
        Router.popToRoot();
        Router.switchTab('home');
      },
    },
  });
  return true;
}

function nightHint() {
  return isNightHour()
    ? `<div class="fx-banner">${icon('clock')}<span>Período noturno (20h–6h): vale o limite reduzido do Pix.</span></div>`
    : '';
}

function line(label, value) {
  return `<div class="row bare"><span class="main"><span class="t" style="font-size:15px">${esc(label)}</span></span><span class="trailing" style="font-size:15px">${esc(value)}</span></div>`;
}

function other(cents) {
  const display = cur();
  const rate = S().settings.fx.rate || 56440;
  return display === 'BRL'
    ? `≈ ${fmt(Math.round((cents * 10000) / rate), 'EUR')}`
    : `≈ ${fmt(cents, 'BRL')}`;
}

const MENU = [
  ['pixSend', 'qr', 'Pagar / transferir', 'Por chave Pix ou QR Code'],
  ['pixCopyPaste', 'copy', 'Pix copia e cola', 'Colar o código de cobrança'],
  ['pixScan', 'camera', 'Ler QR Code', 'Pela câmera do iPhone'],
  ['pixCharge', 'download', 'Cobrar', 'Gerar QR para receber'],
  ['pixManual', 'bank', 'Transferir por agência', 'Conta de outro banco'],
];

const MENU_ACCOUNT = [
  ['pixKeys', 'key', 'Minhas chaves', (s) => `${s.pix.keys.length} de ${PIX.maxKeysPerPerson} chaves`],
  ['pixLimits', 'gauge', 'Meus limites', () => {
    const win = operationWindow();
    const left = Math.max(0, activeLimit(S(), new Date()) - usedInWindow(S(), win));
    return `Resta ${show(left, 'BRL')} nesta janela`;
  }],
  ['pixScheduled', 'clock', 'Pix agendados', (s) => `${s.tx.filter((t) => t.status === 'scheduled').length} na fila`],
  ['pixFavorites', 'star', 'Favoritos', (s) => `${s.pix.favorites.length} contatos`],
  ['pixCharges', 'list', 'Minhas cobranças', (s) => `${s.charges.filter((c) => c.status === 'open').length} abertas`],
];

export const screens = {
  pix: () => ({
    large: 'Pix',
    back: false,
    rootNoBack: true,
    content: () => {
      const s = S();
      return `
      <div class="scroll">
        ${nightHint()}
        <div class="group">
          ${MENU.map(([route, ico, title, sub]) => `
            <button class="row" data-open="${route}">
              <span class="lead">${icon(ico)}</span>
              <span class="main"><span class="t">${title}</span><span class="s">${sub}</span></span>
              ${icon('chevron', 'go')}
            </button>`).join('')}
        </div>

        <div class="section-label">Sua conta</div>
        <div class="group">
          ${MENU_ACCOUNT.map(([route, ico, title, sub]) => `
            <button class="row" data-open="${route}">
              <span class="lead">${icon(ico)}</span>
              <span class="main"><span class="t">${title}</span><span class="s">${esc(sub(s))}</span></span>
              ${icon('chevron', 'go')}
            </button>`).join('')}
        </div>
      </div>`;
    },
    mount: (node) => {
      node.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-open]');
        if (!btn) return;
        if (btn.dataset.open === 'pixSend') resetDraft();
        Router.push(btn.dataset.open);
      });
    },
  }),

  pixSend: (params) => {
    if (params.key && draft.step === 'key') {
      draft.key = params.key;
      draft.keyInfo = detectKey(params.key);
      draft.amount = params.amount || 0;
    }
    return {
      title: 'Pix',
      live: false,
      onBack: () => {
        if (draft.step !== 'key') {
          draft.step = 'key';
          Router.refreshTop();
          return false;
        }
        return true;
      },
      content: () => {
        const s = S();
        if (draft.step === 'key') {
          return `
          <div class="scroll">
            <div class="large-title">Para quem<br>você quer enviar?</div>
            <div class="field">
              <label for="k">Chave Pix do destinatário</label>
              <input id="k" type="text" autocapitalize="none" spellcheck="false"
                placeholder="CPF, CNPJ, telefone, e-mail ou aleatória" value="${esc(draft.key)}">
            </div>
            <div data-info></div>
            <div class="section-label">Favoritos</div>
            <div class="group">
              ${s.pix.favorites.map((f) => `
                <button class="row" data-fav="${esc(f.key)}">
                  <span class="lead wide">${esc(f.holder.slice(0, 1).toUpperCase())}</span>
                  <span class="main"><span class="t">${esc(f.holder)}</span><span class="s">${esc(formatKey(detectKey(f.key).type, f.key))} · ${esc(f.bank)}</span></span>
                </button>`).join('') || '<div class="empty">Sem favoritos ainda.</div>'}
            </div>
          </div>
          <div class="footer-bar"><button class="btn primary off" data-next>Continuar</button></div>`;
        }
        if (draft.step === 'amount') {
          return `
          <div class="scroll">
            <div class="who-card">
              <div class="avatar-lg in">${esc((draft.holder || '?').slice(0, 1))}</div>
              <div><b>${esc(draft.holder)}</b><div class="s">${esc(draft.bank || 'Banco do destinatário')}</div></div>
            </div>
            <div class="chips" style="padding-left:16px">
              <button class="chip" data-quick="1000">R$ 10</button>
              <button class="chip" data-quick="5000">R$ 50</button>
              <button class="chip" data-quick="10000">R$ 100</button>
              <button class="chip" data-all>Saldo disponível</button>
            </div>
            <div class="field" style="margin:6px 16px">
              <label for="msg">Mensagem (quem recebe vê isso)</label>
              <input id="msg" maxlength="34" type="text" placeholder="Ex.: aluguel de outubro" value="${esc(draft.message)}">
            </div>
            <button class="row" data-schedule style="background:var(--card);margin:10px 16px;border-radius:12px">
              <span class="lead">${icon('calendar')}</span>
              <span class="main"><span class="t">Agendar para outro dia</span><span class="s">${draft.when ? new Date(draft.when).toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'enviar agora'}</span></span>
              ${icon('chevron', 'go')}
            </button>
            ${nightHint()}
          </div>
          <div data-amount class="pad-dock"></div>
          <div class="footer-bar"><button class="btn primary ${draft.amount <= 0 ? 'off' : ''}" data-review>Revisar Pix</button></div>`;
        }
        const whenText = draft.when
          ? new Date(draft.when).toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
          : 'agora';
        return `
        <div class="scroll">
          <div class="review">
            <div class="amount num">${show(draft.amount, 'BRL')}</div>
            <div class="hint">${other(draft.amount)}</div>
          </div>
          <div class="group">
            ${line('Quem recebe', draft.holder)}
            ${line('Chave', formatKey(draft.keyInfo?.type, draft.key))}
            ${line('Banco', draft.bank || 'Outro banco')}
            ${line('Quando', whenText)}
            ${draft.message ? line('Mensagem', draft.message) : ''}
            ${line('Sai de', `${BANK.accountDisplay}`)}
          </div>
          ${nightHint()}
        </div>
        <div class="footer-bar"><button class="btn primary" data-send>Confirmar e enviar</button></div>`;
      },
      mount: (node) => {
        if (draft.step === 'key') {
          const input = node.querySelector('#k');
          const info = node.querySelector('[data-info]');
          const next = node.querySelector('[data-next]');
          const paint = () => {
            const res = detectKey(draft.key);
            draft.keyInfo = res.valid ? res : null;
            if (!draft.key) {
              info.innerHTML = '';
              next.classList.add('off');
              return;
            }
            if (!res.valid) {
              info.innerHTML = `<div class="field-hint error">${esc(res.error || 'Chave inválida')}</div>`;
              next.classList.add('off');
              return;
            }
            const found = store.resolveKey(S(), res);
            if (found.found && !found.own) {
              draft.holder = found.holder;
              draft.bank = found.bank;
              info.innerHTML = `
                <div class="group" style="margin-top:10px">
                  <div class="row">
                    <span class="lead wide">${esc(found.holder.slice(0, 1).toUpperCase())}</span>
                    <span class="main"><span class="t">${esc(found.holder)}</span><span class="s">${esc(keyLabel(res.type))} · ${esc(found.bank)}</span></span>
                  </div>
                </div>`;
              next.classList.remove('off');
            } else if (found.own) {
              info.innerHTML = `<div class="field-hint error">${esc(errorText({ code: 'self' }))}</div>`;
              next.classList.add('off');
            } else {
              info.innerHTML = `<div class="field-hint error">Chave ${esc(keyLabel(res.type).toLowerCase())} não está cadastrada no sistema Pix.</div>`;
              next.classList.add('off');
            }
          };
          input?.addEventListener('input', (ev) => {
            draft.key = ev.target.value;
            paint();
          });
          paint();
          node.addEventListener('click', (ev) => {
            const fav = ev.target.closest('[data-fav]');
            if (fav) {
              draft.key = fav.dataset.fav;
              Router.refreshTop();
              return;
            }
            if (ev.target.closest('[data-next]')) {
              const res = detectKey(draft.key);
              if (!res.valid) {
                toast(res.error || 'Chave inválida');
                return;
              }
              const found = store.resolveKey(S(), res);
              if (!found.found || found.own) {
                toast(errorText({ code: found.own ? 'self' : 'unknownKey' }));
                return;
              }
              draft.keyInfo = res;
              draft.holder = found.holder;
              draft.bank = found.bank;
              draft.step = 'amount';
              Router.refreshTop();
            }
          });
          return;
        }

        if (draft.step === 'amount') {
          const host = node.querySelector('[data-amount]');
          const reviewBtn = node.querySelector('[data-review]');
          const pad = amountPad({
            currency: 'BRL',
            initial: draft.amount,
            onChange: (cents) => {
              draft.amount = cents;
              reviewBtn?.classList.toggle('off', cents <= 0);
            },
          });
          host.append(pad.display, pad.pad);
          node.addEventListener('click', (ev) => {
            const quick = ev.target.closest('[data-quick]');
            if (quick) {
              pad.set(Number(quick.dataset.quick));
              return;
            }
            if (ev.target.closest('[data-all]')) {
              pad.set(Math.max(0, store.availableBRL(S())));
              return;
            }
            if (ev.target.closest('[data-review]')) {
              if (draft.amount <= 0) return;
              draft.step = 'review';
              Router.refreshTop();
              return;
            }
            if (ev.target.closest('[data-schedule]')) {
              pickDate((value) => {
                draft.when = value;
                Router.refreshTop();
              }, draft.when);
            }
          });
          node.querySelector('#msg')?.addEventListener('input', (ev) => {
            draft.message = ev.target.value;
          });
          return;
        }

        node.querySelector('[data-send]')?.addEventListener('click', async () => {
          const res = await finalize({
            actionLabel: 'Pix',
            action: () => store.sendPix({
              keyObj: { type: draft.keyInfo.type, value: draft.keyInfo.value },
              amountCents: draft.amount,
              message: draft.message,
              when: draft.when || null,
            }),
            successTitle: draft.when ? 'Pix agendado' : 'Pix enviado',
            lines: [
              `${draft.holder} ${draft.when ? 'vai receber' : 'recebeu'} ${show(draft.amount, 'BRL')}`,
              keyLabel(draft.keyInfo.type),
            ],
          });
          if (res) resetDraft();
        });
      },
    };
  },

  pixManual: () => {
    const form = { banco: '', agencia: '', conta: '', nome: '', tipo: '01', amount: 0 };
    return {
      title: 'Transferência',
      live: false,
      content: () => `
        <div class="scroll">
          <div class="large-title">Sem chave Pix?</div>
          <p class="subtitle" style="margin:0 0 14px">Envie por agência e conta. Dinheiro cai em até 30 minutos nos dias úteis.</p>
          <div class="form">
            <div class="field">
              <label for="banco">Banco (3 dígitos)</label>
              <input id="banco" inputmode="numeric" maxlength="3" placeholder="Ex.: 341" value="${esc(form.banco)}">
            </div>
            <div class="field">
              <label for="ag">Agência</label>
              <input id="ag" inputmode="numeric" maxlength="4" placeholder="Ex.: 1856" value="${esc(form.agencia)}">
            </div>
            <div class="field">
              <label for="ct">Conta com dígito</label>
              <input id="ct" inputmode="numeric" maxlength="12" placeholder="Ex.: 48230-7" value="${esc(form.conta)}">
            </div>
            <div class="field">
              <label for="nm">Nome de quem recebe</label>
              <input id="nm" type="text" placeholder="Favorecido" value="${esc(form.nome)}">
            </div>
            <div class="segmented" data-tipo>
              <button class="${form.tipo === '01' ? 'on' : ''}" data-t="01">Corrente</button>
              <button class="${form.tipo === '02' ? 'on' : ''}" data-t="02">Poupança</button>
              <button class="${form.tipo === '07' ? 'on' : ''}" data-t="07">Salário</button>
            </div>
          </div>
          <div class="section-label">Valor</div>
          <div data-amount style="text-align:center"></div>
        </div>
        <div class="footer-bar"><button class="btn primary" data-go>Revisar e enviar</button></div>`,
      mount: (node) => {
        const host = node.querySelector('[data-amount]');
        const pad = amountPad({ currency: 'BRL', initial: 0, onChange: (c) => { form.amount = c; } });
        host.append(pad.display, pad.pad);
        const map = { banco: 'banco', ag: 'agencia', ct: 'conta', nm: 'nome' };
        Object.entries(map).forEach(([id, field]) => {
          node.querySelector(`#${id}`)?.addEventListener('input', (ev) => {
            form[field] = ev.target.value;
          });
        });
        node.querySelector('[data-tipo]').addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-t]');
          if (!btn) return;
          form.tipo = btn.dataset.t;
          node.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b === btn));
        });
        node.querySelector('[data-go]').addEventListener('click', async () => {
          if (!/^\d{3}$/.test(form.banco.replace(/\D/g, ''))) return toast('Informe o código do banco (3 dígitos).');
          if (!form.agencia.replace(/\D/g, '')) return toast('Informe a agência.');
          if (!form.conta.replace(/\D/g, '')) return toast('Informe a conta.');
          if (form.nome.trim().length < 3) return toast('Informe o nome de quem recebe.');
          if (form.amount <= 0) return toast('Digite o valor.');
          const ok = await confirm({
            title: 'Confirmar transferência',
            message: `${fmt(form.amount)} para ${form.nome}, banco ${form.banco}, agência ${form.agencia}.`,
            confirmLabel: 'Enviar',
          });
          if (!ok) return;
          await finalize({
            actionLabel: 'Transferência',
            action: () => store.manualTransfer({
              bank: form.banco,
              agency: form.agencia,
              account: form.conta,
              holder: form.nome,
              accountType: form.tipo,
              amountCents: form.amount,
            }),
            successTitle: 'Transferência enviada',
            lines: [`${form.nome} recebeu ${show(form.amount, 'BRL')}`],
          });
        });
      },
    };
  },

  pixCopyPaste: () => {
    let code = '';
    let parsed = null;
    let error = '';
    let amount = 0;
    return {
      title: 'Copia e cola',
      live: false,
      content: () => `
        <div class="scroll">
          <div class="large-title">Cola o código<br>do Pix</div>
          <p class="subtitle" style="margin:0 0 12px">Aceita o código que começa com <span class="mono">000201…</span> ou o link <span class="mono">https://pix.gov.br/…</span></p>
          <div class="field">
            <label for="code">Código de cobrança</label>
            <textarea id="code" rows="5" autocapitalize="none" spellcheck="false" placeholder="00020126…">${esc(code)}</textarea>
          </div>
          <button class="btn tonal" data-paste style="margin-top:10px">${icon('copy')} Colar da área de transferência</button>
          ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          ${parsed?.ok ? `
            <div class="group" style="margin-top:14px">
              <div class="row">
                <span class="main"><span class="t">${esc(parsed.merchantName)}</span><span class="s">${esc(parsed.merchantCity)} · ${esc(parsed.key)}</span></span>
                <span class="trailing num">${parsed.amountCents ? esc(fmt(parsed.amountCents)) : 'valor livre'}</span>
              </div>
            </div>` : ''}
          ${parsed?.ok && !parsed.amountCents ? `<div class="section-label">Digite o valor</div><div data-amount style="text-align:center"></div>` : ''}
        </div>
        ${parsed?.ok ? `<div class="footer-bar"><button class="btn primary" data-pay>${parsed.amountCents ? `Pagar ${esc(fmt(parsed.amountCents))}` : 'Pagar'}</button></div>` : ''}`,
      mount: (node) => {
        const box = node.querySelector('#code');
        box?.addEventListener('input', (ev) => {
          code = ev.target.value;
          parsed = code.trim() ? parseBRCode(code) : null;
          error = parsed && !parsed.ok ? parsed.error : '';
          Router.refreshTop();
        });
        if (parsed?.ok && !parsed.amountCents) {
          const host = node.querySelector('[data-amount]');
          if (host) {
            const pad = amountPad({ currency: 'BRL', initial: amount, onChange: (c) => { amount = c; } });
            host.append(pad.display, pad.pad);
          }
        }
        node.querySelector('[data-paste]')?.addEventListener('click', async () => {
          try {
            const text = await navigator.clipboard.readText();
            if (!text) return toast('A área de transferência está vazia.');
            code = text.trim();
            parsed = parseBRCode(code);
            error = parsed.ok ? '' : parsed.error;
            Router.refreshTop();
          } catch {
            toast('Toque no campo e cole segurando o dedo.');
          }
        });
        node.querySelector('[data-pay]')?.addEventListener('click', async () => {
          const value = parsed.amountCents || amount;
          if (!value) return toast('Digite o valor a pagar.');
          await finalize({
            actionLabel: 'Pix',
            action: () => store.payBRCode({ parsed, amountCents: parsed.amountCents ? null : value }),
            successTitle: 'Pagamento concluído',
            lines: [`${parsed.merchantName || parsed.key} recebeu ${show(value, 'BRL')}`],
          });
        });
      },
    };
  },

  pixScan: () => {
    let cam = null;
    return {
      title: 'Ler QR Code',
      live: false,
      hideTabbar: true,
      content: () => `
        <div class="scanner">
          <video id="cam" playsinline muted></video>
          <div class="frame"><div class="scan-line"></div></div>
          <div class="scan-top">${cameraSupported() ? 'Aponte para o QR Code do Pix' : 'Câmera indisponível — use imagem ou código'}</div>
          <div class="scan-actions">
            <label class="btn">${icon('doc')} Imagem<input id="img" type="file" accept="image/*" class="hidden"></label>
            <button class="btn" data-paste>Colar</button>
            <button class="btn" data-close>${icon('x')}</button>
          </div>
        </div>`,
      mount: (node, frame) => {
        const video = node.querySelector('#cam');
        const setTop = (text) => {
          const top = node.querySelector('.scan-top');
          if (top) top.textContent = text;
        };
        const close = () => {
          cam?.stop();
          cam = null;
        };
        const handle = (text) => {
          if (!text) return;
          const parsed = parseBRCode(text);
          close();
          if (!parsed.ok) {
            setTop(parsed.error);
            return;
          }
          draft.parsed = parsed;
          Router.replace('pixPayQr');
        };
        if (cameraSupported()) {
          ensureDecoder().then((ok) => {
            if (!ok) {
              setTop('O leitor de QR não conseguiu carregar. Use Imagem ou Colar.');
              return;
            }
            cam = startCamera(video, {
              onFrame: (v) => {
                const text = decodeFrom(v);
                if (text) handle(text);
                return text;
              },
              onError: () => setTop('A câmera não foi liberada. Use Imagem ou Colar.'),
            });
          });
        }
        node.querySelector('[data-close]').addEventListener('click', () => {
          close();
          Router.pop({ force: true });
        });
        node.querySelector('#img').addEventListener('change', async (ev) => {
          const file = ev.target.files?.[0];
          if (!file) return;
          const text = await decodeFromFile(file);
          if (!text) {
            setTop('Não encontrei QR Code nessa imagem.');
            return;
          }
          handle(text);
        });
        node.querySelector('[data-paste]').addEventListener('click', () => {
          close();
          Router.replace('pixCopyPaste');
        });
        frame.onLeave = close;
      },
    };
  },

  pixPayQr: () => {
    const parsed = draft.parsed;
    if (!parsed) {
      return { title: 'Pagamento', live: false, content: () => `<div class="empty">${icon('qr')}<div>Nenhum QR Code lido agora.</div></div>` };
    }
    let amount = parsed.amountCents || 0;
    return {
      title: 'Confirmar pagamento',
      live: false,
      content: () => `
        <div class="scroll">
          <div class="receipt-hero">
            <div class="avatar-lg">${icon('pix')}</div>
            <div class="amount num">${show(amount || parsed.amountCents, 'BRL')}</div>
            <div class="who">${esc(parsed.merchantName || parsed.key)}</div>
          </div>
          <div class="group">
            ${line('Chave de quem recebe', parsed.key)}
            ${line('Cidade', parsed.merchantCity || '—')}
            ${line('Identificador', parsed.txid)}
            ${parsed.amountCents ? line('Valor do QR', fmt(parsed.amountCents)) : ''}
          </div>
          ${!parsed.amountCents ? '<div class="section-label">Digite o valor</div><div data-amount style="text-align:center"></div>' : ''}
          ${nightHint()}
        </div>
        <div class="footer-bar"><button class="btn primary" data-pay>Pagar ${esc(fmt(amount))}</button></div>`,
      mount: (node) => {
        if (!parsed.amountCents) {
          const host = node.querySelector('[data-amount]');
          const pad = amountPad({
            currency: 'BRL',
            initial: amount,
            onChange: (c) => {
              amount = c;
              const btn = node.querySelector('[data-pay]');
              if (btn) btn.textContent = `Pagar ${fmt(c)}`;
            },
          });
          host?.append(pad.display, pad.pad);
        }
        node.querySelector('[data-pay]').addEventListener('click', async () => {
          if (!amount) return toast('Informe o valor.');
          const value = amount;
          await finalize({
            actionLabel: 'Pix',
            action: () => store.payBRCode({ parsed, amountCents: parsed.amountCents ? null : value }),
            successTitle: 'Pagamento concluído',
            lines: [`${parsed.merchantName || parsed.key} recebeu ${show(value, 'BRL')}`],
          });
          draft.parsed = null;
        });
      },
    };
  },

  pixCharge: () => {
    let step = 'form';
    let amount = 0;
    let key = S().pix.keys[0]?.value || '';
    let txid = '';
    let note = '';
    let charge = null;
    let code = '';
    return {
      title: 'Cobrar',
      live: false,
      onBack: () => {
        if (step === 'done') {
          step = 'form';
          Router.refreshTop();
          return false;
        }
        return true;
      },
      content: () => {
        if (step === 'form') {
          const keys = S().pix.keys;
          if (!keys.length) {
            return `<div class="empty">${icon('key')}<div>Cadastre uma chave Pix para gerar cobranças.</div></div>`;
          }
          return `
          <div class="scroll">
            <div class="large-title">Quanto você<br>quer receber?</div>
            <div data-amount style="text-align:center"></div>
            <div class="field" style="margin-top:8px">
              <label for="key">Receber na chave</label>
              <select id="key">${keys.map((k) => `<option value="${esc(k.value)}" ${k.value === key ? 'selected' : ''}>${esc(`${keyLabel(k.type)} · ${formatKey(k.type, k.value)}`)}</option>`).join('')}</select>
            </div>
            <div class="field">
              <label for="note">Descrição curta</label>
              <input id="note" maxlength="34" placeholder="Ex.: conto do jantar" value="${esc(note)}">
            </div>
            <div class="field">
              <label for="txid">Identificador (opcional)</label>
              <input id="txid" maxlength="25" placeholder="${esc(txid || makeTxid(8))}" value="${esc(txid)}">
            </div>
          </div>
          <div class="footer-bar"><button class="btn primary" data-create>Gerar cobrança</button></div>`;
        }
        return `
        <div class="scroll">
          <div class="receipt-hero">
            <div class="amount num">${show(charge.amountCents, 'BRL')}</div>
            <div class="who">${esc(charge.note || 'Cobrança Pix')}</div>
          </div>
          <div class="qr-wrap" data-qr></div>
          <div class="copy-box selectable" data-code>${esc(code)}</div>
          <div class="btn-row">
            <button class="btn tonal" data-copy>${icon('copy')} Copiar</button>
            <button class="btn tonal" data-share>${icon('share')} Compartilhar</button>
          </div>
          <div class="section-label">Testar a cobrança</div>
          <div class="group">
            <button class="row" data-receive>
              <span class="lead">${icon('download')}</span>
              <span class="main"><span class="t">Confirmar recebimento</span><span class="s">credita o valor na conta na hora</span></span>
              ${icon('chevron', 'go')}
            </button>
            <button class="row danger" data-cancel>
              <span class="lead">${icon('x')}</span>
              <span class="main"><span class="t">Cancelar esta cobrança</span></span>
            </button>
          </div>
        </div>`;
      },
      mount: (node) => {
        if (step === 'form') {
          if (!S().pix.keys.length) return;
          const host = node.querySelector('[data-amount]');
          const pad = amountPad({ currency: 'BRL', initial: amount, onChange: (c) => { amount = c; } });
          host.append(pad.display, pad.pad);
          node.querySelector('#key').addEventListener('change', (ev) => { key = ev.target.value; });
          node.querySelector('#note').addEventListener('input', (ev) => { note = ev.target.value; });
          node.querySelector('#txid').addEventListener('input', (ev) => { txid = ev.target.value; });
          node.querySelector('[data-create]').addEventListener('click', () => {
            if (amount <= 0) return toast('Digite o valor da cobrança.');
            const res = store.createCharge({ amountCents: amount, key, txid, note });
            if (!res.ok) {
              toast(errorText(res));
              return;
            }
            charge = res.charge;
            code = buildBRCode({
              key: charge.key,
              name: S().profile.name,
              city: 'SAO PAULO',
              amountCents: charge.amountCents,
              txid: charge.txid,
            });
            step = 'done';
            Router.refreshTop();
          });
          return;
        }
        node.querySelector('[data-qr]').append(renderQR(code, { size: 228 }));
        node.querySelector('[data-copy]').addEventListener('click', async () => {
          toast((await copyText(code)) ? 'Código copiado' : 'Não foi possível copiar');
        });
        node.querySelector('[data-share]').addEventListener('click', async () => {
          const { shareText } = await import('../ui/kit.js');
          const outcome = await shareText({
            title: 'Cobrança Pix',
            text: `${S().profile.name} está cobrando ${fmt(charge.amountCents)}. Cole o código Pix:\n${code}`,
          });
          if (outcome === 'copied') toast('Código copiado para compartilhar');
        });
        node.querySelector('[data-receive]').addEventListener('click', async () => {
          const go = await confirm({
            title: 'Confirmar o pagamento?',
            message: 'O app não tem banco de verdade, então isso registra o recebimento no extrato.',
            confirmLabel: 'Confirmar',
          });
          if (!go) return;
          const res = store.receiveCharge(charge.id);
          if (!res.ok) {
            toast(errorText(res));
            return;
          }
          resultScreen({
            ok: true,
            title: 'Cobrança recebida',
            lines: [`${fmt(charge.amountCents)} entraram na conta`],
            primary: {
              label: 'Ver comprovante',
              onClick: () => {
                Router.popToRoot();
                Router.push('receipt', { id: res.tx.id });
              },
            },
          });
        });
        node.querySelector('[data-cancel]').addEventListener('click', async () => {
          const go = await confirm({
            title: 'Cancelar cobrança?',
            message: 'Quem tentar pagar vai receber que a cobrança não existe mais.',
            confirmLabel: 'Cancelar cobrança',
            destructive: true,
          });
          if (!go) return;
          store.cancelCharge(charge.id);
          toast('Cobrança cancelada');
          Router.pop({ force: true });
        });
      },
    };
  },

  pixCharges: () => ({
    title: 'Cobranças',
    content: () => {
      const list = S().charges;
      return `
      <div class="scroll flush">
        ${list.length === 0 ? `<div class="empty">${icon('download')}<div>Você ainda não criou cobranças.</div></div>` : ''}
        <div class="group" style="margin:0 16px">
          ${list.map((c) => `
            <button class="row" data-charge="${c.id}">
              <span class="lead">${icon(c.status === 'paid' ? 'check' : c.status === 'canceled' ? 'x' : 'clock')}</span>
              <span class="main">
                <span class="t">${esc(c.note || 'Cobrança sem descrição')}</span>
                <span class="s">${new Date(c.createdAt).toLocaleDateString('pt-BR')} · ${esc(formatKey(detectKey(c.key).type, c.key))}</span>
              </span>
              <span class="trailing"><b class="num">${esc(fmt(c.amountCents))}</b><span class="badge ${c.status === 'paid' ? 'green' : c.status === 'canceled' ? 'red' : 'amber'}">${c.status === 'paid' ? 'recebida' : c.status === 'canceled' ? 'cancelada' : 'aberta'}</span></span>
            </button>`).join('')}
        </div>
      </div>`;
    },
    mount: (node) => {
      node.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-charge]');
        if (!btn) return;
        const charge = S().charges.find((c) => c.id === btn.dataset.charge);
        if (!charge) return;
        if (charge.status === 'paid') {
          const tx = S().tx.find((t) => t.details?.chargeId === charge.id);
          if (tx) Router.push('receipt', { id: tx.id });
          return;
        }
        const code = buildBRCode({
          key: charge.key,
          name: S().profile.name,
          city: 'SAO PAULO',
          amountCents: charge.amountCents,
          txid: charge.txid,
        });
        const handle = sheet({
          title: charge.note || 'Cobrança Pix',
          body: el(`<div class="sheet-pad" style="text-align:center">
            <div id="qr-here" class="qr-wrap"></div>
            <div class="copy-box selectable" style="margin-top:12px;text-align:left">${esc(code)}</div>
            <div class="btn-row">
              <button class="btn tonal" id="cp">${icon('copy')} Copiar</button>
              ${charge.status === 'open' ? '<button class="btn primary" id="sim">Confirmar pagamento</button>' : ''}
            </div>
          </div>`),
        });
        requestAnimationFrame(() => {
          document.getElementById('qr-here')?.append(renderQR(code, { size: 200 }));
          document.getElementById('cp')?.addEventListener('click', async () => {
            toast((await copyText(code)) ? 'Código copiado' : 'Não foi possível copiar');
          });
          document.getElementById('sim')?.addEventListener('click', () => {
            const res = store.receiveCharge(charge.id);
            handle.close();
            if (res.ok) Router.refreshTop();
            else toast(errorText(res));
          });
        });
      });
    },
  }),

  pixKeys: () => ({
    title: 'Minhas chaves',
    content: () => {
      const s = S();
      return `
      <div class="scroll flush">
        <div class="group" style="margin:0 16px">
          ${s.pix.keys.map((k) => `
            <div class="row">
              <span class="lead">${icon(k.type === 'cpf' ? 'doc' : k.type === 'email' ? 'out' : k.type === 'phone' ? 'phone' : 'key')}</span>
              <span class="main">
                <span class="t">${esc(formatKey(k.type, k.value))}</span>
                <span class="s">${keyLabel(k.type)}${k.isDefault ? ' · padrão' : ''} · desde ${new Date(k.verifiedAt).toLocaleDateString('pt-BR')}</span>
              </span>
              <span class="trailing"><button class="btn sm tonal" data-keymenu="${k.id}" aria-label="Opções da chave">${icon('grid')}</button></span>
            </div>`).join('')}
        </div>
        <div style="padding:14px 16px"><button class="btn primary" data-add>${icon('plus')} Cadastrar chave</button></div>
      </div>`;
    },
    mount: (node) => {
      node.addEventListener('click', (ev) => {
        const menu = ev.target.closest('[data-keymenu]');
        if (menu) {
          const key = S().pix.keys.find((k) => k.id === menu.dataset.keymenu);
          if (key) actionSheetKeys(key);
          return;
        }
        if (ev.target.closest('[data-add]')) Router.push('pixNewKey');
      });
    },
  }),

  pixNewKey: () => {
    let type = 'email';
    let value = '';
    let stage = 'form';
    let code = '';
    let error = '';
    return {
      title: 'Nova chave',
      live: false,
      content: () => {
        if (stage === 'sent') {
          return `
          <div class="scroll">
            <div class="large-title">Confirme<br>o código</div>
            <p class="subtitle" style="margin:0 0 16px">Enviamos um código para <b>${esc(value)}</b>. Como o app é offline, ele aparece aqui: <b class="mono selectable">${esc(code)}</b></p>
            <div class="field">
              <label for="sms">Código de 6 dígitos</label>
              <input id="sms" inputmode="numeric" maxlength="6" placeholder="000000">
            </div>
            ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          </div>
          <div class="footer-bar"><button class="btn primary" data-verify>Verificar</button></div>`;
        }
        return `
        <div class="scroll">
          <div class="large-title">Escolha o<br>tipo de chave</div>
          <div class="segmented" data-seg style="margin-bottom:14px">
            ${[['email', 'E-mail'], ['phone', 'Telefone'], ['evp', 'Aleatória']].map(([id, label]) => `<button class="${type === id ? 'on' : ''}" data-type="${id}">${label}</button>`).join('')}
          </div>
          <div class="form">
            ${type === 'evp'
              ? `<div class="field"><label>Chave sugerida</label><input id="value" readonly value="${esc(value || makeEvpKey())}"></div><p class="field-hint">Gerada no aparelho: ninguém descobre quem você é olhando a chave.</p>`
              : `<div class="field"><label for="value">${type === 'email' ? 'Seu e-mail' : 'Telefone com DDD'}</label><input id="value" type="${type === 'email' ? 'email' : 'tel'}" placeholder="${type === 'email' ? 'voce@email.com' : '(11) 97777-1024'}" value="${esc(value)}"></div>`}
            ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          </div>
        </div>
        <div class="footer-bar"><button class="btn primary" data-next>Cadastrar</button></div>`;
      },
      mount: (node) => {
        node.querySelector('[data-seg]')?.addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-type]');
          if (!btn) return;
          type = btn.dataset.type;
          value = '';
          error = '';
          Router.refreshTop();
        });
        node.querySelector('#value')?.addEventListener('input', (ev) => {
          value = ev.target.value;
        });
        node.querySelector('[data-next]')?.addEventListener('click', () => {
          const raw = node.querySelector('#value')?.value || '';
          const info = detectKey(type === 'evp' && !raw.trim() ? makeEvpKey() : raw);
          if (!info.valid) {
            error = info.error || 'Valor inválido.';
            Router.refreshTop();
            return;
          }
          value = info.value;
          if (type === 'evp') {
            const res = store.registerKey({ type, value });
            if (!res.ok) {
              error = errorText(res);
              Router.refreshTop();
              return;
            }
            toast('Chave aleatória cadastrada');
            Router.pop({ force: true });
            return;
          }
          code = String(Math.floor(100000 + Math.random() * 900000));
          stage = 'sent';
          error = '';
          Router.refreshTop();
        });
        node.querySelector('[data-verify]')?.addEventListener('click', () => {
          const typed = node.querySelector('#sms')?.value || '';
          const res = store.registerKey({ type, value, code: typed, expectedCode: code });
          if (!res.ok) {
            error = errorText(res);
            Router.refreshTop();
            return;
          }
          toast('Chave cadastrada na sua conta');
          Router.pop({ force: true });
        });
      },
    };
  },

  pixLimits: () => ({
    title: 'Meus limites',
    content: () => {
      const s = S();
      const win = operationWindow();
      const used = usedInWindow(s, win);
      const limit = activeLimit(s);
      const pending = s.limits.pending || {};
      return `
      <div class="scroll">
        <div class="card">
          <div class="money-row"><span class="k">Diurno (6h–20h)</span><span class="v num">${esc(fmt(Number(s.limits.day)))}</span></div>
          <div class="money-row"><span class="k">Noturno (20h–6h)</span><span class="v num">${esc(fmt(Number(s.limits.night)))}</span></div>
          <div class="money-row mut"><span class="k">Janela atual (${win.name === 'night' ? 'noturna' : 'diurna'})</span><span class="v num">${esc(fmt(limit - used))} de ${esc(fmt(limit))}</span></div>
        </div>
        ${pending.day ? pendingLine('diurno', pending.day) : ''}
        ${pending.night ? pendingLine('noturno', pending.night) : ''}
        <div class="btn-row">
          <button class="btn tonal" data-edit="day">Alterar diurno</button>
          <button class="btn tonal" data-edit="night">Alterar noturno</button>
        </div>
        <div class="section-label">Atalhos</div>
        <div class="group">
          <button class="row" data-zero>
            <span class="lead">${icon('lock')}</span>
            <span class="main"><span class="t">Bloquear Pix à noite</span><span class="s">Deixa o limite noturno em zero</span></span>
          </button>
          <button class="row" data-restore>
            <span class="lead">${icon('refresh')}</span>
            <span class="main"><span class="t">Voltar ao padrão do Bacen</span><span class="s">${fmt(PIX.nightDefaultLimitCents)} à noite</span></span>
          </button>
        </div>
      </div>`;
    },
    mount: (node) => {
      node.addEventListener('click', async (ev) => {
        const edit = ev.target.closest('[data-edit]');
        if (edit) {
          editLimit(edit.dataset.edit);
          return;
        }
        if (ev.target.closest('[data-zero]')) {
          const go = await confirm({
            title: 'Bloquear Pix noturno?',
            message: 'Nenhum Pix será permitido entre 20h e 6h. Você volta atrás quando quiser.',
            confirmLabel: 'Bloquear',
          });
          if (go) {
            store.requestLimitChange({ win: 'night', valueCents: 0 });
            Router.refreshTop();
          }
          return;
        }
        if (ev.target.closest('[data-restore]')) {
          store.requestLimitChange({ win: 'night', valueCents: PIX.nightDefaultLimitCents });
          store.requestLimitChange({ win: 'day', valueCents: PIX.dayDefaultLimitCents });
          toast('Limites voltaram ao padrão');
          Router.refreshTop();
        }
      });
    },
  }),

  pixScheduled: () => ({
    title: 'Pix agendados',
    content: () => {
      const list = S().tx.filter((t) => t.status === 'scheduled').sort((a, b) => new Date(a.at) - new Date(b.at));
      const failed = S().tx.filter((t) => t.status === 'failed').slice(0, 3);
      return `
      <div class="scroll flush">
        ${list.length === 0 ? `<div class="empty">${icon('clock')}<div>Nada agendado. Dá para agendar na tela de enviar Pix.</div></div>` : ''}
        <div class="group" style="margin:0 16px">
          ${list.map((t) => `
            <button class="row" data-sched="${t.id}">
              <span class="lead">${icon('clock')}</span>
              <span class="main">
                <span class="t">${esc(t.details?.holder || t.subtitle)}</span>
                <span class="s">${new Date(t.at).toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
              </span>
              <span class="trailing num">${esc(show(t.amountCents, t.currency || 'BRL'))}</span>
            </button>`).join('')}
        </div>
        ${failed.length ? `<div class="section-label">Não enviados por falta de saldo</div><div class="group" style="margin:0 16px">${failed.map((t) => `
          <button class="row" data-sched="${t.id}">
            <span class="lead" style="color:var(--danger)">${icon('x')}</span>
            <span class="main"><span class="t">${esc(t.details?.holder || t.subtitle)}</span><span class="s">${new Date(t.at).toLocaleDateString('pt-BR')}</span></span>
            <span class="trailing num">${esc(show(t.amountCents, t.currency || 'BRL'))}</span>
          </button>`).join('')}</div>` : ''}
      </div>`;
    },
    mount: (node) => {
      node.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-sched]');
        if (!btn) return;
        const tx = S().tx.find((t) => t.id === btn.dataset.sched);
        if (!tx) return;
        if (tx.status === 'failed') {
          Router.push('receipt', { id: tx.id });
          return;
        }
        const go = await confirm({
          title: 'Cancelar agendamento?',
          message: `${fmt(tx.amountCents)} para ${tx.details?.holder || tx.subtitle}.`,
          confirmLabel: 'Cancelar agendamento',
          destructive: true,
        });
        if (!go) return;
        const res = store.cancelScheduled(tx.id);
        toast(res.ok ? 'Agendamento cancelado' : errorText(res));
        Router.refreshTop();
      });
    },
  }),

  pixFavorites: () => {
    let adding = false;
    let holder = '';
    let key = '';
    let bank = '';
    let error = '';
    return {
      title: 'Favoritos',
      live: false,
      content: () => {
        const list = S().pix.favorites;
        if (!adding) {
          return `
          <div class="scroll flush">
            <div class="group" style="margin:0 16px">
              ${list.map((f) => `
                <div class="row">
                  <span class="lead wide">${esc(f.holder.slice(0, 1).toUpperCase())}</span>
                  <span class="main"><span class="t">${esc(f.holder)}</span><span class="s">${esc(formatKey(detectKey(f.key).type, f.key))} · ${esc(f.bank)}</span></span>
                  <span class="trailing"><button class="btn sm tonal" data-favmenu="${f.id}" aria-label="Opções">${icon('grid')}</button></span>
                </div>`).join('') || `<div class="empty">${icon('star')}<div>Seus favoritos aparecem aqui e aceleram o Pix.</div></div>`}
            </div>
            <div style="padding:14px 16px"><button class="btn primary" data-add>${icon('plus')} Adicionar favorito</button></div>
          </div>`;
        }
        return `
        <div class="scroll">
          <div class="large-title">Novo<br>favorito</div>
          <div class="form">
            <div class="field"><label for="h">Quem recebe</label><input id="h" value="${esc(holder)}" placeholder="Ex.: Dona Cida (academia)"></div>
            <div class="field"><label for="k">Chave Pix</label><input id="k" value="${esc(key)}" placeholder="CPF, telefone, e-mail ou aleatória"></div>
            <div class="field"><label for="b">Banco (opcional)</label><input id="b" value="${esc(bank)}" placeholder="Ex.: Itaú"></div>
            ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          </div>
        </div>
        <div class="footer-bar"><button class="btn primary" data-save>Salvar favorito</button></div>`;
      },
      mount: (node) => {
        node.querySelector('[data-add]')?.addEventListener('click', () => {
          adding = true;
          error = '';
          Router.refreshTop();
        });
        const fields = { h: 'holder', k: 'key', b: 'bank' };
        Object.entries(fields).forEach(([id, field]) => {
          node.querySelector(`#${id}`)?.addEventListener('input', (ev) => {
            if (field === 'holder') holder = ev.target.value;
            if (field === 'key') key = ev.target.value;
            if (field === 'bank') bank = ev.target.value;
          });
        });
        node.querySelector('[data-save]')?.addEventListener('click', () => {
          const info = detectKey(key);
          if (!info.valid) {
            error = info.error || 'Chave inválida.';
            Router.refreshTop();
            return;
          }
          const res = store.addFavorite({ key: info.value, holder, bank: bank || 'Outro banco' });
          if (!res.ok) {
            error = errorText(res);
            Router.refreshTop();
            return;
          }
          adding = false;
          holder = '';
          key = '';
          bank = '';
          toast('Favorito salvo');
          Router.refreshTop();
        });
        node.addEventListener('click', (ev) => {
          const menu = ev.target.closest('[data-favmenu]');
          if (!menu) return;
          const fav = S().pix.favorites.find((f) => f.id === menu.dataset.favmenu);
          if (fav) actionSheetFavorite(fav);
        });
      },
    };
  },
};

/* ---------------- apoio ---------------- */

function pendingLine(win, pending) {
  const at = new Date(pending.effectiveAt);
  return `<div class="fx-banner">${icon('clock')}<span>Novo limite ${win}: <b>${esc(fmt(pending.value))}</b> a partir de ${at.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>`;
}

function editLimit(win) {
  const current = Number(S().limits[win]);
  let amount = current;
  const handle = sheet({
    title: win === 'night' ? 'Limite noturno (20h–6h)' : 'Limite diurno (6h–20h)',
    body: el(`<div class="sheet-pad">
      <div id="pad" style="text-align:center"></div>
      <button class="btn primary" id="save">Salvar novo limite</button>
    </div>`),
  });
  requestAnimationFrame(() => {
    const host = document.getElementById('pad');
    if (!host) return;
    const pad = amountPad({ currency: 'BRL', initial: current, onChange: (c) => { amount = c; } });
    host.append(pad.display, pad.pad);
    document.getElementById('save').addEventListener('click', () => {
      const res = store.requestLimitChange({ win, valueCents: amount });
      handle.close();
      if (!res.ok) {
        toast(errorText(res));
        return;
      }
      toast(res.applied === 'immediate' ? 'Limite reduzido na hora' : 'Aumento programado para valer em 24h');
      Router.refreshTop();
    });
  });
}

function actionSheetKeys(key) {
  import('../ui/kit.js').then(async ({ actionSheet }) => {
    const choice = await actionSheet({
      title: formatKey(key.type, key.value),
      message: keyLabel(key.type),
      options: [
        { label: 'Copiar chave', icon: 'copy', value: 'copy' },
        { label: 'Mostrar QR para receber', icon: 'qr', value: 'qr' },
        ...(!key.isDefault ? [{ label: 'Definir como padrão', icon: 'star', value: 'default' }] : []),
        { label: 'Excluir chave', icon: 'trash', value: 'delete', destructive: true },
      ],
    });
    if (choice === 'copy') {
      toast((await copyText(key.value)) ? 'Chave copiada' : 'Não foi possível copiar');
    } else if (choice === 'default') {
      store.setDefaultKey(key.id);
      Router.refreshTop();
    } else if (choice === 'qr') {
      const code = buildBRCode({ key: key.value, name: S().profile.name, city: 'SAO PAULO', txid: '***' });
      sheet({
        title: 'Receba com este QR',
        body: el(`<div class="sheet-pad" style="text-align:center"><div id="qrk" class="qr-wrap"></div></div>`),
      });
      requestAnimationFrame(() => document.getElementById('qrk')?.append(renderQR(code, { size: 200 })));
    } else if (choice === 'delete') {
      const go = await confirm({
        title: 'Excluir esta chave?',
        message: 'Quem tentar pagar por ela não vai mais te encontrar.',
        confirmLabel: 'Excluir',
        destructive: true,
      });
      if (!go) return;
      const res = store.deleteKey(key.id);
      toast(res.ok ? 'Chave excluída' : errorText(res));
      Router.refreshTop();
    }
  });
}

function actionSheetFavorite(fav) {
  import('../ui/kit.js').then(async ({ actionSheet }) => {
    const choice = await actionSheet({
      title: fav.holder,
      message: formatKey(detectKey(fav.key).type, fav.key),
      options: [
        { label: 'Enviar Pix', icon: 'send', value: 'send' },
        { label: 'Copiar chave', icon: 'copy', value: 'copy' },
        { label: 'Remover dos favoritos', icon: 'trash', value: 'remove', destructive: true },
      ],
    });
    if (choice === 'send') {
      resetDraft();
      draft.key = fav.key;
      Router.push('pixSend');
    } else if (choice === 'copy') {
      toast((await copyText(fav.key)) ? 'Chave copiada' : 'Não foi possível copiar');
    } else if (choice === 'remove') {
      store.removeFavorite(fav.id);
      Router.refreshTop();
    }
  });
}

function pickDate(cb, current) {
  const date = current ? new Date(current) : new Date(Date.now() + 86_400_000);
  const pad2 = (n) => String(n).padStart(2, '0');
  const handle = sheet({
    title: 'Agendar este Pix',
    body: el(`<div class="sheet-pad">
      <div class="form">
        <div class="field"><label for="dd">Dia</label><input id="dd" type="date" value="${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}"></div>
        <div class="field"><label for="hh">Hora</label><input id="hh" type="time" value="${pad2(date.getHours())}:${pad2(date.getMinutes())}"></div>
      </div>
      <div class="btn-row"><button class="btn" id="now">Enviar agora</button><button class="btn primary" id="ok">Agendar</button></div>
    </div>`),
  });
  requestAnimationFrame(() => {
    document.getElementById('ok')?.addEventListener('click', () => {
      const d = document.getElementById('dd').value;
      const t = document.getElementById('hh').value;
      if (!d || !t) {
        toast('Escolha dia e hora.');
        return;
      }
      const [y, m, day] = d.split('-').map(Number);
      const [h, min] = t.split(':').map(Number);
      const when = new Date(y, m - 1, day, h, min);
      if (when <= new Date()) {
        toast('O agendamento precisa ser no futuro.');
        return;
      }
      handle.close();
      cb(when.toISOString());
    });
    document.getElementById('now')?.addEventListener('click', () => {
      handle.close();
      cb('');
    });
  });
}
