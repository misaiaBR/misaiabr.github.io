const PAGE_W = 595;
const PAGE_H = 842;
const LEFT = 38;
const RIGHT = 557;
const WIN_1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87,
  'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91,
  '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98,
  '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

const num = (value) => Number(value.toFixed(2)).toString();
const rgb = (hex) => hex.match(/[0-9a-f]{2}/gi).map((part) => (parseInt(part, 16) / 255).toFixed(3)).join(' ');

function pdfText(value) {
  let result = '';
  for (const char of String(value ?? '')) {
    const cp = char.codePointAt(0);
    const byte = WIN_1252[char] ?? (cp <= 0xff ? cp : 0x3f);
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) result += `\\${String.fromCharCode(byte)}`;
    else if (byte < 0x20 || byte === 0x7f) result += `\\${byte.toString(8).padStart(3, '0')}`;
    else result += String.fromCharCode(byte);
  }
  return `(${result})`;
}

function text(x, y, value, size = 9, font = 'F1', color = '000000') {
  return `BT ${rgb(color)} rg /${font} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm ${pdfText(value)} Tj ET\n`;
}

function rightText(right, y, value, size = 8.3, font = 'F1', color = '000000') {
  return text(right - String(value).length * size * 0.51, y, value, size, font, color);
}

function line(x1, y1, x2, y2, color = 'dfe3e5', width = 0.5) {
  return `${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S\n`;
}

function logo(x, y) {
  let c = '';
  c += `${rgb('0a5738')} rg ${num(x + 11)} ${num(y + 13)} m ${num(x + 12)} ${num(y + 24)} ${num(x + 22)} ${num(y + 29)} ${num(x + 34)} ${num(y + 26)} c ${num(x + 32)} ${num(y + 21)} ${num(x + 27)} ${num(y + 18)} ${num(x + 22)} ${num(y + 17)} c ${num(x + 21)} ${num(y + 11)} ${num(x + 18)} ${num(y + 7)} ${num(x + 14)} ${num(y + 4)} c ${num(x + 12)} ${num(y + 7)} ${num(x + 11)} ${num(y + 10)} ${num(x + 11)} ${num(y + 13)} c f\n`;
  c += `${rgb('2f9b50')} rg ${num(x + 9)} ${num(y + 17)} m ${num(x + 10)} ${num(y + 24)} ${num(x + 16)} ${num(y + 28)} ${num(x + 22)} ${num(y + 29)} c ${num(x + 20)} ${num(y + 24)} ${num(x + 16)} ${num(y + 20)} ${num(x + 9)} ${num(y + 17)} c f\n`;
  c += `${rgb('4ab85b')} rg ${num(x + 15)} ${num(y + 24)} m ${num(x + 17)} ${num(y + 30)} ${num(x + 24)} ${num(y + 33)} ${num(x + 29)} ${num(y + 31)} c ${num(x + 27)} ${num(y + 27)} ${num(x + 22)} ${num(y + 24)} ${num(x + 15)} ${num(y + 24)} c f\n`;
  c += `${rgb('0a5738')} RG 2 w ${num(x + 21)} ${num(y + 20)} m ${num(x + 28)} ${num(y + 7)} l S\n`;
  c += `${rgb('0a5738')} rg ${num(x + 23)} ${num(y + 15)} m ${num(x + 18)} ${num(y + 19)} ${num(x + 14)} ${num(y + 21)} ${num(x + 10)} ${num(y + 21)} l ${num(x + 12)} ${num(y + 23)} ${num(x + 17)} ${num(y + 21)} ${num(x + 23)} ${num(y + 17)} l f\n`;
  return c;
}

function localDate(value, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return date.toLocaleDateString('es-ES', { timeZone: 'America/Sao_Paulo', ...options });
}

