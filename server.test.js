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
process.env.PAYPROOF_VERIFY_MIN_INTERVAL_MS = '0';
process.env.PAYPROOF_VERIFY_PER_MIN = '0';
process.env.PAYPROOF_CREATE_PER_HOUR = '0';
const { handle } = await import('./server.js');

async function request(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3000' };
  const result = { status: 0, data: null, headersSent: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    end(content) { this.data = content ? JSON.parse(content) : null; }
  };
  await handle(req, result);
  return result;
}

test('create an invoice, then verify only the exact confirmed transaction', async () => {
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
    const { method, params } = JSON.parse(options.body);
    assert.equal(params.at(-1).commitment, 'confirmed');
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

test('Devnet SOL Action exposes metadata and a base64 unsigned transaction', async () => {
  const recipient = encodeBase58(Buffer.alloc(32, 16));
  const payer = encodeBase58(Buffer.alloc(32, 17));
  const blockhash = encodeBase58(Buffer.alloc(32, 18));
  const created = await request('POST', '/api/invoices', { recipient, amount: '0.001', network: 'devnet' });
  const rules = await request('GET', '/actions.json');
  assert.equal(rules.status, 200);
  assert.equal(rules.headers['Access-Control-Allow-Origin'], '*');
  const metadata = await request('GET', `/api/actions/pay/${created.data.id}`);
  assert.equal(metadata.status, 200);
  assert.equal(metadata.data.type, 'action');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1,
    result: { value: { blockhash } } }), { status: 200 });
  try {
    const posted = await request('POST', `/api/actions/pay/${created.data.id}`, { account: payer });
    assert.equal(posted.status, 200);
    assert.equal(Buffer.from(posted.data.transaction, 'base64').length, 248);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invoice QR endpoint serves a local SVG', async () => {
  const recipient = encodeBase58(Buffer.alloc(32, 19));
  const created = await request('POST', '/api/invoices', { recipient, amount: '0.002' });
  const req = Readable.from([]);
  req.method = 'GET';
  req.url = `/api/invoices/${created.data.id}/qr.svg`;
  req.headers = { host: 'localhost:3000' };
  const res = { status: 0, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(content) { this.body = String(content); } };
  await handle(req, res);
  assert.equal(res.status, 200);
  assert.match(res.headers['Content-Type'], /image\/svg\+xml/);
  assert.match(res.body, /^<svg /);
});

test('price endpoint reports an upstream failure without inventing a SOL price', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 429 });
  try {
    const response = await request('GET', '/api/price');
    assert.equal(response.status, 503);
    assert.equal(response.data.solana, undefined);
    assert.match(response.data.error, /HTTP 429/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('repeated verification of one invoice does not repeat RPC immediately', async () => {
  const recipient = encodeBase58(Buffer.alloc(32, 15));
  const created = await request('POST', '/api/invoices', { recipient, amount: '0.001' });
  const originalFetch = globalThis.fetch;
  process.env.PAYPROOF_VERIFY_MIN_INTERVAL_MS = '10000';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [] }), { status: 200 });
  };
  try {
    const first = await request('POST', `/api/invoices/${created.data.id}/verify`);
    const second = await request('POST', `/api/invoices/${created.data.id}/verify`);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.PAYPROOF_VERIFY_MIN_INTERVAL_MS = '0';
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
