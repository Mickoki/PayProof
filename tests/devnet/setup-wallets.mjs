import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeBase58 } from '../../lib.js';

const keyFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test-keys.json');

function createWallet() {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKey = createPublicKey(privateKey);
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  const seed = privateDer.subarray(-32);
  const address = publicDer.subarray(-32);
  const message = Buffer.from('PayProof devnet wallet check');
  const restored = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  const restoredAddress = createPublicKey(restored).export({ format: 'der', type: 'spki' }).subarray(-32);
  if (seed.length !== 32 || address.length !== 32 || !restoredAddress.equals(address) ||
      !verify(null, message, publicKey, sign(null, message, privateKey))) {
    throw new Error('Не удалось проверить созданный ключ');
  }
  return [...seed, ...address];
}

let wallets;
try {
  wallets = JSON.parse(await readFile(keyFile, 'utf8'));
  console.log('Используются уже созданные тестовые кошельки.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  wallets = { sender: createWallet(), recipient: createWallet() };
  const file = await open(keyFile, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(wallets), 'utf8'); }
  finally { await file.close(); }
  console.log('Созданы два одноразовых тестовых кошелька.');
}

for (const name of ['sender', 'recipient']) {
  const key = wallets[name];
  if (!Array.isArray(key) || key.length !== 64 || key.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error(`Повреждён ключ ${name} в test-keys.json`);
  }
  const restored = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(key.slice(0, 32))]), format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(restored).export({ format: 'der', type: 'spki' }).subarray(-32);
  if (!publicKey.equals(Buffer.from(key.slice(32)))) throw new Error(`Не совпадает публичный ключ ${name}`);
  console.log(`${name === 'sender' ? 'Покупатель' : 'Продавец'}: ${encodeBase58(Buffer.from(key.slice(32)))}`);
}
console.log('Секретные ключи сохранены локально в tests/devnet/test-keys.json и не выводятся.');
