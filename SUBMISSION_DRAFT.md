# Colosseum submission draft — PayProof

Fill every bracketed field with verified facts before submitting. The deadline in the [official rules](https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf) is October 12, 2026 at 11:59 p.m. Pacific Time.

## One-sentence description

PayProof lets freelancers send a Solana invoice and show which on-chain transfer paid that invoice, without receiving or holding funds on the freelancer's behalf.

## Product and technical demo

A seller enters a recipient wallet, network, asset, amount and description. PayProof creates a shareable invoice with a unique Solana Pay reference. A buyer pays the seller directly. The server compares the confirmed transaction's reference, recipient, asset and exact balance increase with the invoice, then shows the transaction signature and a printable payment record.

Current evidence: a [fresh 0.001 SOL Testnet payment through Phantom](https://explorer.solana.com/tx/5Py8ceGwfPGi1bHGLFdmP7LNNuKQLxmP5dLgdZg8UMFDiaFbbUGX6M1jp2gZayGuew4P9huoe25aL2aYZRNEnSGm?cluster=testnet) was matched to its invoice on the current build on October 11, 2026. An independent RPC query found the invoice reference and the exact 1,000,000-lamport recipient balance increase. The user saved the browser payment record as PDF, and 18 automated tests pass. The [public demo](https://payproof-demo.onrender.com/) supports invoice creation, sharing, QR display, and pending payment checks; a hosted wallet payment and a live USDC payment remain unverified. The app is a test-network prototype with ephemeral hosted invoice storage, not a production payment service.

## Founder and market details — complete with real evidence

- Founders, roles, relevant experience and location: [names and verified details]
- Why this team chose freelancers and this payment problem: [firsthand experience or interviews]
- Initial customer segment: [specific type of freelancer and geography]
- Customer discovery: [number of conversations, dates, and direct findings]
- First distribution channel and next measurable experiment: [channel and concrete action]
- Business model and expected buyer: [hypothesis, clearly labelled]
- Competitor comparison: [specific workflow comparison with Helio, Request Finance and Coinbase Commerce, with sources]
- Work completed during the hackathon and any pre-existing code: [accurate dates and disclosure]
- Repository: [Mickoki/PayProof](https://github.com/Mickoki/PayProof). Hosted demo: [payproof-demo.onrender.com](https://payproof-demo.onrender.com/). Pitch video and demo video: [verified URLs]

## Pitch video, 2–3 minutes

1. Show the payment-matching problem through a real founder or customer example.
2. Show one invoice, direct wallet payment, confirmed status and the transaction-linked payment record.
3. Explain who would use it first, how the team will reach them, and what user evidence exists so far.
4. State the present limitations honestly and the next validation step.

## Separate demo video, at most 3 minutes

Show a newly created test-network SOL invoice, copy its public invoice URL, pay from a different wallet, wait for `confirmed`, and open the matching signature in Solana Explorer. Show the printable record and identify all test coins as valueless. If a live transfer is unavailable, state that explicitly and use the prior transaction only as historical evidence.
