// Perfil, preferências, segurança, movimentar a conta e "sobre".
import { icon } from '../ui/icons.js';
import { alert, amountPad, confirm, copyText, el, esc, sheet, toast, toggle } from '../ui/kit.js';
import * as Router from '../ui/router.js';
import * as store from '../logic/store.js';
import { APP_NAME, APP_VERSION, BANK, BUILD, FX, YIELD } from '../logic/rules.js';
import { fmt } from '../logic/money.js';
import { DEMO_MERCHANTS } from '../logic/store.js';
import { biometricAvailable, enrollBiometric, verifyBiometric } from '../logic/security.js';
import { S, authorize, balanceHidden, errorText, ibanMasked, money, setRevealed, show } from '../ui/shared.js';

const CURRENCIES = [
  { id: 'BRL', label: 'Real brasileiro', symbol: 'R$', note: 'moeda da conta' },
  { id: 'EUR', label: 'Euro', symbol: '€', note: 'converte tudo pela cotação' },
];

const THEMES = [
  { id: 'auto', label: 'Automático', note: 'acompanha o iPhone' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
];

const AUTO_LOCK = [
  { seconds: 0, label: 'Nunca' },
  { seconds: 30, label: '30 s' },
  { seconds: 60, label: '1 min' },
  { seconds: 300, label: '5 min' },
];

export const screens = {
  profile: () => ({
    large: 'Você',
    back: false,
    rootNoBack: true,
    content: () => {
      const s = S();
      const displayName = s.settings.currency === 'EUR' ? 'Euro' : 'Real';
      return `
      <div class="scroll">
        <button class="row" data-open="editProfile" style="padding-left:0;padding-right:0">
          <span class="lead wide" style="width:52px;height:52px;border-radius:50%;font-size:19px;background:var(--brand);color:#fff">${esc(s.profile.initials || 'IP')}</span>
          <span class="main"><span class="t" style="font-size:18px;font-weight:600">${esc(s.profile.name)}</span><span class="s">IBAN ${esc(ibanMasked(s.accounts.eur.iban))} · CPF terminando ${esc(s.profile.cpf.slice(-2))}</span></span>
          ${icon('chevron', 'go')}
        </button>

        <div class="group">
          <div class="row">
            <span class="lead">${icon('wallet')}</span>
            <span class="main"><span class="t">Saldo em reais</span><span class="s">disponível para Pix e pagamentos</span></span>
            <span class="trailing num">${money(s.accounts.brl.cashCents, 'BRL')}</span>
          </div>
          <button class="row" data-open="eur">
            <span class="lead">${icon('euro')}</span>
            <span class="main"><span class="t">Conta em euro · referência de teste</span><span class="s">IBAN ${esc(ibanMasked(s.accounts.eur.iban))}</span></span>
            <span class="trailing num">${money(s.accounts.eur.cashCents, 'EUR')}</span>
          </button>
          <button class="row" data-open="boxes">
            <span class="lead">${icon('safe')}</span>
            <span class="main"><span class="t">Caixinhas</span><span class="s">${s.boxes.length} ativas · ${(YIELD.cdiAnnualPct / 100).toFixed(2).replace('.', ',')}% CDI</span></span>
            <span class="trailing num">${money(s.boxes.reduce((a, b) => a + b.balanceCents, 0), 'BRL')}</span>
          </button>
        </div>

        <div class="section-label">Preferências</div>
        <div class="group">
          <button class="row" data-open="settings">
            <span class="lead">${icon('cog')}</span>
            <span class="main"><span class="t">Moeda e aparência</span><span class="s">exibindo em ${displayName}${balanceHidden() ? ' · valores ocultos' : ''}</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-open="securityScreen">
            <span class="lead">${icon('shield')}</span>
            <span class="main"><span class="t">Segurança</span><span class="s">senha${s.security.biometric ? ' · Face ID ativo' : ' · Face ID desligado'}</span></span>
            ${icon('chevron', 'go')}
          </button>
          <div class="row">
            <span class="lead">${icon('eye')}</span>
            <span class="main"><span class="t">Ocultar valores na abertura</span></span>
            <span class="trailing" data-hide></span>
          </div>
          <button class="row" data-open="fxRate">
            <span class="lead">${icon('swap')}</span>
            <span class="main"><span class="t">Cotação do euro</span><span class="s">${esc(fmt(s.settings.fx.rate, 'BRL'))} por € 1,00${s.settings.fx.manual ? ' · manual' : ''}</span></span>
            ${icon('chevron', 'go')}
          </button>
        </div>

        <div class="section-label">Demonstração</div>
        <div class="group">
          <button class="row" data-open="demoTools">
            <span class="lead">${icon('grid')}</span>
            <span class="main"><span class="t">Movimentar a conta</span><span class="s">entrada de dinheiro, compra no crédito, restaurar</span></span>
            ${icon('chevron', 'go')}
          </button>
          <button class="row" data-open="about">
            <span class="lead">${icon('info')}</span>
            <span class="main"><span class="t">Sobre este app</span><span class="s">como ele funciona sem internet</span></span>
            ${icon('chevron', 'go')}
          </button>
        </div>

        <div class="group">
          <button class="row danger" data-logout>
            <span class="lead">${icon('out')}</span>
            <span class="main"><span class="t">Sair da conta</span><span class="s">pede a senha na volta</span></span>
          </button>
        </div>
      </div>`;
    },
    mount: (node) => {
      const hideHost = node.querySelector('[data-hide]');
      hideHost.append(toggle(!S().security.hideBalance, (value) => {
        store.setHideBalance(!value);
        setRevealed(Boolean(value));
        toast(value ? 'Valores visíveis' : 'Valores ocultos');
        Router.refreshTop();
      }));
      node.addEventListener('click', (ev) => {
        const open = ev.target.closest('[data-open]');
        if (open) {
          Router.push(open.dataset.open);
          return;
        }
        if (ev.target.closest('[data-logout]')) {
          store.lockApp();
          Router.dismiss({ force: true }).then(() => Router.present('login', {}));
        }
      });
    },
  }),

  settings: () => ({
    title: 'Preferências',
    content: () => {
      const s = S();
      return `
      <div class="scroll">
        <div class="section-label">Moeda de exibição</div>
        <div class="group">
          ${CURRENCIES.map((c) => `
            <button class="row" data-cur="${c.id}">
              <span class="lead">${icon(c.id === 'EUR' ? 'euro' : 'wallet')}</span>
              <span class="main"><span class="t">${c.label}</span><span class="s">${c.note}</span></span>
              <span class="trailing">${s.settings.currency === c.id ? icon('check') : `<b class="num">${esc(show(s.accounts.brl.cashCents, 'BRL').replace(/R\$|€/g, '').trim())} ${c.symbol}</b>`}</span>
            </button>`).join('')}
        </div>

        <div class="section-label">Aparência</div>
        <div class="segmented">
          ${THEMES.map((t) => `<button class="${(s.settings.theme || 'auto') === t.id ? 'on' : ''}" data-theme="${t.id}">${t.label}</button>`).join('')}
        </div>

        <div class="section-label">Privacidade</div>
        <div class="group">
          <div class="row">
            <span class="lead">${icon('eye-off')}</span>
            <span class="main"><span class="t">Ocultar valores ao abrir</span><span class="s">mostre com o olho na inicial</span></span>
            <span class="trailing" data-hide></span>
          </div>
        </div>
      </div>`;
    },
    mount: (node) => {
      node.querySelector('[data-hide]')?.append(toggle(!S().security.hideBalance, (value) => {
        store.setHideBalance(!value);
        toast(value ? 'Valores visíveis' : 'Valores ocultos');
      }));
      node.addEventListener('click', (ev) => {
        const cur = ev.target.closest('[data-cur]');
        if (cur) {
          store.setCurrency(cur.dataset.cur);
          Router.refreshTop();
          return;
        }
        const th = ev.target.closest('[data-theme]');
        if (th) {
          store.setTheme(th.dataset.theme);
          document.dispatchEvent(new Event('ipe:theme'));
          Router.refreshTop();
        }
      });
    },
  }),

  securityScreen: () => ({
    title: 'Segurança',
    content: () => {
      const s = S();
      return `
      <div class="scroll">
        <div class="group">
          <button class="row" data-pass>
            <span class="lead">${icon('lock')}</span>
            <span class="main"><span class="t">Trocar a senha de 6 dígitos</span><span class="s">usada em Pix, pagamentos e câmbio</span></span>
          </button>
          <div class="row">
            <span class="lead">${icon('face')}</span>
            <span class="main"><span class="t">Face ID</span><span class="s">${s.security.biometric ? 'desbloqueia e autoriza pagamentos' : 'ligue para não digitar a senha'}</span></span>
            <span class="trailing" data-bio></span>
          </div>
        </div>

        <div class="section-label">Bloqueio automático</div>
        <div class="segmented">
          ${AUTO_LOCK.map((o) => `<button class="${Number(s.security.autoLockSeconds) === o.seconds ? 'on' : ''}" data-lock="${o.seconds}">${o.label}</button>`).join('')}
        </div>

        <div class="section-label">O que é guardado</div>
        <div class="group">
          <div class="row"><span class="main"><span class="t">Saldo em reais</span></span><span class="trailing num">${esc(fmt(s.accounts.brl.cashCents))}</span></div>
          <div class="row"><span class="main"><span class="t">Lançamentos no extrato</span></span><span class="trailing">${s.tx.length}</span></div>
          <div class="row"><span class="main"><span class="t">Chaves Pix cadastradas</span></span><span class="trailing">${s.pix.keys.length}</span></div>
          <div class="row"><span class="main"><span class="t">Identificador deste aparelho</span></span><span class="trailing selectable mono">${esc(s.device.id)}</span></div>
        </div>
      </div>`;
    },
    mount: (node) => {
      const s = S();
      node.querySelector('[data-bio]').append(toggle(Boolean(s.security.biometric), async (value) => {
        if (!value) {
          store.setBiometric(null);
          toast('Face ID desligado');
          Router.refreshTop();
          return;
        }
        const avail = biometricAvailable();
        if (!avail.ok) {
          await alert({ title: 'Face ID indisponível', message: `${avail.reason}. No iPhone, abra o app pela Tela de Início (não pelo Safari) para usar a biometria.` });
          Router.refreshTop();
          return;
        }
        try {
          const id = await enrollBiometric(S().profile.name);
          store.setBiometric(id);
          toast('Face ID ativado');
        } catch (err) {
          await alert({ title: 'Não foi possível ativar', message: String(err?.message || err).slice(0, 160) });
        }
        Router.refreshTop();
      }));
      node.querySelector('[data-pass]').addEventListener('click', () => changePasswordFlow());
      node.addEventListener('click', (ev) => {
        const lock = ev.target.closest('[data-lock]');
        if (lock) {
          store.setAutoLock(Number(lock.dataset.lock));
          toast('Bloqueio automático atualizado');
          Router.refreshTop();
        }
      });
    },
  }),

  editProfile: () => {
    const p = S().profile;
    let name = p.name;
    let email = p.email || '';
    let phone = p.phone || '';
    let error = '';
    return {
      title: 'Dados pessoais',
      live: false,
      content: () => `
        <div class="scroll">
          <div class="form">
            <div class="field"><label for="nm">Nome completo</label><input id="nm" value="${esc(name)}"></div>
            <div class="field"><label for="em">E-mail</label><input id="em" type="email" value="${esc(email)}"></div>
            <div class="field"><label for="ph">Telefone</label><input id="ph" inputmode="tel" value="${esc(phone)}"></div>
            ${error ? `<div class="field-hint error">${esc(error)}</div>` : ''}
          </div>
          <div class="section-label">Dados da conta (não editáveis)</div>
          <div class="group">
            <div class="row"><span class="main"><span class="t">Instituição</span></span><span class="trailing">${esc(BANK.name)}</span></div>
            <div class="row"><span class="main"><span class="t">Código</span></span><span class="trailing num">${esc(BANK.code)}</span></div>
            <div class="row"><span class="main"><span class="t">Agência e conta</span><span class="s">conta em reais</span></span><span class="trailing num selectable">${esc(BANK.accountDisplay)}</span></div>
            <div class="row"><span class="main"><span class="t">IBAN</span><span class="s">conta em euro · zona SEPA</span></span><span class="trailing num selectable">${esc(BANK.eurIbanDisplay)}</span></div>
            <div class="row"><span class="main"><span class="t">CPF</span></span><span class="trailing num selectable">${esc(p.cpf)}</span></div>
          </div>
          <button class="btn tonal" data-copy style="margin-top:14px">${icon('copy')} Copiar dados da conta</button>
        </div>
        <div class="footer-bar"><button class="btn primary" data-save>Salvar dados</button></div>`,
      mount: (node) => {
        node.querySelector('#nm').addEventListener('input', (ev) => { name = ev.target.value; });
        node.querySelector('#em').addEventListener('input', (ev) => { email = ev.target.value; });
        node.querySelector('#ph').addEventListener('input', (ev) => { phone = ev.target.value; });
        node.querySelector('[data-copy]').addEventListener('click', async () => {
          const text = `${BANK.name}\nConta em reais: ${BANK.accountDisplay}\nConta em euro: ${BANK.eurIbanDisplay}\nTitular: ${name}`;
          toast((await copyText(text)) ? 'Dados copiados' : 'Não foi possível copiar');
        });
        node.querySelector('[data-save]').addEventListener('click', () => {
          const res = store.updateProfile({ name, email, phone });
          if (!res.ok) {
            error = errorText(res);
            Router.refreshTop();
            return;
          }
          toast('Dados atualizados');
          Router.pop({ force: true });
        });
      },
    };
  },

  demoTools: () => {
    let holder = 'Paula Nogueira';
    let merchant = DEMO_MERCHANTS[0];
    return {
      title: 'Movimentar a conta',
      live: false,
      content: () => `
        <div class="scroll">
          
          <div class="section-label">Entrada de dinheiro</div>
          <div class="group">
            <button class="row" data-incoming>
              <span class="lead">${icon('download')}</span>
              <span class="main"><span class="t">Receber um Pix</span><span class="s">de ${esc(holder)}</span></span>
              ${icon('chevron', 'go')}
            </button>
            <button class="row" data-purchase>
              <span class="lead">${icon('card')}</span>
              <span class="main"><span class="t">Compra no crédito</span><span class="s">gera item na fatura</span></span>
              ${icon('chevron', 'go')}
            </button>
          </div>
          <div class="section-label">Dados</div>
          <div class="group">
            <button class="row" data-reset>
              <span class="lead">${icon('refresh')}</span>
              <span class="main"><span class="t">Restaurar minha conta</span><span class="s">apaga tudo neste aparelho e recomeça</span></span>
            </button>
          </div>
        </div>`,
      mount: (node) => {
        node.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-incoming]')) incomingSheet((cents, who) => {
            const res = store.simulateIncoming({ holder: who, amountCents: cents });
            if (!res.ok) toast(errorText(res));
            else toast(`${fmt(cents)} entraram na conta`);
          });
          if (ev.target.closest('[data-purchase]')) purchaseSheet(merchant, (value, m) => {
            merchant = m;
            const intl = /Amazon|Booking/.test(m);
            const res = store.simulateCardPurchase({ merchant: m, amountCents: value, international: intl });
            if (!res.ok) toast(errorText(res));
            else toast(`${fmt(value)} na fatura${intl ? ' (internacional)' : ''}`);
          });
          if (ev.target.closest('[data-reset]')) resetFlow();
        });
      },
    };
  },

  about: () => {
    const s = S();
    let size = 0;
    try {
      size = (localStorage.getItem('ipe.bank.state.v1') || '').length;
    } catch {
      size = 0;
    }
    return {
      title: 'Sobre',
      content: () => `
        <div class="scroll">
          <div class="receipt-hero">
            <div class="avatar-lg">${icon('safe')}</div>
            <div class="who">${esc(APP_NAME)}</div>
            <div class="amount" style="font-size:22px;margin-top:2px">versão ${esc(APP_VERSION)}</div>
          </div>
          <div class="card">
            <div class="money-row"><span class="k">Modo de operação</span><span class="v">100% offline</span></div>
            <div class="money-row"><span class="k">Banco de dados</span><span class="v">nenhum</span></div>
            <div class="money-row"><span class="k">Onde ficam os dados</span><span class="v">neste iPhone</span></div>
            <div class="money-row mut"><span class="k">Espaço usado</span><span class="v num">${(size / 1024).toFixed(1).replace('.', ',')} KB</span></div>
            <div class="money-row mut"><span class="k">Compilação</span><span class="v mono">${esc(BUILD)}</span></div>
          </div>
          <div class="section-label">Como este app funciona</div>
          <div class="group">
            ${[
              ['check', 'Regras reais', 'Chave Pix com dígito verificador, BR Code com CRC16, boleto com módulo 10/11 e fator de vencimento, IOF de câmbio, limites noturnos do Bacen, rendimento em % do CDI com dias úteis.'],
              ['euro', 'Cotação fixa no app', `1 euro = ${esc(fmt(s.settings.fx.rate, 'BRL'))} (21/10/2026). Dá para trocar em Cotação do euro.`],
              ['wallet', 'Saldo de verdade para você', 'O saldo é seu: muda com cada Pix, boleto, câmbio e aporte que você faz aqui, e continua no aparelho quando você fecha o app.'],
              ['lock', 'Nada sai do iPhone', 'Sem servidor, sem cadastro, sem telemetria. A conexão serve só para a primeira instalação.'],
            ].map(([ico, title, text]) => `
              <div class="row"><span class="lead">${icon(ico)}</span><span class="main"><span class="t">${title}</span><span class="s">${text}</span></span></div>`).join('')}
          </div>
          <div class="section-label">Taxas e regras em uso</div>
          <div class="card">
            <div class="money-row"><span class="k">CDI</span><span class="v num">${(YIELD.cdiAnnualPct / 100).toFixed(2).replace('.', ',')}% a.a.</span></div>
            <div class="money-row"><span class="k">Selic</span><span class="v num">${(YIELD.selicAnnualPct / 100).toFixed(2).replace('.', ',')}% a.a.</span></div>
            <div class="money-row"><span class="k">IOF câmbio</span><span class="v num">${(FX.iofExchange / 100).toFixed(2).replace('.', ',')}%</span></div>
            <div class="money-row"><span class="k">IOF cartão internacional</span><span class="v num">${(FX.iofCard / 100).toFixed(2).replace('.', ',')}%</span></div>
            <div class="money-row"><span class="k">Limite Pix noturno padrão</span><span class="v num">${esc(fmt(100000))}</span></div>
          </div>
        </div>`,
    };
  },
};

