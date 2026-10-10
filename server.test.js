import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { encodeBase58, NETWORKS } from './lib.js';

process.env.PAYPROOF_DATA_DIR = await mkdtemp(path.join(os.tmpdir(), 'payproof-test-'));
process.env.PAYPROOF_NETWORK = 'devnet';
process.env.PAYPROOF_ASSET = 'SOL';
const { handle } = await import('./server.js');

async function request(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3000' };
  const result = { status: 0, data: null, headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true; },
    end(content) { this.data = content ? JSON.parse(content) : null; }
  };
  await handle(req, result);
  return result;
}

test('create an invoice, then verify only the exact finalized transaction', async () => {
  const recipient = encodeBase58(Buffer.alloc(32, 4));
  const created = await request('POST', '/api/invoices', { recipient, amount: '0.01', description: 'Логотип' });
  assert.equal(created.status, 201);
  assert.equal(created.data.status, 'pending');
  const id = created.data.id;
  const reference = new URL(created.data.paymentUrl).searchParams.get('reference');
  assert.ok(reference);

  const originalFetch = globalThis.fetch;
  let amountReceived = 9_000_000;
  let secondReference = null;
  globalThis.fetch = async (_url, options) => {
    const { method } = JSON.parse(options.body);
    const result = method === 'getSignaturesForAddress'
      ? [{ signature: 'test-signature', err: null }]
      : { transaction: { message: { accountKeys: [reference, secondReference, recipient].filter(Boolean) } },
          meta: { err: null, preBalances: secondReference ? [0, 0, 100] : [0, 100],
            postBalances: secondReference ? [0, 0, 100 + amountReceived] : [0, 100 + amountReceived] } };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
  };
  try {
    const invalid = await request('POST', '/api/invoices', { recipient: 'bad', amount: '0', description: 'bad' });
    assert.equal(invalid.status, 400);
    const wrongAmount = await request('GET', `/api/invoices/${id}/verify`);
    assert.equal(wrongAmount.data.status, 'pending');
    amountReceived = 10_000_000;
    const correct = await request('GET', `/api/invoices/${id}/verify`);
    assert.equal(correct.data.status, 'paid');
    assert.equal(correct.data.signature, 'test-signature');
    const loaded = await request('GET', `/api/invoices/${id}`);
    assert.equal(loaded.data.status, 'paid');
    const second = await request('POST', '/api/invoices', { recipient, amount: '0.01', description: 'Второй счёт' });
    secondReference = new URL(second.data.paymentUrl).searchParams.get('reference');
    const replay = await request('GET', `/api/invoices/${second.data.id}/verify`);
    assert.equal(replay.data.status, 'pending');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shared invoice URL serves the invoice app', async () => {
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = '/invoice/example-id';
  req.headers = { host: 'localhost:3000' };
  const res = { status: 0, body: '', writeHead(status) { this.status = status; }, end(content) { this.body = String(content); } };
  await handle(req, res);
  assert.equal(res.status, 200);
  assert.match(res.body, /id="invoice-view"/);
});

test('Testnet SOL invoice uses Testnet RPC and rejects Testnet USDC', async () => {
  const recipient = encodeBase58(Buffer.alloc(32, 6));
  const bad = await request('POST', '/api/invoices', { recipient, amount: '0.001', asset: 'USDC', network: 'testnet' });
  assert.equal(bad.status, 400);
  const created = await request('POST', '/api/invoices', { recipient, amount: '0.001', asset: 'SOL', network: 'testnet' });
  assert.equal(created.status, 201);
  assert.equal(created.data.network, 'testnet');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: JSON.parse(options.body).method });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [] }), { status: 200 });
  };
  try {
    const verified = await request('GET', `/api/invoices/${created.data.id}/verify`);
    assert.equal(verified.data.status, 'pending');
    assert.deepEqual(calls, [{ url: NETWORKS.testnet.rpc, method: 'getSignaturesForAddress' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('prepare Phantom payment builds a Testnet transfer message', async () => {
  const recipient = encodeBase58(Buffer.alloc(32, 11));
  const payer = encodeBase58(Buffer.alloc(32, 12));
  const blockhash = encodeBase58(Buffer.alloc(32, 13));
  const created = await request('POST', '/api/invoices', { recipient, amount: '0.001', network: 'testnet' });
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: JSON.parse(options.body).method });
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: { blockhash } } }), { status: 200 });
  };
  try {
    const prepared = await request('POST', `/api/invoices/${created.data.id}/prepare`, { payer });
    assert.equal(prepared.status, 200);
    assert.equal(prepared.data.network, 'testnet');
    assert.ok(prepared.data.transaction);
    assert.deepEqual(calls, [{ url: NETWORKS.testnet.rpc, method: 'getLatestBlockhash' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
