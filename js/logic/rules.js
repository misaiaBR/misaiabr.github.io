// Regras e números usados pelo app. Pesquisa feita em 21/10/2026 — ver README "Fontes".
// O app roda 100% offline: nada aqui é buscado na rede em tempo de execução.

export const APP_NAME = 'Ipê Banco Digital';
export const APP_BRAND_KEY = 'ipe';
export const APP_VERSION = '1.3.0';
export const BUILD = '2026.10.22-2';
/** Caminho do app no navegador — aparece na barra de endereço. */
export const SITE_PATH = '/contas/conta-corrente/';

export const BANK = {
  name: APP_NAME,
  short: 'Ipê',
  address: [
    'Alameda Grajaú, 614 - Sala 904',
    'Alphaville Industrial',
    'Barueri - SP',
    'CEP 06454-050',
  ],
  code: '819', // código da instituição — 819 está livre na lista do Bacen
  ispb: '99999999', // ISPB usado no E2E dos comprovantes
  agency: '0001',
  account: '48230-7',
  accountDisplay: 'Ag 0001 · C 48230-7',
  // Conta em euro: zona SEPA, IBAN belga (16 caracteres, dígito de controle mod 97).
  eurIban: 'BE32967428219802',
  eurIbanDisplay: 'BE32 9674 2821 9802',
  eurBank: 'Ipê Banco Europeu S.A.',
  eurBic: 'KREDBEBB',
};

/** Titular da conta: criado no aparelho na primeira abertura e reposto em toda atualização. */
export const DEFAULT_USER = {
  name: 'Vitor Messias',
  firstName: 'Vitor',
  initials: 'VM',
  cpf: '510.956.828-65',
  cpfDigits: '51095682865',
  email: 'm.vitormessias@gmail.com',
  phone: '+55 (11) 97777-1024',
  phoneKey: '+5511977771024',
  password: '123456',
};

export const PIX = {
  gui: 'br.gov.bcb.pix',
  mcc: '0000',
  currencyCode: '986',
  country: 'BR',
  nightStartHour: 20,
  nightEndHour: 6,
  nightDefaultLimitCents: 100_000, // R$ 1.000 somando a janela noturna
  dayDefaultLimitCents: 3_000_000, // R$ 30.000 por dia — limite padrão do app (configurável)
  increaseTakesHours: 24, // pedido de aumento só vale depois disso
  decreaseIsImmediate: true,
  maxKeysPerPerson: 5,
  maxCharsPerSegment: 99,
  e2eLength: 32,
  txidMax: 25,
  nameMax: 25,
  cityMax: 15,
  descriptionMax: 40,
};

export const FX = {
  // Cotação comercial de referência: 1 EUR = 5,6440 BRL (21/10/2026).
  defaultRateBRLPerEUR: 56440, // centavos de BRL por 1 EUR
  buySpread: 220, // compra: 2,20% acima da referência
  sellSpread: 220, // venda: 2,20% abaixo da referência
  iofExchange: 350, // IOF câmbio: 3,50%
  iofCard: 350, // IOF compra internacional no cartão: 3,50%
  minBuyEurCents: 1000, // € 10,00
  maxDailyBuyEurCents: 1_000_000, // € 10.000,00 por dia
  rateUpdatedAt: '2026-10-21',
  iofNote:
    'IOF de 3,50% sobre operações de câmbio, em vigor desde as mudanças de maio/2025.',
};

/** Percentual em centésimos: 350 = 3,50%. */
export const pct = (value) => toNumber(value) / 10000;
export function pctLabel(value, digits = 2) {
  return (toNumber(value) / 100).toFixed(digits).replace('.', ',');
}
function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const YIELD = {
  cdiAnnualPct: 1447, // CDI 14,47% a.a. (21/10/2026)
  selicAnnualPct: 1375, // Selic 13,75% a.a. (Copom 16/09/2026)
  businessDaysPerYear: 252,
  irTable: [
    { untilDays: 30, rate: 2230 }, // 22,30%
    { untilDays: 60, rate: 2000 }, // 20,00%
    { untilDays: 180, rate: 1800 }, // 18,00%
    { untilDays: Infinity, rate: 1500 }, // 15,00%
  ],
};

