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
  const width = String(value).length * size * 0.51;
  return text(right - width, y, value, size, font, color);
}

function rect(x, y, width, height, color) {
  return `${rgb(color)} rg ${num(x)} ${num(y)} ${num(width)} ${num(height)} re f\n`;
}

function line(x1, y1, x2, y2, color = 'dfe3e5', width = 0.5) {
  return `${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S\n`;
}

function localDate(value, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return date.toLocaleDateString('pt-BR', options);
}

function shorten(value, max = 44) {
  const str = String(value || '').replace(/\s+/g, ' ').trim();
  return str.length <= max ? str : `${str.slice(0, max - 1).trimEnd()}…`;
}

function tableHeader(y) {
  let c = rect(LEFT, y - 6, RIGHT - LEFT, 21, 'edf1ef');
  c += text(LEFT + 5, y, 'DATA', 6.8, 'F2', '52615a');
  c += text(LEFT + 53, y, 'DATA-VALOR', 6.8, 'F2', '52615a');
  c += text(LEFT + 111, y, 'DESCRIÇÃO', 6.8, 'F2', '52615a');
  c += rightText(397, y, 'CRÉDITO', 6.8, 'F2', '52615a');
  c += rightText(466, y, 'DÉBITO', 6.8, 'F2', '52615a');
  c += rightText(RIGHT - 5, y, 'SALDO', 7.3, 'F2', '52615a');
  return c;
}

function pageHeader({ pageIndex, currency, from, to, holder, account, bank }) {
  let c = '';
  let tableY;
  if (pageIndex === 0) {
    c += rect(0, 716, PAGE_W, 126, '0a5738');
    c += text(LEFT, 802, bank.toLocaleUpperCase('pt-BR'), 10, 'F2', 'ffffff');
    c += text(LEFT, 772, 'EXTRATO DA CONTA', 20, 'F2', 'ffffff');
    c += text(LEFT, 750, `${currency === 'EUR' ? 'Conta em euros' : 'Conta em reais'}  ·  Moeda ${currency}  ·  ${localDate(from)} a ${localDate(to)}`, 9, 'F1', 'e0f4e9');
    c += text(LEFT, 696, `Titular: ${holder}`, 9, 'F2');
    c += text(LEFT, 680, `Conta: ${account}`, 8.5, 'F1', '58635e');
    c += rightText(RIGHT, 680, `Gerado em ${localDate(new Date(), { day: '2-digit', month: 'long', year: 'numeric' })}`, 8.2, 'F1', '58635e');
    tableY = 582;
  } else {
    c += text(LEFT, 807, `${bank.toLocaleUpperCase('pt-BR')}  ·  EXTRATO DA CONTA`, 10, 'F2', '0a5738');
    c += text(LEFT, 788, `${currency === 'EUR' ? 'Conta em euros' : 'Conta em reais'}  ·  ${localDate(from)} a ${localDate(to)}  ·  ${holder}`, 8.4, 'F1', '58635e');
    c += text(LEFT, 772, `Conta: ${account}`, 8.2, 'F1', '58635e');
    tableY = 744;
  }
  c += tableHeader(tableY);
  return { content: c, rowY: tableY - 22 };
}

function summaryCards({ opening, credits, debits, closing, currency }) {
  const cards = [
    ['SALDO INICIAL', fmt(opening, currency)],
    ['ENTRADAS', fmt(credits, currency)],
    ['SAÍDAS', fmt(debits, currency)],
    ['SALDO FINAL', fmt(closing, currency)],
  ];
  const width = 123;
  const gap = 8;
  let c = '';
  cards.forEach(([label, value], index) => {
    const x = LEFT + index * (width + gap);
    c += rect(x, 621, width, 46, index === 3 ? 'e5f5eb' : 'f2f4f3');
    c += text(x + 8, 651, label, 6.7, 'F2', '64716b');
    c += text(x + 8, 633, value, 8.6, 'F2', index === 3 ? '0a5738' : '22262a');
  });
  return c;
}

function makePdf(pages) {
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
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info << /Title ${pdfText('Extrato da conta - Ipe Banco')} /Author ${pdfText('Ipe Banco')} >> >>\nstartxref\n${xref}\n%%EOF`;
  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}

/** Creates a self-contained statement PDF; all amounts are integer cents. */
export function buildStatementPdf({ rows, currency, from, to, opening, credits, debits, closing, holder, account, bank }) {
  const pages = [];
  let pageIndex = 0;
  let page = pageHeader({ pageIndex, currency, from, to, holder, account, bank });
  let content = page.content + summaryCards({ opening, credits, debits, closing, currency });
  let y = page.rowY;
  if (!rows.length) {
    content += text(LEFT + 5, y, 'Nenhuma movimentação concluída neste período.', 9, 'F1', '68736e');
  }
  rows.forEach((row) => {
    if (y < 67) {
      pages.push(content);
      pageIndex += 1;
      page = pageHeader({ pageIndex, currency, from, to, holder, account, bank });
      content = page.content;
      y = page.rowY;
    }
    const date = localDate(row.at);
    const valueDate = localDate(row.valueDate || row.at);
    const description = shorten([row.title, row.subtitle].filter(Boolean).join(' · '));
    const amount = fmt(Math.abs(row.signedCents), currency);
    content += text(LEFT + 5, y, date, 7.2, 'F1', '58635e');
    content += text(LEFT + 53, y, valueDate, 7.2, 'F1', '58635e');
    content += text(LEFT + 111, y, description, 7.7, 'F1', '22262a');
    if (row.signedCents > 0) content += rightText(397, y, amount, 7.3, 'F1', '0a7544');
    if (row.signedCents < 0) content += rightText(466, y, amount, 7.3, 'F1', 'a43c36');
    content += rightText(RIGHT - 5, y, fmt(row.balanceCents, currency), 7.8, 'F1', '22262a');
    content += line(LEFT, y - 6, RIGHT, y - 6, 'e7eae8', 0.35);
    y -= 16;
  });
  pages.push(content);
  pages.forEach((pageContent, index) => {
    pages[index] = pageContent
      + text(LEFT, 43, 'Demonstrativo de movimentos salvo neste app; não é extrato oficial emitido por instituição financeira.', 6.7, 'F1', '68736e')
      + line(LEFT, 36, RIGHT, 36, 'dfe3e5', 0.5)
      + rightText(RIGHT, 23, `Página ${index + 1} de ${pages.length}`, 7.2, 'F1', '68736e');
  });
  return makePdf(pages);
}