/* ---------------- fluxos auxiliares ---------------- */

function changePasswordFlow() {
  let current = '';
  let next = '';
  const body = el(`<div class="sheet-pad">
    <div class="form">
      <div class="field"><label for="c1">Senha atual</label><input id="c1" type="password" inputmode="numeric" maxlength="6" placeholder="6 dígitos"></div>
      <div class="field"><label for="c2">Nova senha</label><input id="c2" type="password" inputmode="numeric" maxlength="6" placeholder="6 dígitos"></div>
      <div class="field"><label for="c3">Repita a nova</label><input id="c3" type="password" inputmode="numeric" maxlength="6" placeholder="6 dígitos"></div>
      <p class="field-hint error" data-err></p>
    </div>
    <button class="btn primary" id="save" style="margin-top:8px">Trocar senha</button>
  </div>`);
  const handle = sheet({ title: 'Trocar a senha', body });
  requestAnimationFrame(async () => {
    const err = document.querySelector('[data-err]');
    document.getElementById('save').addEventListener('click', async () => {
      current = document.getElementById('c1').value;
      next = document.getElementById('c2').value;
      const repeat = document.getElementById('c3').value;
      if (!/^\d{6}$/.test(next)) {
        err.textContent = 'A nova senha precisa ter 6 dígitos.';
        return;
      }
      if (next !== repeat) {
        err.textContent = 'A repetição não confere.';
        return;
      }
      const res = await store.changePassword(current, next);
      if (!res.ok) {
        err.textContent = errorText(res);
        return;
      }
      handle.close();
      toast('Senha trocada');
    });
  });
}