export const BOLETO = {
  oldFactorBase: '1997-05-01', // fator 1
  resetFactorBase: '2025-02-22', // a partir daqui o fator recomeçou em 1000
  resetFactorValue: 1000,
  maxFactor: 9999,
  banks: {
    '001': 'Banco do Brasil S.A.',
    '033': 'Santander Brasil S.A.',
    '104': 'Caixa Econômica Federal',
    '237': 'Bradesco S.A.',
    '260': 'Nu Pagamentos S.A. (PicPay)',
    '341': 'Itaú Unibanco S.A.',
    '077': 'BANCO INTER',
    '085': 'C6 BANK S.A.',
    '208': 'BTG PACTUAL S.A.',
    '212': 'BANCO ORIGINAL',
    '318': 'BANCO BMG S.A.',
    '336': 'CIELO S.A.',
  },
};

export const CARD = {
  brand: 'MASTER',
  numberMasked: '•••• •••• •••• 4821',
  numberFull: '5412 7512 3456 7890', // gerado localmente, cartão de teste
  expiry: '10/30',
  cvv: '417',
  limitCents: 3_386_400, // R$ 33.864,00 = € 6.000,00 na cotação embutida
  invoiceOpenCents: 0, // fatura do ciclo fica quitada: o limite disponível é o total
};

// Metadados de cada tipo de lançamento: rótulo, ícone e como afeta o saldo.
export const TX_TYPES = {
  deposit: { label: 'Depósito', icon: 'download', dir: 1, cat: 'entrada' },
  pix_in: { label: 'Pix recebido', icon: 'pix', dir: 1, cat: 'entrada' },
  pix_out: { label: 'Pix enviado', icon: 'pix', dir: -1, cat: 'pix' },
  manual_out: { label: 'Transferência manual', icon: 'send', dir: -1, cat: 'pix' },
  boleto_out: { label: 'Pagamento de boleto', icon: 'barcode', dir: -1, cat: 'pagamento' },
  bill_automatic: { label: 'Débito automático', icon: 'bank', dir: -1, cat: 'pagamento' },
  recharge: { label: 'Recarga de celular', icon: 'phone', dir: -1, cat: 'pagamento' },
  card_purchase: { label: 'Compra no cartão', icon: 'card', dir: 0, cat: 'cartao' },
  card_payment: { label: 'Pagamento da fatura', icon: 'card', dir: -1, cat: 'cartao' },
  box_deposit: { label: 'Aporte na caixinha', icon: 'safe', dir: -1, cat: 'invest' },
  box_withdraw: { label: 'Resgate da caixinha', icon: 'safe', dir: 1, cat: 'invest' },
  box_yield: { label: 'Rendimento da caixinha', icon: 'target', dir: 0, cat: 'invest' },
  fx_buy: { label: 'Compra de euros', icon: 'euro', dir: -1, cat: 'cambio' },
  fx_credit_eur: { label: 'Entrada de euros', icon: 'euro', dir: 1, cat: 'cambio' },
  fx_sell: { label: 'Venda de euros', icon: 'euro', dir: 1, cat: 'cambio' },
  fx_debit_eur: { label: 'Saída de euros', icon: 'euro', dir: -1, cat: 'cambio' },
  sepa_out: { label: 'Transferência internacional', icon: 'globe', dir: -1, cat: 'cambio' },
  refund_in: { label: 'Pix devolvido', icon: 'refresh', dir: 1, cat: 'entrada' },
  charge_created: { label: 'Cobrança Pix criada', icon: 'qr', dir: 0, cat: 'pix' },
  charge_paid: { label: 'Cobrança Pix recebida', icon: 'qr', dir: 1, cat: 'entrada' },
};

export const CATS = [
  { id: 'all', label: 'Tudo' },
  { id: 'entrada', label: 'Entradas' },
  { id: 'saida', label: 'Saídas' },
  { id: 'pix', label: 'Pix' },
  { id: 'pagamento', label: 'Pagamentos' },
  { id: 'cartao', label: 'Cartão' },
  { id: 'cambio', label: 'Câmbio' },
  { id: 'invest', label: 'Caixinhas' },
];

export function txMeta(type) {
  return TX_TYPES[type] || { label: 'Lançamento', icon: 'list', dir: 0, cat: 'outros' };
}

export function isNightHour(date = new Date()) {
  const h = date.getHours();
  return h >= PIX.nightStartHour || h < PIX.nightEndHour;
}
