// Onboarding, criação de conta, senha e tela de bloqueio.
import { icon } from '../ui/icons.js';
import { actionSheet, alert, el, esc } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { APP_NAME, DEFAULT_USER } from '../logic/rules.js';
import { S, cancelAuthorize, errorText } from '../ui/shared.js';
import { biometricAvailable, enrollBiometric } from '../logic/security.js';
import { formatKey, isValidCPF, keyLabel } from '../logic/pix.js';

const MARK = `
<svg viewBox="0 0 64 64" class="mark" aria-hidden="true">
  <circle cx="32" cy="32" r="30" fill="#ffbf00"/>
  <g fill="none" stroke="#0a5738" stroke-width="3.4" stroke-linecap="round">
    <path d="M32 15c4.6 4.4 4.6 11 0 15.4C27.4 26 27.4 19.4 32 15z" fill="#0a5738" stroke="none"/>
    <path d="M20 26c6.2 2 9.8 7.6 8.6 13.6-6.2-2-9.8-7.6-8.6-13.6z" fill="#0a5738" stroke="none"/>
    <path d="M44 26c-6.2 2-9.8 7.6-8.6 13.6 6.2-2 9.8-7.6 8.6-13.6z" fill="#0a5738" stroke="none"/>
    <path d="M32 30v18" stroke="#0a5738"/>
  </g>
</svg>`;

