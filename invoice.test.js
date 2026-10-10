import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReference, buildSolanaPayUrl } from './lib.js';

test('reference is a Base58 string', () => {
  const ref = generateReference();
  assert.equal(typeof ref, 'string');
  assert.ok(ref.length >= 32);
});

test('Solana Pay URL includes amount and reference', () => {
  const ref = generateReference();
  const url = buildSolanaPayUrl({
    recipient: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    amount: '0.05',
    reference: ref,
    asset: 'SOL'
  });
  assert.ok(url.startsWith('solana:9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM?'));
  assert.ok(url.includes('amount=0.05'));
  assert.ok(url.includes(`reference=${ref}`));
});
