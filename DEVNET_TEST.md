# Живой тест в Solana devnet — 7 октября 2026

Проверен полный путь серверной логики PayProof: создание счёта, отправка тестового SOL с уникальным `reference`, поиск финализированной транзакции через Solana RPC и смена статуса счёта на `paid`.

| Сценарий | Ожидаемый результат | Фактический результат |
|---|---|---|
| Счёт на 0.001 SOL, перевод 0.001 SOL | `paid` | `paid` |
| Счёт на 0.001 SOL, перевод 0.0005 SOL | `pending` | `pending` |

Подтверждённый платёж: [транзакция в Solana Explorer](https://explorer.solana.com/tx/2HjL9FQe9fZRZ7CmRXJuWsP2acMeCB8qMEFRckGPW55rFZoSNZ6K6N2XSGEgghemZYEUJifhUZEQwuy8C14D4FeV?cluster=devnet).

Отклонённый неполный платёж: [транзакция в Solana Explorer](https://explorer.solana.com/tx/58Wz9u3TcBwBVS8asYKNEtPEkxggEyamfF4d7fpUCxt3XFD1Eegg9Ln9fvUwx8dbdQPkuCZhu6mN1ev2LvkBkiJ?cluster=devnet).

Тест выполнен с отдельными devnet кошельками и бесплатным тестовым SOL. Пользовательские и реальные средства не использовались. Проверка через браузерный интерфейс и платёж через приложение кошелька остаются отдельными следующими этапами.

## Повторная проверка после изменений 10 октября 2026 года

- Создан локальный счёт `dd405891-f64d-4e6e-aad0-8767100992c8` на `0.001 SOL` в Devnet, получатель `Cc8eVzhFfyissqmHkJko8LCzBeeHwTHHdmvzB3sxXAmn`.
- Адрес покупателя Phantom `BAkqKBeBXdUTBt62vtPtFeLn8E4H68XKCxoqBwXC8C1N` прошёл проверку формата. На момент запроса его devnet-баланс был `0 SOL`.
- Запрос `requestAirdrop` на `0.1 SOL` через публичный devnet RPC вернул HTTP `429` (лимит или пустой faucet). Транзакция оплаты не отправлялась; счёт остаётся `pending`.

## Testnet — 10 октября 2026

- Для адреса покупателя Phantom `BAkqKBeBXdUTBt62vtPtFeLn8E4H68XKCxoqBwXC8C1N` был получен тестовый SOL в Testnet. Монеты Devnet и Testnet независимы.
- Счёт `8ce2d54b-0d78-48fa-84f5-fdd72d42f7ab` на `0.001 SOL` в Testnet оплачен через расширение Phantom в Chrome. Получатель: `Cc8eVzhFfyissqmHkJko8LCzBeeHwTHHdmvzB3sxXAmn`; уникальный `reference`: `76nPQBj4Fz86Dy4H6Na35UpVoWUSViVcnMiGVCMaWkw5`.
- [Транзакция в Solana Explorer](https://explorer.solana.com/tx/64BQKDws3uQabDan3eDuCCxQXRBddtJEyDoQb33AgW5hz1GmYhhJA8dniR6eruENr7fWoxLcpRbK674BFPaes9S3?cluster=testnet) финализирована без ошибки. Проверено через Testnet RPC: `reference` присутствует в ключах, баланс получателя увеличился ровно на `1,000,000` lamports. PayProof показывает `paid` с той же подписью.
- Пользователь сохранил PDF чек Solana Explorer в папке Downloads. Дата в чеке: 10 октября 2026 года, 13:51:46 UTC. Комиссия в чеке: `0.00008 SOL`.
- Проверка кода после исправления формата Phantom: `node --test` — 13 из 13. Путь «счёт → Phantom → Testnet → paid» пройден через реальный интерфейс кошелька с тестовыми монетами.
