// worker.js — Bot Telegram reseller GSuite & Hotmail (Cloudflare Workers)
// Kredensial via Variables: BOT_TOKEN, API_KEY (Encrypt as secret)
const API = "https://apimmprojectgsuite.my.id/api/v1";

export default {
  async fetch(request, env, ctx) {
    const BOT_TOKEN = env.BOT_TOKEN;
    const API_KEY = env.API_KEY;
    const TG = "https://api.telegram.org/bot" + BOT_TOKEN;

    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const fmt = (n) => Number(n || 0).toLocaleString("id-ID");
    const kb = (inline_keyboard) => ({ reply_markup: { inline_keyboard } });

    async function api(path, opts = {}) {
      const r = await fetch(API + path, {
        ...opts,
        headers: { "X-API-Key": API_KEY, "Content-Type": "application/json", ...(opts.headers || {}) },
      });
      const body = await r.json().catch(() => ({}));
      return { status: r.status, body };
    }

    const call = (method, payload) =>
      fetch(TG + "/" + method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .catch(() => null);

    const send = (chat, text, extra = {}) => call("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

    async function sendLong(chat, text, extra = {}) {
      const parts = [];
      for (let i = 0; i < text.length; i += 3500) parts.push(text.slice(i, i + 3500));
      for (let i = 0; i < parts.length; i++) await send(chat, parts[i], i === 0 ? extra : {});
    }

    const MENU_KB = () =>
      kb([
        [
          { text: "🛒 Beli Akun", callback_data: "beli" },
          { text: "💰 Cek Saldo", callback_data: "saldo" },
        ],
        [
          { text: "📦 Riwayat Order", callback_data: "riwayat" },
          { text: "📖 Bantuan", callback_data: "bantuan" },
        ],
      ]);

    const WELCOME =
      "👋 <b>Selamat datang di Toko Gsuite!</b>\n" +
      "Bot reseller akun GSuite &amp; Hotmail/Outlook — proses otomatis, stok siap.\n" +
      "━━━━━━━━━━━━━━━━━\n" +
      "🛒 GSuite Regular 1 Hari &amp; YouTube B 35 Hari\n" +
      "📧 Hotmail/Outlook ready\n" +
      "💰 Cek saldo &amp; mutasi\n" +
      "📦 Lacak order via ID transaksi\n" +
      "━━━━━━━━━━━━━━━━━\n" +
      "Pilih menu di bawah 👇";

    const HELP =
      "📖 <b>BANTUAN</b>\n" +
      "━━━━━━━━━━━━━━━━━\n" +
      "<b>Cara beli:</b>\n" +
      "1. Tekan 🛒 Beli Akun\n" +
      "2. Pilih produk\n" +
      "3. Pilih jumlah\n" +
      "4. Akun langsung dikirim ke chat ini\n" +
      "━━━━━━━━━━━━━━━━━\n" +
      "<b>Perintah teks:</b>\n" +
      "/produk — daftar produk\n" +
      "/saldo — cek saldo\n" +
      "/order &lt;produk&gt; &lt;jumlah&gt; — order manual\n" +
      "/status &lt;trx_id&gt; — cek status order\n" +
      "━━━━━━━━━━━━━━━━━\n" +
      "💰 Topup saldo via portal (QRIS)\n" +
      "🆘 Error? Cek /status dulu, jangan order ulang.";

    async function tampilkanProduk(chat) {
      const { body } = await api("/products");
      const products = body.data?.products || [];
      if (!products.length) return send(chat, "❌ Gagal memuat produk. Coba lagi nanti.", MENU_KB());
      const rows = products.map((p) => [{ text: `${p.name} — Rp${fmt(p.price_per_account)}/akun`, callback_data: `p:${p.id}` }]);
      rows.push([{ text: "🔙 Menu Utama", callback_data: "bantuan" }]);
      await send(
        chat,
        "🛒 <b>DAFTAR PRODUK</b>\nPilih produk untuk detail &amp; order 👇",
        kb(rows),
      );
    }

    async function detailProduk(chat, id) {
      const { body } = await api("/products");
      const p = (body.data?.products || []).find((x) => x.id === id);
      if (!p) return send(chat, "❌ Produk tidak ditemukan.", MENU_KB());
      const min = p.min_quantity || 1;
      const max = p.max_quantity || 999;
      const step = p.quantity_step || 1;
      const picks = [...new Set([min, min * 2, min * 5, max].map((q) => Math.floor(q / step) * step).filter((q) => q >= min && q <= max))].slice(0, 4);
      const rows = picks.map((q) => [{ text: `${q} akun — Rp${fmt(q * p.price_per_account)}`, callback_data: `o:${p.id}:${q}` }]);
      rows.push([{ text: "✏️ Jumlah lain", callback_data: `hint:${p.id}` }]);
      rows.push([{ text: "🔙 Kembali", callback_data: "beli" }]);
      await send(
        chat,
        `📦 <b>${esc(p.name)}</b>\n` +
          "━━━━━━━━━━━━━━━━━\n" +
          `💰 Harga: <b>Rp${fmt(p.price_per_account)}</b>/akun\n` +
          `📉 Minimal: ${min} • Maksimal: ${max}\n` +
          (step > 1 ? `📐 Kelipatan: ${step}\n` : "") +
          (p.daily_limit ? `📅 Limit harian: ${p.daily_limit} akun\n` : "") +
          `📦 Stok: ${p.stock ?? "-"}\n` +
          "━━━━━━━━━━━━━━━━━\n" +
          "Pilih jumlah 👇",
        kb(rows),
      );
    }

    async function tampilkanSaldo(chat) {
      const acc = (await api("/account")).body?.data || {};
      const bal = (await api("/balance?limit=5")).body?.data || {};
      const txs = (bal.transactions || bal.mutations || bal.items || [])
        .map((t) => `• ${esc(t.type || t.kind || "-")}: Rp${fmt(t.amount ?? t.value ?? 0)}`)
        .join("\n");
      await send(
        chat,
        `💰 <b>SALDO RESELLER</b>\n` +
          "━━━━━━━━━━━━━━━━━\n" +
          `👤 ${esc(acc.name || "-")} (@${esc(acc.username || "-")})\n` +
          `💳 Saldo: <b>Rp${fmt(acc.balance ?? 0)}</b>\n` +
          (txs ? `\n<b>MUTASI TERAKHIR:</b>\n${txs}` : ""),
        kb([
          [
            { text: "🛒 Beli Akun", callback_data: "beli" },
            { text: "🔄 Refresh", callback_data: "saldo" },
          ],
          [{ text: "🔙 Menu Utama", callback_data: "bantuan" }],
        ]),
      );
    }

    async function tampilkanRiwayat(chat) {
      const { body } = await api("/orders?limit=5");
      const orders = body.data?.orders || body.data?.items || [];
      if (!orders.length) return send(chat, "📭 Belum ada order.\nMulai dari 🛒 Beli Akun.", MENU_KB());
      const lines = orders.map(
        (o) => `• <code>${esc(o.trx_id)}</code>\n  ${esc(o.product)} x${o.quantity} — ${esc(o.status)} — Rp${fmt(o.charged ?? 0)}`,
      );
      await send(
        chat,
        `📦 <b>RIWAYAT ORDER (5 terakhir)</b>\n━━━━━━━━━━━━━━━━━\n${lines.join("\n")}`,
        kb([
          [
            { text: "🛒 Beli Lagi", callback_data: "beli" },
            { text: "🔙 Menu Utama", callback_data: "bantuan" },
          ],
        ]),
      );
    }

    async function jalankanOrder(chat, product, quantity, domain, password) {
      const payload = { product, quantity, idempotency_key: `tg${chat}-${Date.now()}` };
      if (domain) payload.domain = domain;
      if (password) payload.password = password;
      await send(chat, `⏳ <b>Sedang diproses…</b>\nProduk: <code>${esc(product)}</code> x${quantity}\nYouTube B bisa 1–4 menit, mohon tunggu.`);
      const { status, body } = await api("/orders", { method: "POST", body: JSON.stringify(payload) });
      const d = body.data || {};
      if (status === 201 || status === 200) {
        const acc = (d.accounts || []).map((a, i) => `${i + 1}. <code>${esc(a)}</code>`).join("\n");
        return sendLong(
          chat,
          `✅ <b>ORDER BERHASIL</b>\n` +
            "━━━━━━━━━━━━━━━━━\n" +
            `🧾 ID: <code>${esc(d.trx_id)}</code>\n` +
            `📦 Produk: ${esc(d.product)}\n` +
            `📊 Status: <b>${esc(d.status)}</b>\n` +
            `👥 Akun jadi: ${d.accounts_created}${d.bonus_accounts ? ` (+${d.bonus_accounts} bonus)` : ""}\n` +
            `💳 Dipotong: Rp${fmt(d.charged)}\n` +
            `💰 Sisa saldo: Rp${fmt(d.balance)}\n` +
            `🔑 Password: <code>${esc(d.password || "-")}</code>\n` +
            `⏰ Aktif s/d: ${esc(d.expires_at || "-")} (UTC)\n` +
            "━━━━━━━━━━━━━━━━━\n" +
            `<b>DAFTAR AKUN:</b>\n${acc}`,
          kb([
            [
              { text: "🛒 Beli Lagi", callback_data: "beli" },
              { text: "💰 Cek Saldo", callback_data: "saldo" },
            ],
          ]),
        );
      }
      if (status === 202) return send(chat, `⏳ Order masih diproses. Cek nanti dengan:\n<code>/status ${esc(d.trx_id || "")}</code>`, MENU_KB());
      const err = body.error || {};
      let hint = esc(err.message || "Gagal memproses order.");
      if (err.code === "insufficient_balance") hint = `Saldo kurang. Butuh Rp${fmt(err.required)}, saldo kamu Rp${fmt(err.balance)}. Topup dulu di portal (QRIS).`;
      else if (err.code === "out_of_stock") hint = `Stok tidak mencukupi. Tersisa: ${esc(err.available)}.`;
      else if (err.code === "daily_limit") hint = `Limit harian tercapai. Sisa: ${esc(err.remaining)} akun hari ini.`;
      else if (err.code === "validation_error") hint = `Parameter salah: <code>${esc(err.field || "-")}</code>.`;
      return send(
        chat,
        `❌ <b>ORDER GAGAL</b>\n━━━━━━━━━━━━━━━━━\nKode: <code>${esc(err.code || status)}</code>\n${hint}\nSaldo tidak terpotong.`,
        MENU_KB(),
      );
    }

    async function proses(u) {
      if (u.callback_query) {
        const cb = u.callback_query;
        const chat = cb.message?.chat?.id || cb.from?.id;
        const data = cb.data || "";
        call("answerCallbackQuery", { callback_query_id: cb.id });
        const [a, b, c] = data.split(":");
        if (a === "beli") return tampilkanProduk(chat);
        if (a === "p") return detailProduk(chat, b);
        if (a === "o") return jalankanOrder(chat, b, parseInt(c));
        if (a === "hint")
          return send(
            chat,
            `✏️ Ketik perintah:\n<code>/order ${esc(b)} JUMLAH</code>\nContoh: <code>/order ${esc(b)} 20</code>`,
            kb([[{ text: "🔙 Kembali", callback_data: `p:${esc(b)}` }]]),
          );
        if (a === "saldo") return tampilkanSaldo(chat);
        if (a === "riwayat") return tampilkanRiwayat(chat);
        if (a === "bantuan") return send(chat, HELP, MENU_KB());
        return;
      }

      const msg = u.message;
      if (!msg || !msg.text) return;
      const chat = msg.chat.id;
      const [cmd, ...args] = msg.text.trim().split(/\s+/);
      const c = cmd.toLowerCase();

      if (c === "/start") return send(chat, WELCOME, MENU_KB());
      if (c === "/help") return send(chat, HELP, MENU_KB());
      if (c === "/produk") return tampilkanProduk(chat);
      if (c === "/saldo") return tampilkanSaldo(chat);
      if (c === "/riwayat") return tampilkanRiwayat(chat);

      if (c === "/status") {
        if (!args[0]) return send(chat, "Pakai: <code>/status &lt;trx_id&gt;</code>", MENU_KB());
        const { status, body } = await api("/orders/" + encodeURIComponent(args[0]));
        const d = body.data || {};
        if (!d.trx_id) return send(chat, `❌ Order tidak ditemukan.\n<code>${esc(body.error?.message || status)}</code>`, MENU_KB());
        const acc = (d.accounts || []).map((a, i) => `${i + 1}. <code>${esc(a)}</code>`).join("\n");
        return sendLong(
          chat,
          `🧾 <b>${esc(d.trx_id)}</b> — ${esc(d.status)}\n` +
            "━━━━━━━━━━━━━━━━━\n" +
            `📦 ${esc(d.product)} x${d.quantity}\n` +
            `👥 Akun: ${d.accounts_created} • 💳 Rp${fmt(d.charged)}\n` +
            `🔑 Password: <code>${esc(d.password || "-")}</code>\n\n` +
            `<b>DAFTAR AKUN:</b>\n${acc}`,
        );
      }

      if (c === "/order") {
        const [product, qty, domain, ...rest] = args;
        const quantity = parseInt(qty);
        if (!product || !quantity || quantity < 1)
          return send(
            chat,
            "Pakai: <code>/order &lt;produk&gt; &lt;jumlah&gt;</code>\nContoh: <code>/order regular_1d 20</code>\nLihat daftar produk: /produk",
            kb([[{ text: "🛒 Beli via Tombol", callback_data: "beli" }]]),
          );
        return jalankanOrder(chat, product, quantity, domain, rest.length ? rest.join(" ") : undefined);
      }
    }

    const path = new URL(request.url).pathname.slice(1);

    if (path === "__diag") {
      const u = new URL(request.url);
      const out = {
        hasToken: !!env.BOT_TOKEN,
        hasApiKey: !!env.API_KEY,
        getMeOk: false,
        botUsername: null,
      };
      const me = await (await fetch(TG + "/getMe")).json().catch(() => null);
      out.getMeOk = !!(me && me.ok);
      out.botUsername = (me && me.result && me.result.username) || null;
      if (u.searchParams.get("simulate") === "1") {
        const upd = { update_id: 1, message: { message_id: 1, from: { id: 926709204, first_name: "Fredy" }, chat: { id: 926709204, type: "private", first_name: "Fredy" }, date: 0, text: "/start" } };
        ctx.waitUntil(proses(upd).catch((err) => console.log("simulate error:", err && err.message)));
        out.simulated = true;
      }
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }

    if (request.method === "POST") {
      const update = await request.json().catch(() => null);
      if (update && (update.message || update.callback_query || update.update_id !== undefined)) {
        console.log("update diterima:", update.message?.text || update.callback_query?.data || "?");
        ctx.waitUntil(proses(update).catch((err) => console.log("proses error:", err && (err.stack || err.message || String(err)))));
      }
    }
    return new Response("ok");
  },
};
