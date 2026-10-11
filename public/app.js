let curId = null;
let timer = null;
let curNetwork = 'devnet';
let curInvoice = null;
let solQuote = null;
const f = document.getElementById('pay-form');
const cv = document.getElementById('create-view');
const iv = document.getElementById('invoice-view');
const networkSelect = f.elements.network;
const assetSelect = f.elements.asset;
const usdInput = document.getElementById('f-usd');
const rateHint = document.getElementById('rate-hint');
function recalcAmount() {
  const usd = Number(usdInput.value);
  if (!usdInput.value || !Number.isFinite(usd) || usd <= 0) return;
  if (assetSelect.value === 'USDC') f.elements.amount.value = usd.toFixed(2);
  else if (solQuote && Date.now() - solQuote.fetchedAt < 120_000)
    f.elements.amount.value = (usd / solQuote.usd).toFixed(9);
}
async function loadPrice() {
  try {
    const response = await fetch('/api/price');
    const data = await response.json();
    if (!response.ok || !Number.isFinite(data.solana?.usd) || data.solana.usd <= 0)
      throw new Error(data.error || 'Invalid price response');
    solQuote = data.solana;
    rateHint.textContent = `Quote at ${new Date(solQuote.fetchedAt).toLocaleString()}: 1 SOL ≈ $${solQuote.usd.toFixed(2)}. You can edit the SOL amount manually.`;
    recalcAmount();
  } catch (error) {
    solQuote = null;
    rateHint.textContent = `Automatic calculation is unavailable: ${error.message}. Enter the SOL amount manually and leave USD blank.`;
  }
}
usdInput.addEventListener('input', recalcAmount);
assetSelect.addEventListener('change', recalcAmount);
f.elements.amount.addEventListener('input', () => { if (usdInput.value) usdInput.value = ''; });
loadPrice();
setInterval(loadPrice, 60_000);
networkSelect.onchange = () => {
  assetSelect.querySelector('option[value="USDC"]').disabled = networkSelect.value === 'testnet';
  if (networkSelect.value === 'testnet' && assetSelect.value === 'USDC') assetSelect.value = 'SOL';
  recalcAmount();
};

function showReceipt(invoice) {
  document.getElementById('inv-receipt').classList.toggle('hidden', invoice.status !== 'paid');
  if (invoice.status !== 'paid') return;
  for (const [id, value] of Object.entries({
    'receipt-network': invoice.network || 'devnet',
    'receipt-recipient': invoice.recipient,
    'receipt-reference': invoice.reference,
    'receipt-signature': invoice.txSignature || '',
    'receipt-created': invoice.createdAt ? new Date(invoice.createdAt).toLocaleString() : '',
    'receipt-paid': invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : ''
  })) document.getElementById(id).textContent = value;
}

function show(i) {
  curId = i.id;
  curInvoice = i;
  curNetwork = i.network || 'devnet';
  clearInterval(timer);
  cv.classList.add('hidden');
  iv.classList.remove('hidden');
  document.getElementById('inv-desc').innerText = i.description || 'Invoice';
  document.getElementById('inv-amt').innerText = i.amount;
  document.getElementById('inv-asset').innerText = i.asset;
  document.getElementById('inv-network-note').innerText = 'Payment network: ' + (curNetwork === 'testnet' ? 'Testnet' : 'Devnet') + '. Select the same network in your wallet.';
  document.getElementById('inv-link').value = i.solanaPayUrl;
  document.getElementById('inv-page-link').value = new URL('/invoice/' + encodeURIComponent(i.id), location.origin).href;
  document.getElementById('inv-local-note').classList.toggle('hidden', !['localhost', '127.0.0.1'].includes(location.hostname));
  document.getElementById('inv-wallet').href = i.solanaPayUrl;
  const blink = document.getElementById('inv-blink');
  const canBlink = i.network === 'devnet' && i.asset === 'SOL' && i.status === 'pending' && location.protocol === 'https:';
  blink.classList.toggle('hidden', !canBlink);
  if (canBlink) blink.href = 'https://dial.to/devnet?action=' + encodeURIComponent(
    'solana-action:' + location.origin + '/api/actions/pay/' + encodeURIComponent(i.id));
  document.getElementById('inv-phantom').classList.toggle('hidden', i.asset !== 'SOL' || i.status === 'paid');
  document.getElementById('inv-qr').src = '/api/invoices/' + encodeURIComponent(i.id) + '/qr.svg';
  showReceipt(i);
  updateStat(i.status, i.txSignature);
  if (i.status !== 'paid') {
    timer = setInterval(check, 12000);
  }
}

