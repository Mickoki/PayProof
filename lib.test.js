import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAddress, decodeBase58, encodeBase58, generateReference, parseAmount,
  buildSolanaPayUrl, buildSolTransferMessage, buildUnsignedSolTransaction, transactionMatches, NETWORKS } from './lib.js';

const recipient = encodeBase58(Buffer.alloc(32, 7));
const reference = encodeBase58(Buffer.alloc(32, 8));
const invoice = { recipient, reference, amount: '0.01', amountUnits: '10000000', asset: 'SOL' };

test('addresses and references are valid 32-byte Base58 values', () => {
  assert.equal(decodeBase58(generateReference()).length, 32);
  assert.equal(assertAddress(recipient), recipient);
  assert.throws(() => assertAddress('not-a-wallet'));
  assert.throws(() => assertAddress('11111111111111111111111111111111'));
});

test('amounts use exact integer units', () => {
  assert.deepEqual(parseAmount('0.01', 9), { display: '0.01', units: '10000000' });
  assert.throws(() => parseAmount('0.0000000001', 9));
  assert.throws(() => parseAmount('-1', 9));
  assert.throws(() => parseAmount('0', 9));
});

test('payment URL contains exact amount and reference', () => {
  const url = new URL(buildSolanaPayUrl({ recipient, amount: invoice.amount, reference, asset: 'SOL' }));
  assert.equal(url.protocol, 'solana:');
  assert.equal(url.searchParams.get('reference'), reference);
  assert.equal(url.searchParams.get('amount'), '0.01');
});

test('Phantom transfer message includes exact SOL amount, recipient and reference', () => {
  const payer = encodeBase58(Buffer.alloc(32, 9));
  const blockhash = encodeBase58(Buffer.alloc(32, 10));
  const raw = decodeBase58(buildSolTransferMessage(invoice, payer, blockhash));
  assert.equal(raw.length, 183);
  assert.deepEqual([...raw.subarray(0, 4)], [1, 0, 2, 4]);
  assert.deepEqual(raw.subarray(4, 36), decodeBase58(payer));
  assert.deepEqual(raw.subarray(36, 68), decodeBase58(recipient));
  assert.deepEqual(raw.subarray(100, 132), decodeBase58(reference));
  assert.deepEqual(raw.subarray(132, 164), decodeBase58(blockhash));
  assert.deepEqual([...raw.subarray(164, 171)], [1, 2, 3, 0, 1, 3, 12]);
  assert.equal(raw.readUInt32LE(171), 2);
  assert.equal(raw.readBigUInt64LE(175), 10_000_000n);
});

test('unsigned Phantom transaction includes signature slot before the message', () => {
  const payer = encodeBase58(Buffer.alloc(32, 9));
  const blockhash = encodeBase58(Buffer.alloc(32, 10));
  const transaction = decodeBase58(buildUnsignedSolTransaction(invoice, payer, blockhash));
  assert.equal(transaction.length, 248);
  assert.equal(transaction[0], 1);
  assert.ok(transaction.subarray(1, 65).every(byte => byte === 0));
  assert.deepEqual(transaction.subarray(65), decodeBase58(buildSolTransferMessage(invoice, payer, blockhash)));
});

test('SOL requires exact recipient balance increase and reference', () => {
  const tx = { transaction: { message: { accountKeys: [reference, recipient] } },
    meta: { err: null, preBalances: [0, 100], postBalances: [0, 10000100] } };
  assert.equal(transactionMatches(invoice, tx), true);
  for (const post of [9999999, 10000101]) {
    assert.equal(transactionMatches(invoice, { ...tx, meta: { ...tx.meta, postBalances: [0, post] } }), false);
  }
  assert.equal(transactionMatches(invoice, { ...tx, transaction: { message: { accountKeys: ['wrong', recipient] } } }), false);
  assert.equal(transactionMatches(invoice, { ...tx, transaction: { message: { accountKeys: [reference, 'wrong'] } } }), false);
  assert.equal(transactionMatches(invoice, { ...tx, meta: { ...tx.meta, err: { InstructionError: [0, 'Failed'] } } }), false);
});

test('USDC requires correct mint, owner and exact balance increase', () => {
  const bill = { ...invoice, amountUnits: '1000000', asset: 'USDC' };
  const balance = (amount, owner = recipient, mint = NETWORKS.devnet.usdc) =>
    [{ accountIndex: 2, owner, mint, uiTokenAmount: { amount } }];
  const tx = { transaction: { message: { accountKeys: [reference, recipient, 'tokenAccount'] } },
    meta: { err: null, preTokenBalances: balance('5000000'), postTokenBalances: balance('6000000') } };
  assert.equal(transactionMatches(bill, tx), true);
  assert.equal(transactionMatches(bill, { ...tx, meta: { ...tx.meta, postTokenBalances: balance('5999999') } }), false);
  assert.equal(transactionMatches(bill, { ...tx, meta: { ...tx.meta, postTokenBalances: balance('6000001') } }), false);
  assert.equal(transactionMatches(bill, { ...tx, meta: { ...tx.meta, postTokenBalances: balance('6000000', 'wrong') } }), false);
  assert.equal(transactionMatches(bill, { ...tx, meta: { ...tx.meta, postTokenBalances: balance('6000000', recipient, 'wrong') } }), false);
  assert.equal(transactionMatches(bill, { ...tx, transaction: { message: { accountKeys: ['wrong', recipient, 'tokenAccount'] } } }), false);
});
