import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const NETWORKS = {
  devnet: { rpc: 'https://api.devnet.solana.com', usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' },
  testnet: { rpc: 'https://api.testnet.solana.com' }
};

export function encodeBase58(buffer) {
  const bytes = Uint8Array.from(buffer);
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes++;
  let num = 0n;
  for (let i = zeroes; i < bytes.length; i++) num = (num << 8n) + BigInt(bytes[i]);
  let str = '';
  while (num > 0n) { str = B58[Number(num % 58n)] + str; num /= 58n; }
  return '1'.repeat(zeroes) + str;
}

export function decodeBase58(value) {
  if (typeof value !== 'string' || !value || [...value].some(c => !B58.includes(c))) throw new Error('Некорректный адрес кошелька');
  let num = 0n;
  for (const c of value) num = num * 58n + BigInt(B58.indexOf(c));
  const bytes = [];
  while (num > 0n) { bytes.unshift(Number(num & 255n)); num >>= 8n; }
  return Buffer.from([...Array(value.match(/^1*/)[0].length).fill(0), ...bytes]);
}

export function assertAddress(value) {
  const bytes = decodeBase58(value);
  if (bytes.length !== 32 || bytes.every(b => b === 0)) throw new Error('Укажите действительный адрес кошелька Solana');
  return value;
}

export function generateReference() { return encodeBase58(crypto.randomBytes(32)); }

export function parseAmount(value, decimals) {
  const str = String(value);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(str)) throw new Error('Укажите положительную сумму');
  const [whole, fraction = ''] = str.split('.');
  if (fraction.length > decimals) throw new Error(`Слишком много знаков после запятой: максимум ${decimals}`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units <= 0n || units > 9_000_000_000_000_000_000n) throw new Error('Сумма вне допустимого диапазона');
  return { display: str, units: units.toString() };
}

export function buildSolanaPayUrl({ recipient, amount, reference, asset, description = '', network = 'devnet' }) {
  const url = new URL(`solana:${recipient}`);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('reference', reference);
  url.searchParams.set('label', 'PayProof');
  if (description) url.searchParams.set('message', description);
  if (asset === 'USDC') {
    if (!NETWORKS[network]?.usdc) throw new Error('USDC доступен только в Devnet');
    url.searchParams.set('spl-token', NETWORKS[network].usdc);
  }
  return url.toString();
}

export function buildSolTransferMessage(invoice, payer, recentBlockhash) {
  if (invoice.asset !== 'SOL') throw new Error('Оплата через Phantom в Chrome пока доступна только для SOL');
  assertAddress(payer);
  if (payer === invoice.recipient) throw new Error('Кошелёк покупателя должен отличаться от кошелька продавца');
  const keys = [payer, invoice.recipient, '11111111111111111111111111111111', invoice.reference];
  const blockhash = decodeBase58(recentBlockhash);
  if (blockhash.length !== 32) throw new Error('Некорректный blockhash Solana');
  const lamports = BigInt(invoice.amountUnits);
  if (lamports <= 0n || lamports > 0xffffffffffffffffn) throw new Error('Некорректная сумма счёта');
  const instruction = Buffer.alloc(12);
  instruction.writeUInt32LE(2, 0); // SystemProgram.Transfer
  instruction.writeBigUInt64LE(lamports, 4);
  const message = Buffer.concat([
    Buffer.from([1, 0, 2, 4]), // signer, readonly signer, readonly unsigned, account count
    ...keys.map(key => {
      const bytes = decodeBase58(key);
      if (bytes.length !== 32) throw new Error('Некорректный ключ транзакции');
      return bytes;
    }),
    blockhash,
    Buffer.from([1, 2, 3, 0, 1, 3, 12]), // one instruction: System Program, payer, recipient, reference
    instruction
  ]);
  return encodeBase58(message);
}

export function buildUnsignedSolTransaction(invoice, payer, recentBlockhash) {
  const message = decodeBase58(buildSolTransferMessage(invoice, payer, recentBlockhash));
  // A legacy transaction starts with the signature count and 64-byte slots.
  // Phantom fills the empty payer signature before submitting it.
  return encodeBase58(Buffer.concat([Buffer.from([1]), Buffer.alloc(64), message]));
}

