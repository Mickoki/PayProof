import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InvoiceStore, verifyPaymentOnChain, preparePhantomPayment } from './lib.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const store = new InvoiceStore(path.join(process.env.PAYPROOF_DATA_DIR || path.join(root, 'data'), 'invoices.json'));
await store.init();

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function handle(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'POST' && url.pathname === '/api/invoices') {
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
        const result = await verifyPaymentOnChain(invoice, signature => store.hasSignature(signature));
        if (result.paid && invoice.status !== 'paid') await store.markPaid(invoice.id, result.signature);
        return json(res, 200, { status: invoice.status, txSignature: invoice.txSignature,
          signature: invoice.txSignature, reason: result.reason });
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
