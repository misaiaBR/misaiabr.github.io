import { fmt } from '../logic/money.js';

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

function text(x, y, value, size = 9, font = 'F1', color = '22262a') {
  return `BT ${rgb(color)} rg /${font} ${num(size)} Tf 1 0 0 1 ${num(x)} ${num(y)} Tm ${pdfText(value)} Tj ET\n`;
}

function rightText(right, y, value, size = 8.3, font = 'F1', color = '22262a') {
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

function periodLabel(from, to) {
  const longDate = { day: 'numeric', month: 'long', year: 'numeric' };
  return `Del ${localDate(from, longDate)} al ${localDate(to, longDate)}`;
}

const MOVEMENT_TRANSLATIONS = new Map([
  ['Depósito em euros', 'Depósito en euros'],
  ['Depósito recebido', 'Depósito recibido'],
  ['Aporte na caixinha', 'Ingreso a la cuenta de ahorro'],
  ['Pagamento da fatura', 'Pago de la factura'],
  ['Pix enviado', 'Transferencia enviada'],
  ['Pix recebido', 'Transferencia recibida'],
  ['Cobrança automática', 'Cargo automático'],
  ['Pagamento de boleto', 'Pago de recibo'],
  ['Compra de euros', 'Compra de euros'],
  ['Entrada de euros', 'Abono en euros'],
  ['Recarga de celular', 'Recarga de móvil'],
  ['Compra no crédito', 'Compra con tarjeta'],
  ['Resgate da caixinha', 'Retiro de la cuenta de ahorro'],
  ['Salário', 'Salario'],
  ['Pix agendado', 'Transferencia programada'],
  ['Recebido de Lisboa', 'Recibido de Lisboa'],
  ['Fatura deste ciclo quitada', 'Factura de este ciclo pagada'],
  ['Crédito à vista', 'Pago con tarjeta de crédito'],
  ['Assinatura', 'Suscripción'],
]);

function translateMovement(value) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (MOVEMENT_TRANSLATIONS.has(normalized)) return MOVEMENT_TRANSLATIONS.get(normalized);
  const prefixes = [
    [/^Transferência de /i, 'Transferencia de '],
    [/^Recebido de /i, 'Recibido de '],
    [/^Saída de /i, 'Salida de '],
    [/^Câmbio /i, 'Cambio '],
    [/^Fatura de /i, 'Factura de '],
    [/^Parcelado /i, 'Pago a plazos '],
    [/^Mensalidade /i, 'Cuota mensual de '],
  ];
  const translated = prefixes.find(([pattern]) => pattern.test(normalized));
  return translated ? normalized.replace(translated[0], translated[1]) : normalized;
}

function shorten(value, max = 43) {
  const str = String(value || '').replace(/\s+/g, ' ').trim();
  return str.length <= max ? str : `${str.slice(0, max - 1).trimEnd()}…`;
}

function tableHeader(y) {
  let c = line(LEFT, y + 12, RIGHT, y + 12, 'dfe3e5', 0.6);
  c += text(LEFT + 5, y, 'FECHA', 6.8, 'F2', '52615a');
  c += text(LEFT + 58, y, 'FECHA VALOR', 6.8, 'F2', '52615a');
  c += text(LEFT + 130, y, 'DESCRIPCIÓN', 6.8, 'F2', '52615a');
  c += rightText(421, y, 'ABONO', 6.8, 'F2', '52615a');
  c += rightText(485, y, 'CARGO', 6.8, 'F2', '52615a');
  c += rightText(RIGHT - 5, y, 'SALDO', 6.8, 'F2', '52615a');
  c += line(LEFT, y - 7, RIGHT, y - 7, 'dfe3e5', 0.6);
  return c;
}

