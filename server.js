import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvoiceStore, verifyPaymentOnChain, preparePhantomPayment, getSolPrice } from './lib.js';
import { actionMetadata, actionTransaction } from './actions.js';
import { paymentQrSvg } from './qr.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const store = new InvoiceStore(path.join(process.env.PAYPROOF_DATA_DIR || process.env.DATA_DIR || path.join(root, 'data'), 'invoices.json'));
await store.init();

const hits = new Map();
const lastVerify = new Map();
setInterval(() => { hits.clear(); lastVerify.clear(); }, 600_000).unref();
function rateLimited(req, scope, max, windowMs) {
  if (max <= 0) return false;
  const forwarded = process.env.PAYPROOF_TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
  const ip = forwarded || req.socket?.remoteAddress || 'local';
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
const actionCors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,Content-Encoding,Accept-Encoding'
};
function actionJson(res, status, body) {
  res.writeHead(status, { ...actionCors, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function handle(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const actionRoute = url.pathname.match(/^\/api\/actions\/pay\/([^/]+)$/);
    if (url.pathname === '/actions.json' || actionRoute) {
      if (req.method === 'OPTIONS') { res.writeHead(204, actionCors); return res.end(); }
      if (url.pathname === '/actions.json') {
        if (req.method !== 'GET') return actionJson(res, 405, { message: 'Method not allowed' });
        return actionJson(res, 200, { rules: [{ pathPattern: '/invoice/*', apiPath: '/api/actions/pay/*' }] });
      }
      const invoice = store.get(actionRoute[1]);
      if (!invoice) return actionJson(res, 404, { message: 'Invoice not found' });
      const protocol = process.env.PAYPROOF_TRUST_PROXY === '1'
        ? String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() : 'http';
      const origin = process.env.PAYPROOF_PUBLIC_ORIGIN || `${protocol}://${req.headers.host}`;
      if (req.method === 'GET') return actionJson(res, 200, actionMetadata(invoice, origin));
      if (req.method === 'POST') {
        if (rateLimited(req, 'action', 20, 60_000)) return actionJson(res, 429, { message: 'Too many requests' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) return actionJson(res, 413, { message: 'Request too large' });
        }
        let input;
        try { input = JSON.parse(body); } catch { return actionJson(res, 400, { message: 'Invalid JSON' }); }
        try { return actionJson(res, 200, await actionTransaction(invoice, input?.account)); }
        catch (error) { return actionJson(res, 400, { message: error.message }); }
      }
      return actionJson(res, 405, { message: 'Method not allowed' });
    }
    if (req.method === 'GET' && url.pathname === '/api/price') {
      try { return json(res, 200, { solana: await getSolPrice() }); }
      catch (error) { return json(res, 503, { error: error.message }); }
    }
    const qrRoute = url.pathname.match(/^\/api\/invoices\/([^/]+)\/qr\.svg$/);
    if (qrRoute && req.method === 'GET') {
      const invoice = store.get(qrRoute[1]);
      if (!invoice) return json(res, 404, { error: 'Счёт не найден' });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(paymentQrSvg(invoice.solanaPayUrl));
    }
    if (req.method === 'POST' && url.pathname === '/api/invoices') {
      if (rateLimited(req, 'create', Number(process.env.PAYPROOF_CREATE_PER_HOUR ?? 30), 3_600_000))
        return json(res, 429, { error: 'Слишком много новых счетов. Попробуйте позже.' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 8192) return json(res, 413, { error: 'Запрос слишком большой' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Некорректный JSON' }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json(res, 400, { error: 'Некорректный счёт' });
      try { return json(res, 201, await store.create(input)); }
      catch (error) { return json(res, 400, { error: error.message }); }
    }

    const invoiceRoute = url.pathname.match(/^\/api\/invoices\/([^/]+)(\/(?:verify|prepare))?$/);
    if (invoiceRoute) {
      const invoice = store.get(invoiceRoute[1]);
      if (!invoice) return json(res, 404, { error: 'Счёт не найден' });
      if (!invoiceRoute[2] && req.method === 'GET') return json(res, 200, invoice);
      if (invoiceRoute[2] === '/prepare' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 8192) return json(res, 413, { error: 'Запрос слишком большой' });
        }
        let input;
        try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Некорректный JSON' }); }
        try { return json(res, 200, await preparePhantomPayment(invoice, input?.payer)); }
        catch (error) { return json(res, 400, { error: error.message }); }
      }
      if (invoiceRoute[2] === '/verify' && (req.method === 'POST' || req.method === 'GET')) {
        if (rateLimited(req, 'verify', Number(process.env.PAYPROOF_VERIFY_PER_MIN ?? 60), 60_000))
          return json(res, 429, { error: 'Слишком много проверок. Попробуйте позже.' });
        const interval = Number(process.env.PAYPROOF_VERIFY_MIN_INTERVAL_MS ?? 3000);
        const now = Date.now();
        if (invoice.status !== 'paid' && interval > 0 && now - (lastVerify.get(invoice.id) || 0) < interval)
          return json(res, 200, { status: invoice.status, txSignature: invoice.txSignature,
            signature: invoice.txSignature, reason: 'Please wait a few seconds before checking again' });
        lastVerify.set(invoice.id, now);
        const result = await verifyPaymentOnChain(invoice, signature => store.hasSignature(signature));
        if (result.paid && invoice.status !== 'paid') await store.markPaid(invoice.id, result.signature);
        return json(res, 200, { status: invoice.status, txSignature: invoice.txSignature,
          signature: invoice.txSignature, paidAt: invoice.paidAt, reason: result.reason });
      }
      return json(res, 405, { error: 'Метод не поддерживается' });
    }
    if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Не найдено' });
    if (req.method !== 'GET') return json(res, 405, { error: 'Метод не поддерживается' });

    const requestPath = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(publicDir, '.' + requestPath);
    if (!file.startsWith(publicDir + path.sep)) return json(res, 404, { error: 'Не найдено' });
    try {
      const content = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(content);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const content = await fs.readFile(path.join(publicDir, 'index.html'));
      res.writeHead(200, { 'Content-Type': mime['.html'], 'Cache-Control': 'no-store' });
      return res.end(content);
    }
  } catch (error) {
    return json(res, 503, { error: error.message });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  http.createServer(handle).listen(port, () => console.log(`PayProof running on http://localhost:${port}/`));
}