export const screens = {
  onboarding: () => ({
    transparentNav: true,
    live: false,
    hideTabbar: true,
    content: () => `
      <div class="onboard">
        <div class="onboard-mark">${MARK}</div>
        <h1>${APP_NAME}</h1>
        <p>Um banco digital completo no celular: Pix, boleto, cartão, caixinhas e conta em euro.</p>
        <div class="onboard-points">
          <div>${icon('lock')}<span>Roda sem internet e sem cadastro em servidor</span></div>
          <div>${icon('euro')}<span>Mostre tudo em real ou em euro quando quiser</span></div>
          <div>${icon('shield')}<span>Seus dados ficam só neste aparelho</span></div>
        </div>
        <div class="onboard-foot">
          <button class="btn primary" data-action="start">Criar minha conta</button>
        </div>
      </div>`,
    mount: (node) => {
      node.querySelector('[data-action]')?.addEventListener('click', () => Router.push('signup'));
    },
  }),

  signup: () => {
    let name = '';
    let email = '';
    let error = '';
    return {
      title: 'Sua conta',
      live: false,
      hideTabbar: true,
      content: () => `
        <div class="scroll">
          <div class="large-title">Como você<br>se chama?</div>
          <p class="subtitle" style="margin:0 0 18px">Usamos o nome nos comprovantes e na sua chave de CPF.</p>
          <div class="form">
            <div class="field">
              <label for="nm">Nome completo</label>
              <input id="nm" name="name" type="text" value="${esc(name)}" autocomplete="name" placeholder="Como no documento">
            </div>
            <div class="field">
              <label for="em">E-mail (opcional)</label>
              <input id="em" name="email" type="email" inputmode="email" value="${esc(email)}" placeholder="voce@email.com">
            </div>
            ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          </div>
        </div>
        <div class="footer-bar"><button class="btn primary" data-next>Continuar</button></div>`,
      mount: (node, frame) => {
        node.querySelector('#nm')?.addEventListener('input', (e) => { name = e.target.value; });
        node.querySelector('#em')?.addEventListener('input', (e) => { email = e.target.value; });
        node.querySelector('[data-next]')?.addEventListener('click', async () => {
          if (String(name).trim().split(/\s+/).filter(Boolean).length < 2) {
            error = 'Escreva nome e sobrenome.';
            Router.refreshTop();
            return;
          }
          error = '';
          await store.createAccount({ name, email });
          Router.replace('setPassword');
        });
      },
    };
  },

  setPassword: () => {
    let stage = 'set';
    let first = '';
    return {
      transparentNav: true,
      live: false,
      hideTabbar: true,
      content: () => `
        <div class="pad-screen">
          <div class="pad-head">
            <div class="pad-kicker">${APP_NAME}</div>
            <div class="pad-title">${stage === 'set' ? 'Crie sua senha' : 'Confirme a senha'}</div>
            <div class="pad-msg" data-msg>${stage === 'set' ? '6 dígitos para abrir o app e autorizar pagamentos.' : 'Digite a mesma senha de novo.'}</div>
            <div data-dots class="dots">${Array.from({ length: 6 }, () => '<i></i>').join('')}</div>
          </div>
          <div data-pad></div>
        </div>`,
      mount: (node) => {
        let value = '';
        let busy = false;
        const paint = () => node.querySelectorAll('[data-dots] i').forEach((d, i) => d.classList.toggle('fill', i < value.length));
        const setMsg = (text) => {
          const target = node.querySelector('[data-msg]');
          if (target) target.textContent = text;
        };
        const pad = el('<div class="keypad"><div class="keypad-grid"></div></div>');
        const grid = pad.querySelector('.keypad-grid');
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'dot', '0', 'del'].forEach((key) => {
          const btn = el(`<button class="key ${key === 'del' ? 'fn' : 'plain'}" data-k="${key}">${key === 'del' ? '⌫' : key === 'dot' ? '' : key}</button>`);
          if (key === 'dot') btn.classList.add('hidden');
          btn.addEventListener('click', async () => {
            if (busy) return;
            if (key === 'del') {
              value = value.slice(0, -1);
              paint();
              return;
            }
            if (value.length >= 6) return;
            value += key;
            paint();
            if (value.length < 6) return;
            if (stage === 'set') {
              first = value;
              value = '';
              stage = 'confirm';
              busy = true;
              setTimeout(() => {
                busy = false;
                Router.refreshTop();
              }, 180);
              return;
            }
            if (value !== first) {
              setMsg('As senhas não conferem. Comece de novo.');
              value = '';
              first = '';
              stage = 'set';
              paint();
              return;
            }
            busy = true;
            await finish(value);
          });
          grid.append(btn);
        });
        node.querySelector('[data-pad]').append(pad);

        async function finish(password) {
          await store.setPassword(password);
          store.markActive();
          await askBiometric();
          Router.dismissAll();
          Router.repaint();
        }

        async function askBiometric() {
          const avail = biometricAvailable();
          if (!avail.ok) return false;
          const wanted = await alert({
            title: 'Usar Face ID?',
            message: 'Abre o app e confirma pagamentos sem digitar a senha.',
            columns: true,
            actions: [{ label: 'Agora não', value: false }, { label: 'Ativar', value: true, bold: true }],
          });
          if (!wanted) return false;
          try {
            const id = await enrollBiometric(S().profile.name);
            store.setBiometric(id);
            return true;
          } catch (err) {
            await alert({ title: 'Face ID não ativado', message: `${String(err?.message || err)}\nVocê ainda pode usar a senha de 6 dígitos.` });
            return false;
          }
        }
      },
    };
  },

  login: () => {
    const flags = store.readDeviceFlags();
    let kind = flags.identKind === 'email' ? 'email' : 'cpf';
    let remember = flags.remember !== false;
    let ident = remember
      ? flags.identValue || (kind === 'email' ? DEFAULT_USER.email : formatKey('cpf', DEFAULT_USER.cpfDigits))
      : '';
    let stage = 'identify';
    let error = '';
    let msg = '';

    const ready = () => (kind === 'cpf' ? ident.replace(/\D/g, '').length === 11 : ident.trim().length > 3);
    const label = () => (kind === 'cpf' ? 'CPF' : 'E-mail');

    const identifyView = () => `
      <div class="scroll">
        <div class="large-title">Acesse sua<br>conta</div>
        <div class="form" style="margin-top:26px">
          <button class="field pick" type="button" data-kind>
            <label>Opções de acesso</label>
            <span class="pick-row"><span>${esc(keyLabel(kind))}</span>${icon('chevdown')}</span>
          </button>
          <div class="field ${error ? 'error' : ''}">
            <label for="ident">${label()}</label>
            <input id="ident" type="text" inputmode="${kind === 'cpf' ? 'numeric' : 'email'}" value="${esc(ident)}"
              placeholder="${kind === 'cpf' ? '000.000.000-00' : 'voce@email.com'}"
              autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false">
          </div>
          ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          <button class="check ${remember ? 'on' : ''}" type="button" data-remember aria-pressed="${remember}">
            <span class="box">${icon('check')}</span><span>Lembrar meus dados</span>
          </button>
        </div>
      </div>
      <div class="footer-bar"><button class="btn primary ${ready() ? '' : 'off'}" data-login>Acessar</button></div>`;

    const passwordView = () => `
      <div class="pad-screen">
        <div class="pad-head">
          <div class="pad-kicker">${APP_NAME}</div>
          <div class="pad-title">${esc(store.getState().profile.firstName || 'Sua conta')}</div>
          <div class="pad-msg" data-msg>${esc(msg || `Senha de 6 dígitos`)}</div>
          <div data-dots class="dots">${Array.from({ length: 6 }, () => '<i></i>').join('')}</div>
        </div>
        <div data-pad></div>
        <div class="pad-foot">
          ${store.getState().security.biometric ? '<button class="btn primary" data-bio>Usar Face ID</button>' : ''}
          <button class="btn ghost" data-back>Trocar ${label()}</button>
          <button class="btn ghost" data-forgot>Esqueci minha senha</button>
        </div>
      </div>`;

    return {
      transparentNav: true,
      live: false,
      hideTabbar: true,
      rootNoBack: true,
      content: () => (stage === 'identify' ? identifyView() : passwordView()),
      mount: (node) => (stage === 'identify' ? mountIdentify(node) : mountPassword(node)),
    };

    function mountIdentify(node) {
      const input = node.querySelector('#ident');
      const cta = node.querySelector('[data-login]');
      const paint = () => cta?.classList.toggle('off', !ready());
      const maskCpf = (d) => {
        if (d.length <= 3) return d;
        if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
        if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
      };
      const clearError = () => {
        error = '';
        node.querySelector('.field-hint')?.remove();
        node.querySelector('.field.error')?.classList.remove('error');
      };

      input?.addEventListener('input', (ev) => {
        let v = ev.target.value;
        if (kind === 'cpf') {
          v = maskCpf(v.replace(/\D/g, '').slice(0, 11));
          ev.target.value = v;
        }
        ident = v;
        clearError();
        paint();
      });
      node.querySelector('[data-remember]')?.addEventListener('click', (ev) => {
        remember = !remember;
        ev.currentTarget.classList.toggle('on', remember);
        ev.currentTarget.setAttribute('aria-pressed', String(remember));
        if (!remember) ident = '';
        if (input) input.value = ident;
        paint();
      });
      node.querySelector('[data-kind]')?.addEventListener('click', async () => {
        const pick = await actionSheet({
          title: 'Opções de acesso',
          options: [
            { label: 'CPF', subtitle: 'Somente números', value: 'cpf' },
            { label: 'E-mail', subtitle: 'A chave cadastrada na conta', value: 'email' },
            { label: 'Cancelar', cancel: true },
          ],
        });
        if (!pick || pick === kind) return;
        kind = pick;
        ident = remember ? (pick === 'email' ? DEFAULT_USER.email : formatKey('cpf', DEFAULT_USER.cpfDigits)) : '';
        error = '';
        Router.refreshTop();
      });
      cta?.addEventListener('click', () => {
        const digits = ident.replace(/\D/g, '');
        if (kind === 'cpf') {
          if (digits.length !== 11 || !isValidCPF(digits)) {
            error = 'Confira os números do CPF.';
            Router.refreshTop();
            return;
          }
          if (digits !== String(store.getState().profile.cpf || '').replace(/\D/g, '')) {
            error = 'Este CPF não tem conta neste aparelho.';
            Router.refreshTop();
            return;
          }
        } else {
          const v = ident.trim().toLowerCase();
          if (v !== String(store.getState().profile.email || '').toLowerCase()) {
            error = 'Este e-mail não tem conta neste aparelho.';
            Router.refreshTop();
            return;
          }
        }
        store.writeDeviceFlags({ identKind: kind, identValue: ident, remember });
        error = '';
        msg = '';
        stage = 'password';
        Router.refreshTop();
      });
      requestAnimationFrame(() => input?.focus());
    }

    function mountPassword(node) {
      let value = '';
      const paint = () => node.querySelectorAll('[data-dots] i').forEach((d, i) => d.classList.toggle('fill', i < value.length));
      const setMsg = (text) => {
        const target = node.querySelector('[data-msg]');
        if (target) target.textContent = text;
      };
      const pad = el('<div class="keypad"><div class="keypad-grid"></div></div>');
      const grid = pad.querySelector('.keypad-grid');
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].forEach((key) => {
        const hasBio = Boolean(store.getState().security.biometric);
        const btn = el(`<button class="key ${key === 'del' || key === 'bio' ? 'fn' : ''}" data-k="${key}">${key === 'del' ? '⌫' : key === 'bio' ? (hasBio ? 'Face ID' : '') : key}</button>`);
        if (key === 'bio' && !hasBio) btn.classList.add('hidden');
        btn.addEventListener('click', async () => {
          if (key === 'del') {
            value = value.slice(0, -1);
            paint();
            return;
          }
          if (key === 'bio') {
            cancelAuthorize();
            await unlockWithFace();
            return;
          }
          if (value.length >= 6) return;
          value += key;
          paint();
          if (value.length === 6) {
            const res = await store.unlockWithPassword(value);
            if (res.ok) {
              Router.dismiss({ force: true });
              Router.repaint();
              store.markActive();
            } else {
              value = '';
              paint();
              setMsg(errorText(res));
            }
          }
        });
        grid.append(btn);
      });
      node.querySelector('[data-pad]').append(pad);

      async function unlockWithFace() {
        try {
          const { verifyBiometric } = await import('../logic/security.js');
          const ok = await verifyBiometric(store.getState().security.biometric);
          if (ok) {
            store.writeDeviceFlags({ locked: false, lastActiveAt: Date.now() });
            Router.dismiss({ force: true });
            Router.repaint();
          } else setMsg('Biometria não reconhecida.');
        } catch (err) {
          setMsg(String(err?.message || 'Biometria indisponível.').slice(0, 60));
        }
      }

      node.querySelector('[data-back]')?.addEventListener('click', () => {
        msg = '';
        stage = 'identify';
        Router.refreshTop();
      });
      node.querySelector('[data-bio]')?.addEventListener('click', unlockWithFace);
      node.querySelector('[data-forgot]')?.addEventListener('click', async () => {
        const go = await alert({
          title: 'Esqueceu a senha?',
          message: 'Os dados ficam só neste aparelho, então não existe recuperação por e-mail. A saída é restaurar a sua conta.',
          columns: true,
          actions: [{ label: 'Voltar', value: false }, { label: 'Restaurar conta', value: true, destructive: true }],
        });
        if (!go) return;
        const sure = await alert({
          title: 'Restaurar a conta?',
          message: 'Saldos, extrato, chaves e caixinhas voltam ao estado inicial e a senha volta a ser a padrão.',
          columns: true,
          actions: [{ label: 'Cancelar', value: false }, { label: 'Restaurar', value: true, destructive: true }],
        });
        if (!sure) return;
        store.resetAll();
        Router.resetAll();
        Router.present('login', {});
      });
    }
  },
};