function pageHeader({ pageIndex, currency, from, to, holder, account, bank, address, bic }) {
  let c = '';
  let tableY;
  if (pageIndex === 0) {
    c += logo(LEFT, 800);
    c += text(LEFT + 43, 826, bank, 12, 'F2', '0a5738');
    (address || []).forEach((addressLine, index) => {
      c += text(LEFT, 788 - index * 11, addressLine, 6.7, 'F1', '58635e');
    });
    c += rightText(RIGHT, 822, `Extracto en ${currency}`, 9, 'F2', '0a5738');
    c += rightText(RIGHT, 804, periodLabel(from, to), 7.2, 'F1', '58635e');
    c += rightText(RIGHT, 788, `Emitido el ${localDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' })} [GMT-03:00]`, 7.2, 'F1', '58635e');
    c += line(LEFT, 741, RIGHT, 741, 'dfe3e5', 0.8);

    c += text(LEFT, 715, 'TITULAR', 6.8, 'F2', '68736e');
    c += text(LEFT, 698, holder, 10, 'F2', '22262a');
    c += text(LEFT, 676, currency === 'EUR' ? 'IBAN' : 'CUENTA', 6.8, 'F2', '68736e');
    c += text(LEFT, 659, account, 8.4, 'F1', '22262a');
    if (currency === 'EUR' && bic) {
      c += text(LEFT, 639, 'BIC / SWIFT', 6.8, 'F2', '68736e');
      c += text(LEFT, 623, bic, 8.4, 'F1', '22262a');
    }
    c += text(RIGHT - 153, 715, 'MONEDA', 6.8, 'F2', '68736e');
    c += text(RIGHT - 153, 698, currency, 8.4, 'F1', '22262a');
    tableY = 492;
  } else {
    c += logo(LEFT, 788);
    c += text(LEFT + 43, 814, bank, 10, 'F2', '0a5738');
    c += text(LEFT + 43, 799, `EXTRACTO EN ${currency}  ·  ${periodLabel(from, to)}`, 7.6, 'F1', '58635e');
    c += rightText(RIGHT, 806, holder, 8.2, 'F1', '58635e');
    c += line(LEFT, 778, RIGHT, 778, 'dfe3e5', 0.8);
    tableY = 752;
  }
  c += tableHeader(tableY);
  return { content: c, rowY: tableY - 25 };
}

function summary({ opening, credits, debits, closing, currency }) {
  const items = [
    ['SALDO INICIAL', fmt(opening, currency)],
    ['ABONOS', fmt(credits, currency)],
    ['CARGOS', fmt(debits, currency)],
    ['SALDO FINAL', fmt(closing, currency)],
  ];
  const width = 123;
  const gap = 8;
  let c = '';
  items.forEach(([label, value], index) => {
    const x = LEFT + index * (width + gap);
    c += line(x, 585, x + width, 585, index === 3 ? '0a5738' : 'dfe3e5', index === 3 ? 1.6 : 0.8);
    c += text(x, 569, label, 6.6, 'F2', '68736e');
    c += text(x, 550, value, 8.8, 'F2', index === 3 ? '0a5738' : '22262a');
  });
  return c;
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
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Title ${pdfText(`Extracto de cuenta - ${bank}`)} /Author ${pdfText(bank)} >> >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}

/** Cria um extrato PDF com valores em centavos e dados da conta informados pelo app. */
export function buildStatementPdf({ rows, currency, from, to, opening, credits, debits, closing, holder, account, bank, address, bic, reference }) {
  const pages = [];
  let pageIndex = 0;
  let page = pageHeader({ pageIndex, currency, from, to, holder, account, bank, address, bic });
  let content = page.content + summary({ opening, credits, debits, closing, currency });
  let y = page.rowY;
  if (!rows.length) content += text(LEFT + 5, y, 'No hay movimientos durante este período.', 9, 'F1', '68736e');
  rows.forEach((row) => {
    if (y < 67) {
      pages.push(content);
      pageIndex += 1;
      page = pageHeader({ pageIndex, currency, from, to, holder, account, bank, address, bic });
      content = page.content;
      y = page.rowY;
    }
    const date = localDate(row.at);
    const valueDate = localDate(row.valueDate || row.at);
    const description = shorten([translateMovement(row.title), translateMovement(row.subtitle)].filter(Boolean).join(' · '));
    const amount = fmt(Math.abs(row.signedCents), currency);
    content += text(LEFT + 5, y, date, 7.2, 'F1', '58635e');
    content += text(LEFT + 58, y, valueDate, 7.2, 'F1', '58635e');
    content += text(LEFT + 130, y, description, 7.5, 'F1', '22262a');
    if (row.signedCents > 0) content += rightText(421, y, amount, 7.2, 'F1', '0a7544');
    if (row.signedCents < 0) content += rightText(485, y, amount, 7.2, 'F1', 'a43c36');
    content += rightText(RIGHT - 5, y, fmt(row.balanceCents, currency), 7.6, 'F1', '22262a');
    content += line(LEFT, y - 7, RIGHT, y - 7, 'e7eae8', 0.35);
    y -= 17;
  });
  pages.push(content);
  pages.forEach((pageContent, index) => {
    pages[index] = pageContent
      + text(LEFT, 22, `Referencia: ${reference}`, 7.2, 'F1', '68736e')
      + line(LEFT, 36, RIGHT, 36, 'dfe3e5', 0.5)
      + rightText(RIGHT, 22, `Página ${index + 1} / ${pages.length}`, 7.2, 'F1', '68736e');
  });
  return makePdf(pages, bank);
}
