import { decodeBase58, preparePhantomPayment } from './lib.js';

export function actionMetadata(invoice, origin) {
  const base = {
    type: 'action',
    icon: `${origin}/logo.svg`,
    title: `PayProof: ${invoice.description || 'SOL invoice'}`,
    description: `Pay ${invoice.amount} SOL directly to the seller on Devnet. Check the recipient and amount in your wallet.`,
    label: `Pay ${invoice.amount} SOL`
  };
  if (invoice.network !== 'devnet' || invoice.asset !== 'SOL')
    return { ...base, disabled: true, error: { message: 'This test Blink supports Devnet SOL only.' } };
  if (invoice.status !== 'pending')
    return { ...base, disabled: true, error: { message: 'This invoice has already been paid.' } };
  return base;
}

export async function actionTransaction(invoice, account) {
  if (invoice.network !== 'devnet' || invoice.asset !== 'SOL')
    throw new Error('This test Blink supports Devnet SOL only.');
  const prepared = await preparePhantomPayment(invoice, account);
  return {
    type: 'transaction',
    transaction: decodeBase58(prepared.transaction).toString('base64'),
    message: `Pay PayProof invoice ${invoice.id} on Devnet`
  };
}
