# PayProof status — October 11, 2026

## Implemented

- Shareable Devnet and Testnet invoice pages, unique on-chain references and Phantom payment preparation for SOL.
- Exact recipient balance increase checks for SOL and Devnet USDC in integer base units. Matching uses `confirmed` commitment and rejects a transaction signature already assigned to another invoice.
- Printable payment record with invoice and transaction details. It is a browser print/PDF view, not a signed attestation.
- Optional USD-to-SOL calculation from a recent CoinGecko quote. Failed price requests return an error; no fallback price is used.
- In-memory creation and verification limits, a per-invoice RPC cooldown, a temporary free Render Blueprint, and an optional paid Blueprint with a persistent disk.
- Locally generated Solana Pay QR codes; experimental Devnet SOL Action endpoint and Dialect link.
- `node --test`: 18 tests pass on the current code.

## Verified outside mocks

- On October 11, the current build matched a fresh Phantom payment of 0.001 Testnet SOL to invoice `ba1fc06c-2bc1-4ad6-ad34-50c7f69c1ceb` and displayed `paid`. An independent Testnet RPC query found the invoice reference and a 1,000,000-lamport increase at the recipient address. The browser payment record was saved as PDF. See [DEVNET_TEST.md](DEVNET_TEST.md) for the transaction.
- An earlier Phantom Chrome payment of 0.001 Testnet SOL was matched on October 10.
- The free Render service at [payproof-demo.onrender.com](https://payproof-demo.onrender.com/) deployed commit `8e1333d` on October 11. A hosted Testnet invoice was created and reopened successfully, its QR code displayed, and payment verification returned pending for the unpaid invoice. The hosted payment flow has not yet been exercised with a wallet.

## Not complete or not verified

- No hosted demo has been tested on another device, and no hosted wallet payment has been made. The October 11 live payment used localhost.
- No live USDC or mainnet payment has been performed. Mainnet creation is not exposed.
- Seller authentication, invoice expiration, a production datastore and an independent payment-record signature are absent.
- The hosted Blink and wallet signing flow have not been tested; X unfurling requires Dialect registration. Telegram Mini App is not integrated.
- Team details, user interviews and submission videos must be supplied or verified by the founders.
