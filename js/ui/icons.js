// Ícones no estilo SF Symbols (stroke 1.8, viewBox 24).
const P = {
  home: '<path d="M3.5 10.6 12 3.6l8.5 7v9.4a1 1 0 0 1-1 1h-5.2v-6h-4.6v6H4.5a1 1 0 0 1-1-1z"/>',
  list:
    '<rect x="4" y="3.4" width="16" height="17.2" rx="2.6"/><path d="M8 8.4h8M8 12h8M8 15.6h5"/>',
  pix:
    '<path d="M12 3.2 20.8 12 12 20.8 3.2 12z"/><path d="M9.3 9.3 12 12l2.7-2.7M9.3 14.7 12 12l2.7 2.7"/>',
  qr: '<rect x="3.6" y="3.6" width="6.6" height="6.6" rx="1.4"/><rect x="13.8" y="3.6" width="6.6" height="6.6" rx="1.4"/><rect x="3.6" y="13.8" width="6.6" height="6.6" rx="1.4"/><path d="M13.8 13.8h2.8v2.8M20.4 20.4h-2.8v-2.8M17.6 20.4h2.8"/>',
  euro:
    '<path d="M16.8 6.6A6.4 6.4 0 0 0 7.6 12a6.4 6.4 0 0 0 9.2 5.4"/><path d="M4.4 10.4h9M4.4 13.6h9"/>',
  card:
    '<rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.6"/><path d="M2.6 9.8h18.8M6.4 14.6h3.4"/>',
  user: '<circle cx="12" cy="8.2" r="3.9"/><path d="M4.6 20.4c1.5-3.6 4.2-5.2 7.4-5.2s5.9 1.6 7.4 5.2"/>',
  eye: '<path d="M2.6 12S6.2 5.6 12 5.6 21.4 12 21.4 12 17.8 18.4 12 18.4 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3.1"/>',
  'eye-off':
    '<path d="M4 4.4 20 20.2"/><path d="M9.6 5.9A9.6 9.6 0 0 1 12 5.6c5.8 0 9.4 6.4 9.4 6.4a17 17 0 0 1-3.5 4.2M6.5 7.8A16.8 16.8 0 0 0 2.6 12s3.6 6.4 9.4 6.4a9.4 9.4 0 0 0 3.3-.6"/><path d="M9.9 9.9a3.1 3.1 0 0 0 4.3 4.3"/>',
  bell:
    '<path d="M18 9.4a6 6 0 1 0-12 0c0 5.2-2 6.6-2 6.6h16s-2-1.4-2-6.6z"/><path d="M10.2 19.4a2 2 0 0 0 3.6 0"/>',
  copy:
    '<rect x="8.6" y="8.6" width="11.4" height="11.4" rx="2.4"/><path d="M15.8 5.6H6a2.4 2.4 0 0 0-2.4 2.4v9.8"/>',
  share:
    '<path d="M12 15.6V4.2M8.4 7.8 12 4.2l3.6 3.6"/><path d="M5.4 12.6v6a2 2 0 0 0 2 2h9.2a2 2 0 0 0 2-2v-6"/>',
  chevron: '<path d="M9 5.4 15.6 12 9 18.6"/>',
  chevdown: '<path d="M5.4 9 12 15.6 18.6 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M4.6 12.6 9.6 17.6 19.4 6.6"/>',
  x: '<path d="M6 6 18 18M18 6 6 18"/>',
  send: '<path d="M20.4 3.6 3.6 10.2l6.6 2.4 2.4 6.6z"/><path d="M10.2 12.6 20.4 3.6"/>',
  download:
    '<path d="M12 4v10.4M8.4 11.2 12 14.8l3.6-3.6"/><path d="M4.6 18.4h14.8"/>',
  safe:
    '<rect x="3.4" y="4.6" width="17.2" height="14.8" rx="2.6"/><circle cx="12" cy="11.6" r="3.6"/><path d="M12 8v3.6h3.2"/>',
  cash:
    '<rect x="2.6" y="6.2" width="18.8" height="11.6" rx="2.2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 10.4v3.2M18 10.4v3.2"/>',
  globe:
    '<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.4 2.6 3.4 5.6 3.4 8.6s-1 6-3.4 8.6c-2.4-2.6-3.4-5.6-3.4-8.6s1-6 3.4-8.6z"/>',
  phone:
    '<rect x="6.4" y="2.6" width="11.2" height="18.8" rx="2.6"/><path d="M10.4 18.6h3.2"/>',
  doc: '<path d="M6 3.4h7.6L18.6 8v12.6H6z"/><path d="M13.4 3.4V8h5.2M8.8 12.6h6.4M8.8 16h6.4"/>',
  key: '<circle cx="7.6" cy="14.4" r="3.6"/><path d="M10.4 12 19 3.4M16 6.4l2.4 2.4M13.6 8.8 16 11.2"/>',
  gauge:
    '<path d="M4.2 17.6a8.6 8.6 0 1 1 15.6 0"/><path d="M12 12.6 15.4 9"/><circle cx="12" cy="13.2" r="1.3"/>',
  cog: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M4.5 4.5l1.9 1.9M17.6 17.6l1.9 1.9M2.8 12h2.6M18.6 12h2.6M4.5 19.5 6.4 17.6M17.6 6.4l1.9-1.9"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10" rx="2.4"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/>',
  unlock:
    '<rect x="4.6" y="10.4" width="14.8" height="10" rx="2.4"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.4-1"/>',
  face:
    '<path d="M3.6 8.2V5.8a2.2 2.2 0 0 1 2.2-2.2h2.4M15.8 3.6h2.4a2.2 2.2 0 0 1 2.2 2.2v2.4M20.4 15.8v2.4a2.2 2.2 0 0 1-2.2 2.2h-2.4M8.2 20.4H5.8a2.2 2.2 0 0 1-2.2-2.2v-2.4"/><path d="M9 10.4v1.6M15 10.4v1.6M12 10.4v2.2h-.6M9.4 15.6c1.5 1.2 3.7 1.2 5.2 0"/>',
  wallet:
    '<path d="M3.4 7.6A2.2 2.2 0 0 1 5.6 5.4h11.8a2 2 0 0 1 2 2v1.4"/><rect x="3.4" y="7.6" width="17.2" height="11.6" rx="2.4"/><circle cx="16.2" cy="13.4" r="1.3"/>',
  filter: '<path d="M3.6 6.4h16.8M6.6 12h10.8M9.6 17.6h4.8"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.2"/><path d="M15.2 15.2 20.4 20.4"/>',
  swap: '<path d="M4.6 8.6h13.2M14.4 5.2l3.4 3.4-3.4 3.4M19.4 15.4H6.2M9.4 12l-3.2 3.4 3.2 3.4"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.2V12l3.4 2.2"/>',
  back: '<path d="M19.4 12H5.2M10.6 6.6 5.2 12l5.4 5.4"/>',
  out: '<path d="M9.4 4.6H6a2 2 0 0 0-2 2v10.8a2 2 0 0 0 2 2h3.4"/><path d="M15 8.6 18.4 12 15 15.4M8.6 12h9.8"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2M12 7.8v.2"/>',
  bank:
    '<path d="M3.6 9.6 12 4.4l8.4 5.2M5.6 11v7.4M18.4 11v7.4M9.6 11v7.4M14.4 11v7.4M3.4 20.6h17.2"/>',
  barcode:
    '<path d="M4 5.4v13.2M7 5.4v13.2M10.4 5.4v13.2M13.6 5.4v13.2M17 5.4v13.2M20.4 5.4v13.2"/>',
  calendar:
    '<rect x="3.6" y="5.4" width="16.8" height="15" rx="2.4"/><path d="M3.6 10h16.8M8.4 3.4v3.6M15.6 3.4v3.6"/>',
  shield: '<path d="M12 3.4 19.4 6v6c0 4.2-3 7-7.4 8.6C7.6 19 4.6 16.2 4.6 12V6z"/>',
  trash:
    '<path d="M4.6 7.4h14.8M9.4 7.4V5.2h5.2v2.2M6.6 7.4l.9 12.2a1.6 1.6 0 0 0 1.6 1.4h5.8a1.6 1.6 0 0 0 1.6-1.4l.9-12.2"/>',
  camera:
    '<path d="M3.4 8.4A2.4 2.4 0 0 1 5.8 6h1.8l1.2-2h6.4l1.2 2h1.2a2.4 2.4 0 0 1 2.4 2.4v8.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.4" r="3.4"/>',
  wave: '<path d="M8.4 8.4a5 5 0 0 1 0 7.2M12 5.6a9.4 9.4 0 0 1 0 12.8M15.6 8.4a5 5 0 0 1 0 7.2"/>',
  moon: '<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.6 8.6 0 1 0 10.4 10.4z"/>',
  refresh:
    '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20.4 4.4v4.2h-4.2"/>',
  target:
    '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1"/>',
  arrowUp: '<path d="M12 19.4V5.2M6.6 10.6 12 5.2l5.4 5.4"/>',
  arrowDown: '<path d="M12 4.6v14.2M6.6 13.4 12 18.8l5.4-5.4"/>',
  help: '<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2-2.5 3.6M12 16.6v.2"/>',
  star: '<path d="M12 4.2 14.4 9.2l5.4.6-4 3.7 1.1 5.3L12 16.1 7.1 18.8l1.1-5.3-4-3.7 5.4-.6z"/>',
  grid:
    '<rect x="4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.6"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.6"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.6"/>',
};