function dateWithTimezone(value) {
  const longDate = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${localDate(value, longDate)} [GMT-03:00]`;
}

function periodLabel(from, to) {
  return `${dateWithTimezone(from)} - ${dateWithTimezone(to)}`;
}

function formatStatementNumber(cents) {
  const value = Math.abs(Math.trunc(Number(cents) || 0));
  const whole = String(Math.trunc(value / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = String(value % 100).padStart(2, '0');
  return `${whole},${fraction}`;
}

function formatStatementAmount(cents, currency) {
  return `${formatStatementNumber(cents)} ${currency}`;
}

const MOVEMENT_TRANSLATIONS = new Map([
  ['deposito em euros', 'Dep\u00f3sito en euros'],
  ['deposito recebido', 'Dep\u00f3sito recibido'],
  ['aporte na caixinha', 'Ingreso a cuenta de ahorro'],
  ['pagamento da fatura', 'Pago de factura'],
  ['pix enviado', 'Transferencia enviada'],
  ['pix recebido', 'Transferencia recibida'],
  ['cobranca automatica', 'Cargo autom\u00e1tico'],
  ['pagamento de boleto', 'Pago de recibo'],
  ['compra de euros', 'Compra de euros'],
  ['entrada de euros', 'Abono en euros'],
  ['recarga de celular', 'Recarga de m\u00f3vil'],
  ['compra no credito', 'Compra con tarjeta'],
  ['resgate da caixinha', 'Retiro de cuenta de ahorro'],
  ['salario', 'Salario'],
  ['pix agendado', 'Transferencia programada'],
  ['recebido de lisboa', 'Recibido de Lisboa'],
  ['fatura deste ciclo quitada', 'Factura de este ciclo pagada'],
  ['credito a vista', 'Pago con tarjeta de cr\u00e9dito'],
  ['assinatura', 'Suscripci\u00f3n'],
]);

const MOVEMENT_PREFIX_TRANSLATIONS = [
  [/^transferencia de /, 'Transferencia de '],
  [/^recebido de /, 'Recibido de '],
  [/^saida de /, 'Salida de '],
  [/^cambio /, 'Cambio '],
  [/^fatura de /, 'Factura de '],
  [/^parcelado /, 'Pago a plazos '],
  [/^mensalidade /, 'Cuota mensual de '],
];

function translateMovement(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (MOVEMENT_TRANSLATIONS.has(normalized)) return MOVEMENT_TRANSLATIONS.get(normalized);
  const prefix = MOVEMENT_PREFIX_TRANSLATIONS.find(([pattern]) => pattern.test(normalized));
  if (!prefix) return clean;
  const matched = normalized.match(prefix[0])[0];
  return `${prefix[1]}${clean.slice(matched.length)}`;
}

function shorten(value, max = 43) {
  const str = String(value || '').replace(/\s+/g, ' ').trim();
  return str.length <= max ? str : `${str.slice(0, max - 1).trimEnd()}…`;
}

const INK = '000000';
const MUTED = '52615a';
const RULE = 'dfe3e5';

function tableHeader(y) {
  let c = '';
  c += text(LEFT + 2, y, 'Descripci\u00f3n', 8.2, 'F1', MUTED);
  c += rightText(421, y, 'Entrante', 8.2, 'F1', MUTED);
  c += rightText(490, y, 'Saliente', 8.2, 'F1', MUTED);
  c += rightText(RIGHT - 3, y, 'Saldo', 8.2, 'F1', MUTED);
  return c;
}

function pageHeader({ pageIndex, currency, from, to, holder, holderAddress, account, bank, address, bic, closing }) {
  let c = '';
  if (pageIndex === 0) {
    c += logo(LEFT, 770);
    c += text(LEFT + 43, 801, bank, 12, 'F2', INK);
    (address || []).forEach((addressLine, index) => {
      c += text(LEFT, 770 - index * 11, addressLine, 7.3, 'F1', MUTED);
    });

    c += text(LEFT, 688, 'DOCUMENTO DE PRUEBA · NO ES EXTRACTO BANCARIO', 9, 'F2', INK);
    c += text(LEFT, 666, `Informe de saldo de referencia en ${currency}`, 18, 'F2', INK);
    c += text(LEFT, 640, periodLabel(from, to), 10.5, 'F2', INK);
    c += text(LEFT, 621, `Generado el: ${localDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })}`, 8.5, 'F1', MUTED);
    c += line(LEFT, 601, RIGHT, 601, RULE, 0.7);

    const holderX = LEFT + 2;
    const ibanX = 302;
    const bicX = 432;
    c += text(holderX, 583, 'Titular de la cuenta', 9, 'F2', INK);
    c += text(ibanX, 583, 'IBAN', 9, 'F2', INK);
    c += text(bicX, 583, 'Swift/BIC', 9, 'F2', INK);
    c += text(holderX, 565, holder, 9, 'F2', INK);
    c += text(ibanX, 565, account, 7.7, 'F1', INK);
    c += text(bicX, 565, bic, 7.7, 'F1', INK);
    (holderAddress || []).forEach((addressLine, index) => {
      c += text(holderX, 553 - index * 14, addressLine, 8.1, 'F1', INK);
    });

    c += line(LEFT, 490, RIGHT, 490, RULE, 0.7);
    c += text(LEFT + 2, 466, `Saldo de referencia ${currency} al ${dateWithTimezone(to)}`, 10.5, 'F2', INK);
    c += rightText(RIGHT, 466, formatStatementAmount(closing, currency), 11.5, 'F2', INK);
    c += line(LEFT, 455, RIGHT, 455, '777777', 0.55);
    c += tableHeader(438);
    return { content: c, rowY: 416 };
  }

  c += logo(LEFT, 786);
  c += text(LEFT + 43, 817, bank, 10, 'F2', INK);
  c += text(LEFT + 43, 800, `Informe de referencia en ${currency} \u00b7 ${periodLabel(from, to)}`, 7.5, 'F1', MUTED);
  c += text(LEFT, 770, 'DOCUMENTO DE PRUEBA · NO ES EXTRACTO BANCARIO', 8, 'F2', INK);
  c += rightText(RIGHT, 805, holder, 8, 'F1', INK);
  c += line(LEFT, 780, RIGHT, 780, RULE, 0.7);
  c += tableHeader(756);
  return { content: c, rowY: 733 };
}

function makePdf(pages, bank) {
  const objects = [];
  const pageIds = pages.map((_, i) => 5 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((content, i) => {
    const pageId = pageIds[i];
    const streamId = pageId + 1;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`;
    objects[streamId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Title ${pdfText(`Documento de prueba: saldo de referencia - ${bank}`)} /Author ${pdfText(bank)} >> >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}

