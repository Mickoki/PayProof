let curId = null;
let timer = null;
let curNetwork = 'devnet';
let curInvoice = null;
const f = document.getElementById('pay-form');
const cv = document.getElementById('create-view');
const iv = document.getElementById('invoice-view');
const networkSelect = f.elements.network;
const assetSelect = f.elements.asset;
networkSelect.onchange = () => {
  assetSelect.querySelector('option[value="USDC"]').disabled = networkSelect.value === 'testnet';
  if (networkSelect.value === 'testnet' && assetSelect.value === 'USDC') assetSelect.value = 'SOL';
};

function show(i) {
  curId = i.id;
  curInvoice = i;
  curNetwork = i.network || 'devnet';
  clearInterval(timer);
  cv.classList.add('hidden');
  iv.classList.remove('hidden');
  document.getElementById('inv-desc').innerText = i.description || 'Счёт на оплату';
  document.getElementById('inv-amt').innerText = i.amount;
  document.getElementById('inv-asset').innerText = i.asset;
  document.getElementById('inv-network-note').innerText = 'Сеть оплаты: ' + (curNetwork === 'testnet' ? 'Testnet' : 'Devnet') + '. В кошельке выберите эту же сеть перед оплатой.';
  document.getElementById('inv-link').value = i.solanaPayUrl;
  document.getElementById('inv-page-link').value = new URL('/invoice/' + encodeURIComponent(i.id), location.origin).href;
  document.getElementById('inv-local-note').classList.toggle('hidden', !['localhost', '127.0.0.1'].includes(location.hostname));
  document.getElementById('inv-wallet').href = i.solanaPayUrl;
  document.getElementById('inv-phantom').classList.toggle('hidden', i.asset !== 'SOL' || i.status === 'paid');
  document.getElementById('inv-qr').src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(i.solanaPayUrl);
  updateStat(i.status, i.txSignature);
  if (i.status !== 'paid') {
    timer = setInterval(check, 12000);
  }
}

function updateStat(st, sig) {
  const el = document.getElementById('inv-stat');
  if (st === 'paid') {
    el.innerText = 'Оплачено';
    el.className = 'status paid';
    clearInterval(timer);
    document.getElementById('inv-phantom').classList.add('hidden');
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
  msg.innerText = 'Проверка блокчейна...';
  try {
    const res = await fetch('/api/invoices/' + curId + '/verify', { method: 'POST' });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Не удалось проверить платёж');
    if (d.status === 'paid') {
      updateStat('paid', d.txSignature);
      msg.innerText = 'Платёж подтверждён!';
    } else {
      msg.innerText = d.reason || 'Платёж пока не зафиксирован.';
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
    if (!res.ok) throw new Error(inv.error || 'Не удалось создать счёт');
    history.pushState(null, '', '/invoice/' + encodeURIComponent(inv.id));
    show(inv);
  } catch (error) {
    errorMessage.innerText = error.message;
  }
};
document.getElementById('inv-check').onclick = check;
document.getElementById('inv-phantom').onclick = async () => {
  const msg = document.getElementById('inv-wallet-msg');
  const button = document.getElementById('inv-phantom');
  const provider = window.phantom?.solana;
  if (!provider?.isPhantom) {
    msg.innerText = 'Phantom не найден. Откройте страницу напрямую в Chrome, где установлено расширение Phantom.';
    return;
  }
  button.disabled = true;
  try {
    msg.innerText = 'Подключение Phantom...';
    const { publicKey } = await provider.connect();
    const payer = publicKey.toString();
    msg.innerText = 'Phantom подключён: ' + payer.slice(0, 6) + '…' + payer.slice(-4) + '. Подготовка платежа...';
    if (payer === curInvoice.recipient) throw new Error('Выбран кошелёк продавца. Переключитесь на кошелёк покупателя.');
    msg.innerText = 'Подготовка платежа в ' + (curNetwork === 'testnet' ? 'Testnet' : 'Devnet') + '...';
    const res = await fetch('/api/invoices/' + encodeURIComponent(curId) + '/prepare', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payer })
    });
    const prepared = await res.json();
    if (!res.ok) throw new Error(prepared.error || 'Не удалось подготовить платёж');
    msg.innerText = 'Подтвердите перевод в Phantom. Проверьте сеть, сумму и получателя.';
    const sent = await provider.request({ method: 'signAndSendTransaction', params: { message: prepared.transaction } });
    if (!sent?.signature) throw new Error('Phantom не вернул подпись транзакции');
    msg.innerText = 'Транзакция отправлена. Ожидаем подтверждения в блокчейне...';
    setTimeout(check, 3000);
  } catch (error) {
    msg.innerText = error.message || 'Не удалось отправить платёж через Phantom';
  } finally {
    button.disabled = false;
  }
};
document.getElementById('inv-copy').onclick = async () => {
  const field = document.getElementById('inv-page-link');
  try {
    await navigator.clipboard.writeText(field.value);
    document.getElementById('inv-copy').innerText = 'Ссылка скопирована';
  } catch {
    field.select();
    document.getElementById('inv-copy').innerText = 'Выделено: нажмите Ctrl+C';
  }
};
window.addEventListener('popstate', () => location.reload());

const invoiceId = location.pathname.match(/^\/invoice\/([^/]+)$/)?.[1];
if (invoiceId) {
  fetch('/api/invoices/' + encodeURIComponent(invoiceId))
    .then(async res => {
      const invoice = await res.json();
      if (!res.ok) throw new Error(invoice.error || 'Не удалось открыть счёт');
      show(invoice);
    })
    .catch(error => { document.getElementById('form-error').innerText = error.message; });
}
