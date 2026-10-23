// QR Code: desenha (biblioteca local) e lê (câmera ou imagem) sem depender da internet.
const MIN_SIZE = 200;

export function qrReady() {
  return typeof window.qrcode === 'function';
}

function hasJq() {
  return typeof window.jsQR === 'function';
}

let loading = null;
/** jsQR (256 KB) só é baixado quando a leitura de QR é usada. */
export function ensureDecoder() {
  if (hasJq()) return Promise.resolve(true);
  if (!loading) {
    loading = new Promise((resolve) => {
      const tag = document.createElement('script');
      tag.src = './js/vendor/jsqr.js';
      tag.onload = () => resolve(true);
      tag.onerror = () => resolve(false);
      document.head.append(tag);
    });
  }
  return loading;
}

export function decodeReady() {
  return hasJq();
}

/** Devolve um canvas com o QR do texto (tamanho em px, quadrado). */
export function renderQR(text, { size = 232, quiet = 2 } = {}) {
  if (!qrReady()) throw new Error('Biblioteca de QR Code não carregou.');
  const qr = window.qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const count = qr.getModuleCount();
  const cells = count + quiet * 2;
  const px = Math.max(MIN_SIZE, size);
  const module = Math.max(2, Math.floor(px / cells));
  const canvas = document.createElement('canvas');
  canvas.width = module * cells;
  canvas.height = module * cells;
  canvas.style.width = `${px}px`;
  canvas.style.height = `${px}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'QR Code Pix');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      ctx.fillRect((quiet + c) * module, (quiet + r) * module, module, module);
    }
  }
  return canvas;
}

function imageDataOf(source, maxWidth = 900) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxWidth / Math.max(source.width || source.videoWidth, 1));
  canvas.width = Math.round((source.width || source.videoWidth) * scale);
  canvas.height = Math.round((source.height || source.videoHeight) * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Lê um QR de um ImageData/Imagem/Elemento de vídeo. */
export function decodeFrom(source) {
  if (!hasJq()) return null;
  try {
    const data = imageDataOf(source);
    const result = window.jsQR(data.data, data.width, data.height);
    return result?.data || null;
  } catch {
    return null;
  }
}

export function decodeFromFile(file) {
  return new Promise((resolve) => {
    ensureDecoder().then(() => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const text = decodeFrom(img);
        URL.revokeObjectURL(url);
        resolve(text);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  });
}

export function cameraSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Liga a câmera traseira e chama onFrame a cada ~250ms até achar algo ou parar. */
export function startCamera(video, { onFrame, onError }) {
  let stream = null;
  let timer = null;
  let stopped = false;
  if (!cameraSupported()) {
    onError?.(new Error('Este navegador não liberou a câmera.'));
    return { stop() {} };
  }
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
    .then((media) => {
      if (stopped) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = media;
      video.srcObject = media;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      video.autofocus = true;
      return video.play().catch(() => {});
    })
    .then(() => {
      if (!stream) return;
      timer = setInterval(() => {
        if (!stream) return;
        const text = onFrame ? onFrame(video) : null;
        if (text) stop();
      }, 250);
    })
    .catch((err) => onError?.(err));

  function stop() {
    stopped = true;
    clearInterval(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }
  return { stop, get active() { return Boolean(stream); } };
}