export function transactionMatches(invoice, tx) {
  if (!tx?.transaction?.message?.accountKeys || !tx?.meta || tx.meta.err) return false;
  const keys = tx.transaction.message.accountKeys.map(k => typeof k === 'string' ? k : k.pubkey);
  if (!keys.includes(invoice.reference)) return false;
  const expected = BigInt(invoice.amountUnits || parseAmount(invoice.amount, invoice.asset === 'SOL' ? 9 : 6).units);

  if (invoice.asset === 'SOL') {
    const index = keys.indexOf(invoice.recipient);
    if (index < 0) return false;
    const before = tx.meta.preBalances?.[index];
    const after = tx.meta.postBalances?.[index];
    return Number.isSafeInteger(before) && Number.isSafeInteger(after) && BigInt(after) - BigInt(before) === expected;
  }

  if (invoice.asset !== 'USDC') return false;
  const mint = NETWORKS[invoice.network || 'devnet']?.usdc;
  if (!mint) return false;
  const balanceMap = balances => {
    const map = new Map();
    for (const item of balances || []) {
      if (item.owner === invoice.recipient && item.mint === mint && /^\d+$/.test(item.uiTokenAmount?.amount || '')) {
        map.set(item.accountIndex, BigInt(item.uiTokenAmount.amount));
      }
    }
    return map;
  };
  const pre = balanceMap(tx.meta.preTokenBalances);
  const post = balanceMap(tx.meta.postTokenBalances);
  if (!post.size) return false;
  let delta = 0n;
  for (const [index, balance] of post) delta += balance - (pre.get(index) || 0n);
  for (const [index, balance] of pre) if (!post.has(index)) delta -= balance;
  return delta === expected;
}

export class InvoiceStore {
  constructor(filePath) { this.filePath = filePath; this.invoices = new Map(); }
  async init() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      for (const item of JSON.parse(await fs.readFile(this.filePath, 'utf8'))) this.invoices.set(item.id, item);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
  }
  async save() { await fs.writeFile(this.filePath, JSON.stringify([...this.invoices.values()], null, 2), 'utf8'); }
  get(id) { return this.invoices.get(id); }
  hasSignature(signature) { return [...this.invoices.values()].some(i => i.txSignature === signature); }
  async create({ recipient, amount, asset = 'SOL', description = '', network = 'devnet' }) {
    assertAddress(recipient);
    if (!Object.hasOwn(NETWORKS, network)) throw new Error('Выберите Devnet или Testnet');
    if (!['SOL', 'USDC'].includes(asset)) throw new Error('Поддерживаются только SOL и USDC');
    if (asset === 'USDC' && !NETWORKS[network].usdc) throw new Error('USDC доступен только в Devnet');
    if (typeof description !== 'string' || description.length > 200) throw new Error('Описание слишком длинное');
    const parsed = parseAmount(amount, asset === 'SOL' ? 9 : 6);
    const id = crypto.randomUUID();
    const reference = generateReference();
    const paymentUrl = buildSolanaPayUrl({ recipient, amount: parsed.display, reference, asset, description, network });
    const invoice = { id, recipient, amount: parsed.display, amountUnits: parsed.units, asset, network, description,
      reference, paymentUrl, solanaPayUrl: paymentUrl, status: 'pending', txSignature: null, createdAt: new Date().toISOString() };
    this.invoices.set(id, invoice);
    await this.save();
    return invoice;
  }
  async markPaid(id, signature) {
    const invoice = this.invoices.get(id);
    if (!invoice || invoice.status === 'paid' || this.hasSignature(signature)) return false;
    invoice.status = 'paid';
    invoice.txSignature = signature;
    invoice.paidAt = new Date().toISOString();
    await this.save();
    return true;
  }
}

async function rpcCall(rpc, method, params) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  if (!response.ok) throw new Error(`Solana RPC: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Solana RPC: ${data.error.message || 'ошибка'}`);
  return data.result;
}

function rpcFor(network) {
  if (!Object.hasOwn(NETWORKS, network)) throw new Error('Неизвестная сеть счёта');
  return (network === 'testnet' ? process.env.PAYPROOF_TESTNET_RPC_URL : process.env.PAYPROOF_RPC_URL) || NETWORKS[network].rpc;
}

export async function preparePhantomPayment(invoice, payer) {
  if (invoice.status !== 'pending') throw new Error('Этот счёт уже оплачен');
  if (invoice.asset !== 'SOL') throw new Error('Оплата через Phantom в Chrome пока доступна только для SOL');
  assertAddress(payer);
  const network = invoice.network || 'devnet';
  const result = await rpcCall(rpcFor(network), 'getLatestBlockhash', [{ commitment: 'finalized' }]);
  return { transaction: buildUnsignedSolTransaction(invoice, payer, result?.value?.blockhash), network };
}

export async function verifyPaymentOnChain(invoice, isUsed = () => false) {
  if (invoice.status === 'paid') return { paid: true, signature: invoice.txSignature };
  const network = invoice.network || 'devnet';
  const rpc = rpcFor(network);
  const signatures = await rpcCall(rpc, 'getSignaturesForAddress', [invoice.reference, { limit: 20, commitment: 'finalized' }]);
  if (!signatures?.length) return { paid: false, reason: 'Платёж ещё не отправлен или ожидает подтверждения в блокчейне' };
  for (const item of signatures) {
    if (item.err || isUsed(item.signature)) continue;
    const tx = await rpcCall(rpc, 'getTransaction', [item.signature,
      { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]);
    if (transactionMatches(invoice, tx)) return { paid: true, signature: item.signature };
  }
  return { paid: false, reason: 'Сумма, токен или получатель не совпадают' };
}
