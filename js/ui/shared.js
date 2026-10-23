// Ajudantes usados por todas as telas: moeda de exibição, autorização e mensagens de erro.
import { icon } from './icons.js';
import { alert, el, esc, layers, toast } from './kit.js';
import * as store from '../logic/store.js';
import { displayCurrency, toDisplay } from '../logic/fx.js';
import { fmt } from '../logic/money.js';
import { BANK, txMeta } from '../logic/rules.js';
import { verifyBiometric } from '../logic/security.js';

export function S() {
  return store.getState();
}

export function cur() {
  return displayCurrency(S());
}

export function symbol(c = cur()) {
  return c === 'EUR' ? '€' : 'R$';
}

/** Valor convertido para a moeda escolhida na tela inicial. */
export function conv(cents, from = 'BRL') {
  return toDisplay(S(), cents, from);
}

export function show(cents, from = 'BRL') {
  return fmt(conv(cents, from), cur());
}

export function showSigned(cents, from = 'BRL') {
  const n = conv(cents, from);
  const text = show(Math.abs(cents), from);
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${text}`;
}

/** Linha secundária com o valor na moeda original do lançamento, quando a tela está em outra. */
export function otherHint(cents, from = 'BRL') {
  if (cur() === from) return '';
  return `≈ ${fmt(Math.abs(cents), from)}`;
}

/** O olho é a fonte da verdade na sessão; hideBalance define só como o app abre. */
let revealedThisSession = null;
export function isRevealed() {
  if (revealedThisSession === null) revealedThisSession = !S().security.hideBalance;
  return revealedThisSession;
}
export function balanceHidden() {
  return !isRevealed();
}
export function setRevealed(value) {
  revealedThisSession = Boolean(value);
}

export function money(cents, from = 'BRL', { mask = null } = {}) {
  const hide = mask === null ? balanceHidden() : mask;
  if (hide) return `•••• ${cur()}`;
  return show(cents, from);
}

/** Os dois valores da mesma quantia — euro e real — respeitando o olho. */
export function bothCurrencies(cents, from = 'BRL') {
  const rate = S().settings.fx.rate || 56440;
  if (balanceHidden()) return { eur: '•••• EUR', brl: '•••• BRL' };
  const brl = from === 'BRL' ? cents : Math.round((cents * rate) / 10000);
  const eur = from === 'EUR' ? cents : Math.round((cents * 10000) / rate);
  return { eur: fmt(eur, 'EUR'), brl: fmt(brl, 'BRL') };
}

/** IBAN no padrão de tela: BE54 •••• •••• 7092. */
export function ibanMasked(value) {
  const v = String(value || '').toUpperCase();
  if (v.length < 10) return v;
  return `${v.slice(0, 4)} •••• •••• ${v.slice(-4)}`;
}

export function initialsOf(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/* ---------------- mensagens de erro ---------------- */

export function errorText(result = {}) {
  const s = S();
  switch (result.code) {
    case 'amount':
      return 'Informe um valor maior que zero.';
    case 'funds':
      return 'Saldo insuficiente na conta em reais. Resgate uma caixinha ou venda euros.';
    case 'fundsEur':
      return `Saldo insuficiente na conta em euro (você tem ${show(s.accounts.eur.cashCents, 'EUR')}).`;
    case 'self':
      return 'Você não pode enviar Pix para a sua própria chave.';
    case 'selfCharge':
      return 'Esse QR Code pertence a uma das suas chaves. Não é possível pagar a si mesmo.';
    case 'unknownKey':
      return 'Chave não encontrada no sistema Pix. Confira o número ou envie por agência e conta.';
    case 'limit': {
      const win = result.win?.name || 'day';
      if (result.remaining === 0) {
        return win === 'night'
          ? 'Você chegou ao limite de Pix no período noturno (20h às 6h).'
          : 'Você chegou ao limite de Pix do dia.';
      }
      return `${win === 'night' ? 'Limite noturno (20h–6h)' : 'Limite do dia'}: restam ${show(result.remaining, 'BRL')} nesta janela.`;
    }
    case 'blocked':
      if (result.win) return 'Seus Pix estão bloqueados neste período. Reative o limite em "Meus limites".';
      return 'Seu cartão está bloqueado. Desbloqueie na tela do cartão.';
    case 'parse':
      return result.error || 'Não foi possível ler o código.';
    case 'overdue':
      return 'Este boleto está vencido. Peça um novo código de cobrança ao beneficiário.';
    case 'min':
      return 'Abaixo do valor mínimo da operação.';
    case 'dailyLimit':
      return 'Você atingiu o limite diário de compra de euros.';
    case 'iban':
      return result.error || 'IBAN inválido.';
    case 'phone':
      return 'Número de telefone inválido. Use DDD + número.';
    case 'sms':
      return 'Código de verificação incorreto.';
    case 'duplicate':
      return 'Essa chave já está cadastrada na sua conta.';
    case 'maxKeys':
      return `Limite de ${5} chaves por pessoa física atingido. Exclua uma para cadastrar outra.`;
    case 'cpfMismatch':
      return 'A chave de CPF só pode ser o CPF da titular da conta.';
    case 'notEmpty':
      return 'Resgate todo o saldo antes de excluir a caixinha.';
    case 'internationalOff':
      return 'Compras internacionais estão desativadas. Ative em "Cartão".';
    case 'settled':
      return 'Sua fatura já está quitada.';
    case 'notRefundable':
      return 'Este lançamento não pode ser devolvido.';
    case 'expired':
      return 'Passaram mais de 28 dias — a devolução pelo app não é mais permitida.';
    case 'notScheduled':
      return 'Este agendamento já foi executado.';
    case 'notFound':
      return 'Item não encontrado.';
    case 'alreadyPaid':
      return 'Essa cobrança já foi paga.';
    case 'canceled':
      return 'Essa cobrança foi cancelada.';
    case 'exists':
      return 'Você já tem um cartão virtual ativo.';
    case 'none':
      return 'Nenhum cartão virtual para excluir.';
    case 'same':
      return 'O novo limite precisa ser diferente do atual.';
    case 'tooHigh':
      return 'Limite acima do máximo permitido para este perfil.';
    case 'invalid':
      return 'Valor inválido.';
    case 'name':
      return 'Dê um nome para a caixinha.';
    case 'wrongCurrent':
      return 'A senha atual está incorreta.';
    case 'wrong':
      return `Senha incorreta. Restam ${result.attemptsLeft} tentativas.`;
    case 'locked':
      return `Muitas tentativas. Aguarde ${result.secondsLeft}s e tente de novo.`;
    default:
      return result.error || 'Algo deu errado. Tente novamente.';
  }
}

export async function showFail(result = {}) {
  await alert({ title: 'Não foi possível concluir', message: errorText(result) });
}

/* ---------------- autorização (senha ou Face ID) ---------------- */

let authResolver = null;

function authLayer() {
  return document.getElementById('auth-layer');
}

export function authorize({ title = 'Digite sua senha', message = '', biometric = true } = {}) {
  return new Promise((resolve) => {
    const s = S();
    const canBio = biometric && s.security.biometric;
    const node = el(`
      <div class="overlay in" id="auth-layer" style="justify-content:flex-end;padding:0;background:var(--bg)">
        <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 24px 8px;text-align:center">
          <div style="font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-2)">Ipê Banco Digital</div>
          <div style="font-size:21px;font-weight:700;margin-top:8px">${esc(title)}</div>
          ${message ? `<div style="font-size:14px;color:var(--text-2);margin-top:4px">${esc(message)}</div>` : ''}
          <div data-dots style="margin-top:6px"></div>
          <div data-error style="font-size:13.5px;color:var(--danger);min-height:18px;margin-top:2px"></div>
        </div>
        <div data-pad></div>
        <div style="display:flex;gap:8px;padding:0 16px calc(16px + var(--sab));width:100%">
          <button class="btn ghost" data-cancel>Cancelar</button>
          ${canBio ? `<button class="btn ghost" data-bio style="color:var(--brand)">Face ID</button>` : ''}
        </div>
      </div>`);
    layers().append(node);
    let value = '';
    const dotsHost = node.querySelector('[data-dots]');
    const paint = () => {
      dotsHost.innerHTML = `<div class="dots">${Array.from({ length: 6 }, (_, i) => `<i class="${i < value.length ? 'fill' : ''}"></i>`).join('')}</div>`;
    };
    paint();
    const finish = (result) => {
      node.remove();
      authResolver = null;
      resolve(result);
    };
    authResolver = finish;

    const pad = el(`<div class="keypad"><div class="keypad-grid"></div></div>`);
    const grid = pad.querySelector('.keypad-grid');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].forEach((key) => {
      const btn = el(`<button class="key ${key === 'del' || key === 'bio' ? 'fn' : ''}" data-k="${key}">${key === 'del' ? '⌫' : key === 'bio' ? (canBio ? 'Face ID' : '') : key}</button>`);
      if (key === 'bio' && !canBio) btn.classList.add('hidden');
      btn.addEventListener('click', async () => {
        const err = node.querySelector('[data-error]');
        if (key === 'bio') {
          err.textContent = '';
          try {
            const ok = await verifyBiometric(S().security.biometric);
            if (ok) finish({ ok: true, via: 'biometric' });
            else err.textContent = 'Biometria não reconhecida.';
          } catch (e) {
            err.textContent = e.message?.slice(0, 60) || 'Biometria indisponível.';
          }
          return;
        }
        if (key === 'del') {
          value = value.slice(0, -1);
          paint();
          return;
        }
        if (value.length >= 6) return;
        value += key;
        paint();
        if (value.length === 6) {
          const res = await store.authorizePassword(value);
          if (res.ok) finish({ ok: true, via: 'password' });
          else {
            value = '';
            paint();
            err.textContent = errorText(res);
          }
        }
      });
      grid.append(btn);
    });
    node.querySelector('[data-pad]').append(pad);
    node.querySelector('[data-cancel]').addEventListener('click', () => finish({ ok: false, code: 'cancel' }));
  });
}

export function cancelAuthorize() {
  if (authResolver) authResolver({ ok: false, code: 'cancel' });
}

/* ---------------- linhas de lançamento ---------------- */

export function txRow(tx, onClick) {
  const meta = txMeta(tx.type);
  const incoming = store.signedAmount(tx) > 0;
  const outgoing = store.signedAmount(tx) < 0;
  const signed = outgoing ? '-' : incoming ? '+' : '';
  const amount = show(Math.abs(tx.amountCents), tx.currency || 'BRL');
  const hint = otherHint(tx.amountCents, tx.currency || 'BRL');
  const node = el(`
    <button class="tx" type="button">
      <span class="glyph ${incoming ? 'in' : ''}">${icon(meta.icon)}</span>
      <span class="main">
        <span class="t">${esc(tx.title || meta.label)}</span>
        <span class="s">${esc(tx.subtitle || new Date(tx.at).toLocaleDateString('pt-BR'))}${tx.status === 'scheduled' ? ' • agendado' : tx.status === 'failed' ? ' • não enviado' : ''}</span>
      </span>
      <span class="v ${incoming ? 'in' : ''}">${signed ? `${signed}${amount}` : esc(tx.subtitleExtra || amount)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    </button>`);
  if (tx.status === 'failed') node.querySelector('.v').style.color = 'var(--danger)';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

export function accountLine() {
  return `${BANK.short} • ${BANK.accountDisplay}`;
}

export { BANK, icon, esc, toast };
