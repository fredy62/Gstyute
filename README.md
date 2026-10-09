# Gstyute

Bot Telegram reseller GSuite & Hotmail/Outlook, terhubung ke [Reseller API](https://apimmprojectgsuite.my.id/docs).

## Perintah bot

- `/start` / `/help` — bantuan
- `/produk` — daftar produk, harga, stok
- `/saldo` — cek saldo reseller
- `/order <produk> <jumlah> [domain] [password]` — buat order
- `/status <trx_id>` — cek status order

## Jalankan di HP (Termux)

```bash
pkg install nodejs
cp .env.example .env   # isi BOT_TOKEN & API_KEY
node bot.js
```

Agar tetap nyala saat layar mati: jalankan `termux-wake-lock` dulu, lalu `nohup node bot.js &`.

## Deploy ke Cloudflare Workers (gratis, 24 jam nyala)

1. dash.cloudflare.com → Workers & Pages → Create Worker
2. Paste isi `worker.js` → Save and Deploy
3. Workers → Settings → Variables → Add variable: `BOT_TOKEN` dan `API_KEY` (centang **Encrypt as secret**)
4. Set webhook (buka di browser):
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_WORKER>/<TOKEN>
   ```

## Keamanan

- Jangan pernah commit file `.env` atau menaruh token/API key langsung di kode.
- Kalau kredensial bocor: revoke token di @BotFather dan ganti API key di portal (tab API).
- Order bersifat sinkron (timeout sampai 300 detik); gunakan `idempotency_key` agar tidak dobel potong saldo.
- Saldo hanya bisa di-topup lewat portal (QRIS).
# Gstyute