export function icon(name, cls = '') {
  const inner = P[name] || P.info;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

export const ICON_NAMES = Object.keys(P);

/**
 * Bandeiras de conta, desenhadas (não emoji): emoji muda de aparelho para aparelho e
 * no Windows/Chrome vira só as letras. São os únicos ícones coloridos do app, e as
 * proporções abaixo foram medidas no print que ele mandou, não no brasão oficial.
 */
/** Estrela de quatro pontas (ponta para cima), circunraio `r`. */
function estrela4(cx, cy, r) {
  const i = r * 0.32;
  const p = (dx, dy) => `${(cx + dx).toFixed(2)} ${(cy + dy).toFixed(2)}`;
  return `<path d="M${p(0, -r)} L${p(i, -i)} L${p(r, 0)} L${p(i, i)} L${p(0, r)} L${p(-i, i)} L${p(-r, 0)} L${p(-i, -i)}Z"/>`;
}

/** As doze estrelas da União Europeia, em círculo, todas na mesma posição. */
function estrelasUE(cx, cy, raioDoCirculo, raioDaEstrela) {
  let g = '';
  for (let k = 0; k < 12; k += 1) {
    const ang = -Math.PI / 2 + (k * Math.PI) / 6;
    g += estrela4(cx + raioDoCirculo * Math.cos(ang), cy + raioDoCirculo * Math.sin(ang), raioDaEstrela);
  }
  return g;
}

const BANDEIRAS = {
  // medidas tiradas da imagem que ele mandou: losango largo (9,4 x 6,3 de semi-diagonal),
  // círculo azul pequeno e a faixa branca descendo da esquerda para a direita
  BR: `<circle cx="12" cy="12" r="11" fill="#4ea51f"/>
    <circle cx="12" cy="12" r="10.5" fill="#319a0e"/>
    <path d="M2.6 12 12 5.7 21.4 12 12 18.3z" fill="#fcc300"/>
    <circle cx="12" cy="12" r="4.1" fill="#1f2c7a"/>
    <path d="M8.4 10Q12.2 10.2 16 12.7" fill="none" stroke="#d5daf0" stroke-width="0.55"/>`,
  // azul-marinho com a borda mais clara e as doze estrelas amarelas em círculo
  EUR: `<circle cx="12" cy="12" r="11" fill="#2b3a8f"/>
    <circle cx="12" cy="12" r="10.3" fill="#131c6b"/>
    <g fill="#f5d32a">${estrelasUE(12, 12, 7.9, 1.2)}</g>`,
};

export function bandeira(codigo, cls = '') {
  const inner = BANDEIRAS[codigo] || BANDEIRAS.BR;
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
}
