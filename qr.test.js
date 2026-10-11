import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentQrSvg } from './qr.js';

test('payment QR is generated locally as a self-contained SVG', () => {
  const svg = paymentQrSvg('solana:Example?amount=0.001&reference=Example');
  assert.match(svg, /^<svg /);
  assert.match(svg, /<path fill="#111" d="M/);
  assert.match(svg, /<\/svg>$/);
  assert.doesNotMatch(svg, /qrserver|<image|<script/);
});
