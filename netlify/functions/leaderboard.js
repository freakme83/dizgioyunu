// netlify/functions/leaderboard.js

const DEFAULT_LIMIT = 20;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function json(statusCode, data) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
    body: JSON.stringify(data),
  };
}

function sanitizeName(v) {
  let s = (v ?? "").toString().trim();
  if (!s) return "Anonim";
  // aşırı uzun/garip girişleri kırp
  s = s.slice(0, 32);
  // kontrol karakterlerini temizle
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  return s || "Anonim";
}

function toInt(v, fallback = 0) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function pickMode(v) {
  const s = (v ?? "").toString().toLowerCase().trim();
  if (s === "easy" || s === "classic") return s;
  return "classic";
}

function safeIsoDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// event.body hem JSON hem x-www-form-urlencoded gelebilir.
// Türkçe karakterler için JSON en sağlamı; ama yine de iki formatı da destekliyoruz.
function parseBody(event) {
  if (!event.body) return {};
  const ct = (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();

  // JSON
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(event.body);
    } catch {
      return {};
    }
  }

  // Form URL Encoded
  if (ct.includes("application/x-www-form-urlencoded")) {
    try {
      const params = new URLSearchParams(event.body);
      const obj = {};
      for (const [k, val] of params.entries()) obj[k] = val;
      return obj;
    } catch {
      return {};
    }
  }

  // fallback: dene JSON, olmazsa boş
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

async function netlifyApi(path, { method = "GET", body } = {}) {
  const token = process.env.NETLIFY_ACCESS_TOKEN;
  if (!token) throw new Error("Missing NETLIFY_ACCESS_TOKEN env var");

  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const msg = typeof data === "string" ? data : (data?.message || JSON.stringify(data));
    throw new Error(`Netlify API ${res.status}: ${msg}`);
  }

  return data;
}

async function findFormIdByName(siteId, formName) {
  const forms = await netlifyApi(`/sites/${siteId}/forms`);
  const f = Array.isArray(forms) ? forms.find(x => x?.name === formName) : null;
  return f?.id || null;
}

async function listSubmissions(formId, limit) {
  // Netlify submissions endpoint
  // (form submissions list)
  const subs = await netlifyApi(`/forms/${formId}/submissions?per_page=${limit}`);
  return Array.isArray(subs) ? subs : [];
}

async function createSubmission(formName, fields) {
  // Netlify Forms için en pratik yöntem:
  // Sitenin kendi domainine POST etmek (function içinden) yerine
  // Netlify API ile submission create etmek her hesapta açık olmayabiliyor.
  // O yüzden burada "site endpoint" kullanıyoruz.
  // DİKKAT: Bu ancak site canlıysa çalışır.
  const siteUrl = process.env.URL; // Netlify otomatik verir (prod)
  if (!siteUrl) throw new Error("Missing URL env var (Netlify should provide it).");

  const formData = new URLSearchParams();
  formData.set("form-name", formName);
  for (const [k, v] of Object.entries(fields)) formData.set(k, String(v ?? ""));

  const res = await fetch(siteUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: formData.toString(),
  });

  // Netlify Forms genelde 200/201 veya redirect döner; 4xx ise hata verelim
  if (res.status >= 400) {
    const t = await res.text();
    throw new Error(`Form submit failed ${res.status}: ${t.slice(0, 200)}`);
  }
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(), body: "" };
    }

    const siteId = process.env.NETLIFY_SITE_ID;
    if (!siteId) return json(500, { ok: false, error: "Missing NETLIFY_SITE_ID env var" });

    const url = new URL(event.rawUrl || `https://example.com${event.path}?${event.queryStringParameters || ""}`);
    const formName = url.searchParams.get("form") || "best-score";
    const limit = Math.min(toInt(url.searchParams.get("limit"), DEFAULT_LIMIT), 100);

    // POST: yeni skor kaydı
    if (event.httpMethod === "POST") {
      const body = parseBody(event);

      const name = sanitizeName(body.playerName || body.name);
      const score = Math.max(0, toInt(body.score, 0));
      const mode = pickMode(body.mode);
      const playedAt = safeIsoDate(body.playedAt) || new Date().toISOString();
      const playerId = (body.playerId ?? "").toString().slice(0, 64);

      // Form’a kaydet (Netlify Forms)
      await createSubmission(formName, {
        playerName: name,
        score,
        mode,
        playedAt,
        playerId,
        ts: playedAt,
      });

      return json(200, { ok: true });
    }

    // GET: leaderboard listele
    const formId = await findFormIdByName(siteId, formName);
    if (!formId) return json(404, { ok: false, error: `Form not found: ${formName}` });

    const subs = await listSubmissions(formId, limit);

    // raw’ı komple kaldırıp sadece gerekli alanları döndürüyoruz
    const rows = subs.map(s => {
      const raw = s?.data || s?.payload || s?.body || s?.raw || s?.fields || {};
      const name = sanitizeName(raw.playerName || raw.name);
      const score = Math.max(0, toInt(raw.score, 0));
      const mode = pickMode(raw.mode);
      const playedAt = safeIsoDate(raw.playedAt) || safeIsoDate(raw.ts) || safeIsoDate(s?.created_at) || null;

      return {
        id: s?.id || null,
        name,
        score,
        mode,
        playedAt,
      };
    });

    // skor büyükten küçüğe sırala
    rows.sort((a, b) => (b.score - a.score) || String(b.playedAt || "").localeCompare(String(a.playedAt || "")));

    return json(200, {
      ok: true,
      form: { id: formId, name: formName },
      count: rows.length,
      rows,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
