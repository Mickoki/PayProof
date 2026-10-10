import { Keypair, Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';

const workDir = path.dirname(fileURLToPath(import.meta.url));
process.env.PAYPROOF_DATA_DIR = await mkdtemp(path.join(workDir, 'run-'));
process.env.PAYPROOF_NETWORK = 'devnet';
process.env.PAYPROOF_ASSET = 'SOL';
const { handle } = await import('../../server.js');
const connection = new Connection('https://api.devnet.solana.com', 'finalized');

async function request(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3000' };
  const res = {
    status: 0, body: null, headersSent: false,
    writeHead(status) { this.status = status; this.headersSent = true; },
    end(content) { this.body = content ? JSON.parse(content) : null; }
  };
  await handle(req, res);
  return res;
}

let sender;
let recipient;
const keyFile = path.join(workDir, 'test-keys.json');
try {
  const stored = JSON.parse(await readFile(keyFile, 'utf8'));
  sender = Keypair.fromSecretKey(Uint8Array.from(stored.sender));
  recipient = Keypair.fromSecretKey(Uint8Array.from(stored.recipient));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  sender = Keypair.generate();
  recipient = Keypair.generate();
  await writeFile(keyFile, JSON.stringify({ sender: [...sender.secretKey], recipient: [...recipient.secretKey] }));
}
const created = await request('POST', '/api/invoices', {
  recipient: recipient.publicKey.toBase58(), amount: '0.001', description: 'Devnet smoke test'
});
if (created.status !== 201) throw new Error(`Invoice failed: ${JSON.stringify(created.body)}`);
const invoice = created.body;
const reference = new PublicKey(new URL(invoice.paymentUrl).searchParams.get('reference'));
console.log(`Invoice created: ${invoice.id}`);
console.log(`Test sender: ${sender.publicKey.toBase58()}`);
const balance = await connection.getBalance(sender.publicKey);
if (balance < 0.002 * LAMPORTS_PER_SOL) {
  throw new Error('Test wallet needs devnet SOL from https://faucet.solana.com');
}

const instruction = SystemProgram.transfer({
  fromPubkey: sender.publicKey,
  toPubkey: recipient.publicKey,
  lamports: 0.001 * LAMPORTS_PER_SOL
});
instruction.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
const signature = await sendAndConfirmTransaction(connection, new Transaction().add(instruction), [sender], { commitment: 'finalized' });
console.log(`Transfer finalized: ${signature}`);

let paid = false;
for (let attempt = 0; attempt < 10; attempt++) {
  const result = await request('GET', `/api/invoices/${invoice.id}/verify`);
  if (result.body.status === 'paid') {
    paid = true;
    console.log(`PayProof verified: ${result.body.signature}`);
    break;
  }
  await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!paid) throw new Error('PayProof did not mark the finalized transaction as paid');

const underpaid = await request('POST', '/api/invoices', {
  recipient: recipient.publicKey.toBase58(), amount: '0.001', description: 'Underpayment check'
});
if (underpaid.status !== 201) throw new Error(`Second invoice failed: ${JSON.stringify(underpaid.body)}`);
const underpaidReference = new PublicKey(new URL(underpaid.body.paymentUrl).searchParams.get('reference'));
const shortPayment = SystemProgram.transfer({
  fromPubkey: sender.publicKey,
  toPubkey: recipient.publicKey,
  lamports: 0.0005 * LAMPORTS_PER_SOL
});
shortPayment.keys.push({ pubkey: underpaidReference, isSigner: false, isWritable: false });
const shortSignature = await sendAndConfirmTransaction(connection, new Transaction().add(shortPayment), [sender], { commitment: 'finalized' });
const underpaidResult = await request('GET', `/api/invoices/${underpaid.body.id}/verify`);
if (underpaidResult.body.status !== 'pending') throw new Error('Underpaid invoice was incorrectly marked paid');
console.log(`Underpayment rejected: ${shortSignature}`);
