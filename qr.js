import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { QrCode } = require('./vendor/qr.cjs');

export function paymentQrSvg(paymentUrl) {
  const qr = QrCode.encodeText(paymentUrl, QrCode.Ecc.MEDIUM);
  const border = 4;
  const size = qr.size + border * 2;
  const path = [];
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.getModule(x, y)) path.push(`M${x + border},${y + border}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Solana Pay QR code"><rect width="100%" height="100%" fill="#fff"/><path fill="#111" d="${path.join('')}"/></svg>`;
}