function incomingSheet(onDone) {
  let cents = 0;
  let who = 'Paula Nogueira';
  const body = el(`<div class="sheet-pad">
    <div class="field"><label for="who">Quem envia</label><input id="who" value="${esc(who)}"></div>
    <div id="pad" style="text-align:center"></div>
    <button class="btn primary" id="go">Receber</button>
  </div>`);
  const handle = sheet({ title: 'Receber um Pix', body });
  requestAnimationFrame(() => {
    const host = document.getElementById('pad');
    const pad = amountPad({ currency: 'BRL', initial: 0, onChange: (c) => { cents = c; } });
    host.append(pad.display, pad.pad);
    document.getElementById('who').addEventListener('input', (ev) => { who = ev.target.value; });
    document.getElementById('go').addEventListener('click', () => {
      if (cents <= 0) {
        toast('Digite o valor.');
        return;
      }
      handle.close();
      onDone(cents, who);
    });
  });
}

function purchaseSheet(initialMerchant, onDone) {
  let cents = 0;
  let merchant = initialMerchant;
  const body = el(`<div class="sheet-pad">
    <div class="chips" id="merch">${DEMO_MERCHANTS.map((m) => `<button class="chip ${m === merchant ? 'on' : ''}" data-m="${esc(m)}">${esc(m)}</button>`).join('')}</div>
    <div id="pad" style="text-align:center"></div>
    <button class="btn primary" id="go">Lançar na fatura</button>
  </div>`);
  const handle = sheet({ title: 'Compra no crédito', body });
  requestAnimationFrame(() => {
    const host = document.getElementById('pad');
    const pad = amountPad({ currency: 'BRL', initial: 0, onChange: (c) => { cents = c; } });
    host.append(pad.display, pad.pad);
    document.getElementById('merch').addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-m]');
      if (!chip) return;
      merchant = chip.dataset.m;
      document.querySelectorAll('#merch .chip').forEach((c) => c.classList.toggle('on', c === chip));
    });
    document.getElementById('go').addEventListener('click', () => {
      if (cents <= 0) {
        toast('Digite o valor.');
        return;
      }
      handle.close();
      onDone(cents, merchant);
    });
  });
}

async function resetFlow() {
  const go = await confirm({
    title: 'Restaurar a conta?',
    message: 'Extrato, chaves, caixinhas e saldo voltam ao estado inicial. Isso apaga os dados deste aparelho.',
    confirmLabel: 'Apagar e recomeçar',
    destructive: true,
  });
  if (!go) return;
  store.resetAll();
  Router.resetAll();
  Router.present('onboarding', {});
}