function updateStat(st, sig) {
  const el = document.getElementById('inv-stat');
  if (st === 'paid') {
    curInvoice.status = 'paid';
    curInvoice.txSignature = sig;
    showReceipt(curInvoice);
    el.innerText = 'Paid';
    el.className = 'status paid';
    clearInterval(timer);
    document.getElementById('inv-phantom').classList.add('hidden');
    document.getElementById('inv-blink').classList.add('hidden');
    if (sig) {
      const exp = document.getElementById('inv-explorer');
      exp.href = 'https://explorer.solana.com/tx/' + encodeURIComponent(sig) + '?cluster=' + curNetwork;
      exp.classList.remove('hidden');
    }
  }
}

async function check() {
  if (!curId) return;
  const msg = document.getElementById('inv-msg');
  msg.innerText = 'Checking Solana...';
  try {
    const res = await fetch('/api/invoices/' + curId + '/verify', { method: 'POST' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Could not check payment');
    if (d.status === 'paid') {
      curInvoice.paidAt = d.paidAt;
      updateStat('paid', d.txSignature);
      msg.innerText = 'Payment confirmed!';
    } else {
      msg.innerText = d.reason || 'Payment has not been confirmed yet.';
    }
  } catch (error) {
    msg.innerText = error.message;
  }
}

f.onsubmit = async (e) => {
  e.preventDefault();
  const errorMessage = document.getElementById('form-error');
  errorMessage.innerText = '';
  try {
    if (assetSelect.value === 'SOL' && usdInput.value && (!solQuote || Date.now() - solQuote.fetchedAt >= 120_000))
      throw new Error('The SOL quote is unavailable. Clear USD and enter the SOL amount manually.');
    const fd = new FormData(f);
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: fd.get('recipient'),
        amount: fd.get('amount'),
        asset: fd.get('asset'),
        network: fd.get('network'),
        description: fd.get('description')
      })
    });
    const inv = await res.json();
    if (!res.ok) throw new Error(inv.error || 'Could not create invoice');
    history.pushState(null, '', '/invoice/' + encodeURIComponent(inv.id));
    show(inv);
  } catch (error) {
    errorMessage.innerText = error.message;
  }
};
document.getElementById('inv-check').onclick = check;
document.getElementById('inv-print').onclick = () => window.print();
document.getElementById('inv-phantom').onclick = async () => {
  const msg = document.getElementById('inv-wallet-msg');
  const button = document.getElementById('inv-phantom');
  const provider = window.phantom?.solana;
  if (!provider?.isPhantom) {
    msg.innerText = 'Phantom was not found. Open this page in Chrome with the Phantom extension installed.';
    return;
  }
  button.disabled = true;
  try {
    msg.innerText = 'Connecting to Phantom...';
    const { publicKey } = await provider.connect();
    const payer = publicKey.toString();
    msg.innerText = 'Phantom connected: ' + payer.slice(0, 6) + '…' + payer.slice(-4) + '. Preparing payment...';
    if (payer === curInvoice.recipient) throw new Error('You selected the seller wallet. Switch to the buyer wallet.');
    msg.innerText = 'Preparing payment on ' + (curNetwork === 'testnet' ? 'Testnet' : 'Devnet') + '...';
    const res = await fetch('/api/invoices/' + encodeURIComponent(curId) + '/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payer })
    });
    const prepared = await res.json();
    if (!res.ok) throw new Error(prepared.error || 'Could not prepare payment');
    msg.innerText = 'Confirm in Phantom. Check the network, amount and recipient.';
    const sent = await provider.request({ method: 'signAndSendTransaction', params: { message: prepared.transaction } });
    if (!sent?.signature) throw new Error('Phantom did not return a transaction signature');
    msg.innerText = 'Transaction sent. Waiting for confirmation...';
    setTimeout(check, 3000);
  } catch (error) {
    msg.innerText = error.message || 'Could not send payment through Phantom';
  } finally {
    button.disabled = false;
  }
};
document.getElementById('inv-copy').onclick = async () => {
  const field = document.getElementById('inv-page-link');
  try {
    await navigator.clipboard.writeText(field.value);
    document.getElementById('inv-copy').innerText = 'Link copied';
  } catch {
    field.select();
    document.getElementById('inv-copy').innerText = 'Selected: press Ctrl+C';
  }
};
window.addEventListener('popstate', () => location.reload());

const invoiceId = location.pathname.match(/^\/invoice\/([^/]+)$/)?.[1];
if (invoiceId) {
  fetch('/api/invoices/' + encodeURIComponent(invoiceId))
    .then(async res => {
      const invoice = await res.json();
      if (!res.ok) throw new Error(invoice.error || 'Could not open invoice');
      show(invoice);
    })
    .catch(error => { document.getElementById('form-error').innerText = error.message; });
}