/** Cria um PDF com os dados da conta selecionada no app. */
export function buildStatementPdf({ rows, currency, from, to, closing, holder, holderAddress, account, bank, address, bic, reference }) {
  const pages = [];
  let pageIndex = 0;
  let page = pageHeader({ pageIndex, currency, from, to, holder, holderAddress, account, bank, address, bic, closing });
  let content = page.content;
  let y = page.rowY;

  if (!rows.length) {
    content += text(LEFT + 2, 392, 'Saldo fijo de referencia para pruebas; no procede de una conexión bancaria.', 8.5, 'F1', INK);
    content += text(LEFT + 2, 379, 'Este documento no es un extracto bancario ni acredita titularidad o disponibilidad de fondos.', 8.5, 'F1', INK);
  }

  rows.forEach((row) => {
    if (y < 64) {
      pages.push(content);
      pageIndex += 1;
      page = pageHeader({ pageIndex, currency, from, to, holder, holderAddress, account, bank, address, bic, closing });
      content = page.content;
      y = page.rowY;
    }
    const description = shorten(
      [localDate(row.at), translateMovement(row.title), translateMovement(row.subtitle)]
        .filter(Boolean)
        .join(' \u00b7 '),
      75,
    );
    const amount = formatStatementNumber(row.signedCents);
    content += text(LEFT + 2, y, description, 7.8, 'F1', INK);
    if (row.signedCents > 0) content += rightText(421, y, amount, 7.8, 'F1', INK);
    if (row.signedCents < 0) content += rightText(490, y, amount, 7.8, 'F1', INK);
    content += rightText(RIGHT - 3, y, formatStatementNumber(row.balanceCents), 7.8, 'F1', INK);
    content += line(LEFT, y - 7, RIGHT, y - 7, 'e7eae8', 0.35);
    y -= 17;
  });
  pages.push(content);
  pages.forEach((pageContent, index) => {
    pages[index] = pageContent
      + text(LEFT, 22, `Referencia: ${reference}`, 7.2, 'F1', MUTED)
      + line(LEFT, 36, RIGHT, 36, RULE, 0.5)
      + rightText(RIGHT, 22, `P\u00e1gina ${index + 1} / ${pages.length}`, 7.2, 'F1', INK);
  });
  return makePdf(pages, bank);
}
