// worker.js — versi Cloudflare Workers (webhook, 24 jam nyala)
// Pasang BOT_TOKEN & API_KEY sebagai secret:
// Workers → Settings → Variables → Add variable → centang "Encrypt as secret"
const API = "https://apimmprojectgsuite.my.id/api/v1";

export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.BOT_TOKEN;
    const API_KEY = env.API_KEY;
    const TG = "https://api.telegram.org/bot" + BOT_TOKEN;

    async function api(path, opts = {}) {
      const r = await fetch(API + path, {
        ...opts,
        headers: { "X-API-Key": API_KEY, "Content-Type": "application/json", ...opts.headers },
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

    async function proses(u) {
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

    const path = new URL(request.url).pathname.slice(1);

    if (path === "__diag") {
      const u = new URL(request.url);
      const out = {
        hasToken: !!env.BOT_TOKEN,
        hasApiKey: !!env.API_KEY,
        tokenLen: (env.BOT_TOKEN || "").length,
        tokenPrefix: (env.BOT_TOKEN || "").slice(0, 12),
      };
      if (u.searchParams.get("test") === "1") {
        await send(926709204, "🔧 TEST DARI WORKER — kalau kamu lihat pesan ini, semuanya sudah benar!");
        out.sent = true;
      }
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }

    console.log("request masuk | path match token:", path === BOT_TOKEN, "| hasToken:", !!env.BOT_TOKEN, "| hasApiKey:", !!env.API_KEY);

    if (path === BOT_TOKEN) {
      const update = await request.json().catch(() => null);
      if (update) {
        console.log("update diterima, memproses...");
        ctx.waitUntil(
          proses(update).catch((err) => console.log("proses error:", err && (err.stack || err.message || String(err)))),
        );
      }
    }
    return new Response("ok");
  },
};
