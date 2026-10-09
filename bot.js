// bot.js — versi Termux/Node (long polling)
// Kredensial dari file .env (jangan di-commit) atau variabel environment
const fs = require("node:fs");
if (fs.existsSync(".env"))
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_KEY = process.env.API_KEY;
if (!BOT_TOKEN || !API_KEY) {
  console.error("Buat dulu file .env dari .env.example (isi BOT_TOKEN & API_KEY)");
  process.exit(1);
}

const API = "https://apimmprojectgsuite.my.id/api/v1";
const TG = "https://api.telegram.org/bot" + BOT_TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { "X-API-Key": API_KEY, "Content-Type": "application/json", ...opts.headers },
    signal: AbortSignal.timeout(300000),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

const send = (chat, text) =>
  fetch(TG + "/sendMessage", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }),
  }).catch(() => {});

async function sendLong(chat, text) {
  for (let i = 0; i < text.length; i += 3500) await send(chat, text.slice(i, i + 3500));
}

async function handle(u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const chat = msg.chat.id;
  const [cmd, ...args] = msg.text.trim().split(/\s+/);
  const c = cmd.toLowerCase();

  if (c === "/start" || c === "/help")
    return send(chat, "Perintah:\n/produk — daftar & stok\n/saldo — cek saldo\n/order <produk> <jumlah> [domain] [password]\n/status <trx_id> — cek order");

  if (c === "/produk") {
    const { body } = await api("/products");
    const list = (body.data?.products || []).map(p =>
      `• <b>${p.name}</b> (<code>${p.id}</code>)\nRp${p.price_per_account}/akun • stok ${p.stock ?? "?"} • min ${p.min_quantity}–max ${p.max_quantity}${p.quantity_step ? ` (kelipatan ${p.quantity_step})` : ""}`);
    return send(chat, list.join("\n\n") || "Gagal ambil produk.");
  }

  if (c === "/saldo") {
    const { body } = await api("/account");
    return send(chat, `Saldo: <b>Rp${body.data?.balance ?? "?"}</b>`);
  }

  if (c === "/status") {
    if (!args[0]) return send(chat, "Pakai: /status <trx_id>");
    const { status, body } = await api("/orders/" + encodeURIComponent(args[0]));
    const d = body.data || {};
    if (!d.trx_id) return send(chat, `Error: ${body.error?.message || status}`);
    return sendLong(chat, `<b>${d.trx_id}</b> — ${d.status}\nJadi: ${d.accounts_created} • Dipotong: Rp${d.charged}\n\n${(d.accounts || []).join("\n")}`);
  }

  if (c === "/order") {
    const [product, qty, domain, ...rest] = args;
    const quantity = parseInt(qty);
    if (!product || !quantity) return send(chat, "Pakai: /order <produk> <jumlah>\nContoh: /order regular_1d 20");
    const payload = { product, quantity, idempotency_key: `tg${chat}-${Date.now()}` };
    if (domain) payload.domain = domain;
    if (rest.length) payload.password = rest.join(" ");
    await send(chat, "⏳ Diproses (YouTube B bisa 1–4 menit)...");
    const { status, body } = await api("/orders", { method: "POST", body: JSON.stringify(payload) });
    const d = body.data || {};
    if (status === 201 || status === 200) {
      return sendLong(chat, `✅ <b>${d.trx_id}</b> (${d.status})\nJadi: ${d.accounts_created}${d.bonus_accounts ? ` + bonus ${d.bonus_accounts}` : ""} • Dipotong: Rp${d.charged} • Sisa: Rp${d.balance}\nPassword: <code>${d.password || "-"}</code> • Expires: ${d.expires_at || "-"}\n\n${(d.accounts || []).join("\n")}`);
    }
    if (status === 202) return send(chat, `⏳ Masih diproses. Cek nanti: /status ${d.trx_id}`);
    const err = body.error || {};
    let hint = err.message || "Gagal.";
    if (err.code === "insufficient_balance") hint = `Saldo kurang. Butuh Rp${err.required}, punya Rp${err.balance}.`;
    else if (err.code === "out_of_stock") hint = `Stok tinggal ${err.available}.`;
    else if (err.code === "daily_limit") hint = `Limit harian YouTube B, sisa ${err.remaining}.`;
    return send(chat, `❌ <b>${err.code || status}</b>: ${hint}`);
  }
}

(async () => {
  const me = await (await fetch(TG + "/getMe")).json();
  console.log(me.ok ? `Bot OK: @${me.result.username}` : "TOKEN BOT SALAH / SUDAH DI-REVOKE");
  const acc = await api("/account");
  console.log(acc.body.success ? `API key OK — Saldo: Rp${acc.body.data.balance}` : `API KEY SALAH: ${acc.body.error?.code || acc.status}`);
})();

let offset = 0;
(async () => {
  console.log("Bot menyala... (Ctrl+C untuk berhenti)");
  while (true) {
    try {
      const j = await (await fetch(`${TG}/getUpdates?offset=${offset}&timeout=55`)).json();
      if (j.ok && j.result?.length) {
        offset = j.result.at(-1).update_id + 1;
        for (const u of j.result) handle(u).catch(() => {});
      }
    } catch { await sleep(2000); }
  }
})();
