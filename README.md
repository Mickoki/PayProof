# PayProof

PayProof is a non-custodial Solana invoice prototype for freelancers. It creates a payment link with a unique reference, then checks the finalized on-chain transaction against the recipient, asset, and exact amount. The application never asks for a wallet seed phrase or private key.

**Current scope:** Testnet and Devnet SOL; Devnet USDC verification is covered by automated tests. A [Testnet SOL payment through Phantom](https://explorer.solana.com/tx/64BQKDws3uQabDan3eDuCCxQXRBddtJEyDoQb33AgW5hz1GmYhhJA8dniR6eruENr7fWoxLcpRbK674BFPaes9S3?cluster=testnet) has been completed and matched to its invoice. This is a hackathon prototype, not a service for real customer payments.

Run with Node.js 20+: `node server.js`, then open `http://localhost:3000/`. No package installation is required for the app. Run tests with `node --test` (13 passing tests). The local invoice data and test wallet keys are excluded from Git.

## Русский

PayProof создаёт счёт на оплату в Solana и проверяет платёж по данным блокчейна. Покупатель платит напрямую в кошелёк продавца. Приложение не хранит приватные ключи.

## Быстрый запуск

Нужен **Node.js 20 или новее**. Для запуска приложения установка пакетов не требуется.

**Windows:** дважды откройте `start.cmd`, оставьте окно открытым и перейдите на <http://localhost:3000/>.

**Терминал:** в этой папке выполните `node server.js`, затем откройте <http://localhost:3000/>.

По умолчанию включён **Devnet**. В форме можно выбрать **Testnet** для счёта в тестовом SOL. Для ручного теста нужны два разных адреса: адрес продавца вводится в форму, покупатель открывает ссылку оплаты в кошельке с той же выбранной сетью. Продавцом может быть локальный тестовый адрес из `node tests/devnet/setup-wallets.mjs`, покупателем — отдельный аккаунт Phantom. Бесплатный тестовый SOL выдаёт [официальный faucet](https://faucet.solana.com/). Монеты Devnet и Testnet не взаимозаменяемы. Seed-фразу и приватный ключ в приложение вводить нельзя.

## Проверка кода

В этой папке выполните `node --test`. Должны пройти 13 тестов. Результат ранее проведённой живой проверки с двумя транзакциями — в [DEVNET_TEST.md](DEVNET_TEST.md).

## Что лежит в папке

| Файл | Назначение |
|---|---|
| `server.js`, `lib.js` | Сервер, счета, платёжные ссылки и проверка транзакций |
| `public/` | Страница создания счёта и страница оплаты |
| `*.test.js` | Автоматические тесты |
| `tests/devnet/` | Дополнительный скрипт живой проверки в devnet |
| `STATUS.md` | Что готово и что пока не проверено |
| `NEXT_STEPS.md` | Очередность дальнейшей разработки |
| `WALLET_TEST.md` | Пошаговая проверка через Phantom в Devnet |
| `HACKATHON_SUBMISSION.md` | Черновик заявки и двух видео для Colosseum |

Счета локально хранятся в `data/invoices.json`; папка создаётся при запуске и не включена в архив. Для отдельного каталога можно задать `PAYPROOF_DATA_DIR`. Тестовые секретные ключи, `node_modules` и временные результаты также не включены.

## Дополнительный живой тест

Без установки пакетов выполните `node tests/devnet/setup-wallets.mjs`: он создаст два одноразовых тестовых кошелька и покажет **только публичные адреса**. Затем скрипт в `tests/devnet/run.mjs` использует `@solana/web3.js`. В папке `tests/devnet` выполните `pnpm install --ignore-scripts`, затем `node run.mjs`. Пополните адрес покупателя через devnet faucet и запустите живой тест. Он проверит точный и неполный платёж. Файл `tests/devnet/test-keys.json` содержит тестовые секретные ключи; не загружайте его в GitHub и не пополняйте эти адреса реальными средствами.

## Важно

Это прототип. Реальный платёж USDC в основной сети и работа опубликованного сайта ещё не проверены. Не используйте приложение для платежей клиентов до выполнения пунктов из [NEXT_STEPS.md](NEXT_STEPS.md).
