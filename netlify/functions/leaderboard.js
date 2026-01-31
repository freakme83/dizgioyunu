// netlify/functions/leaderboard.js
//
// GET  /.netlify/functions/leaderboard?form=best-score&limit=25&mode=classic|easy|all
// POST /.netlify/functions/leaderboard   (JSON önerilir; UTF-8 sağlam)
//
// Amaç:
// - Leaderboard: her playerId sadece 1 kez görünür (en yüksek skor).
// - Pagination: eski ama yüksek skorlar "kaybolmaz".
// - mode filtresi: classic/easy ayrı listeler.
// - playerId yoksa fallback: aynı isim tekilleşir (Anonim spam da kesilir).
//
// Response: { ok, form, count, rows }  (rows: {id, name, score, mode, playedAt})

const DEFAULT_FORM = "best-score";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const PER_PAGE = 100;             // Netlify API'de güvenli
const HARD_MAX_SCAN = 5000;       // runaway önlemek için (gerekirse artır)

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
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(),
    },
    body: JSON.stringify(data),
  };
}

function sanitizeName(v) {
  let s = (v ?? "").toString().trim();
  if (!s) return "Anonim";
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  s = s.slice(0, 32);
  return s || "Anonim";
}

function toInt(v, fallback = 0) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMode(v) {
  const s = (v ?? "").toString().toLowerCase().trim();
  if (s === "easy" || s === "classic") return s;
  if (s === "kolay") return "easy";
  if (s === "klasik") return "classic";
  return "classic";
}

function normalizeModeFilter(v) {
  const s = (v ?? "").toString().toLowerCase().trim();
  if (!s || s === "all") return "all";
  if (s === "easy" || s === "classic") return s;
  if (s === "kolay") return "easy";
  if (s === "klasik") return "classic";
  return "all";
}

function safeIsoDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseBody(event) {
  if (!event.body) return {};
  const ct = (event.headers?.["content-type"] || event.headers?.["Content-Type"] || "").toLowerCase();

  if (ct.includes("application/json")) {
    try { return JSON.parse(event.body); } catch { return {}; }
  }

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

  try { return JSON.parse(event.body); } catch { return {}; }
}

async function netlifyApi(path, { method = "GET" } = {}) {
  const token = process.env.NETLIFY_ACCESS_TOKEN;
  if (!token) throw new Error("Missing NETLIFY_ACCESS_TOKEN env var");

  const res = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
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
  const f = Array.isArray(forms) ? forms.find((x) => x?.name === formName) : null;
  return f?.id || null;
}

async function listSubmissionsPage(formId, perPage, page) {
  const subs = await netlifyApi(`/forms/${formId}/submissions?per_page=${perPage}&page=${page}`);
  return Array.isArray(subs) ? subs : [];
}

async function listSubmissionsAll(formId) {
  const all = [];
  let page = 1;

  while (all.length < HARD_MAX_SCAN) {
    const chunk = await listSubmissionsPage(formId, PER_PAGE, page);
    if (!chunk.length) break;

    all.push(...chunk);

    if (chunk.length < PER_PAGE) break; // last page
    page += 1;
  }

  return all.slice(0, HARD_MAX_SCAN);
}

// Netlify Forms submission: site root'a POST (Netlify backend formları yakalar)
async function createSubmissionViaSite(formName, fields) {
  const siteUrl = process.env.URL; // Netlify otomatik verir (prod)
  if (!siteUrl) throw new Error("Missing URL env var (Netlify should provide it).");

  const formData = new URLSearchParams();
  formData.set("form-name", formName);
  for (const [k, v] of Object.entries(fields)) formData.set(k, String(v ?? ""));

  const res = await fetch(siteUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: formData.toString(),
    redirect: "manual",
  });

  if (res.status >= 400) {
    const t = await res.text();
    throw new Error(`Form submit failed ${res.status}: ${t.slice(0, 200)}`);
  }
}

function buildKey(rawPlayerId, name) {
  const pid = (rawPlayerId ?? "").toString().trim();
  if (pid) return `pid:${pid.slice(0, 64)}`;
  return `name:${name.toLowerCase()}`;
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders(), body: "" };
    }

    const siteId = process.env.NETLIFY_SITE_ID;
    if (!siteId) return json(500, { ok: false, error: "Missing NETLIFY_SITE_ID env var" });

    const url = new URL(event.rawUrl || `https://example.com${event.path}`);
    const formName = url.searchParams.get("form") || process.env.NETLIFY_FORM_NAME || DEFAULT_FORM;

    const limitParam = toInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
    const limit = Math.max(1, Math.min(MAX_LIMIT, limitParam));

    const modeFilter = normalizeModeFilter(url.searchParams.get("mode") || "all");

    // ---------- POST: skor kaydı ----------
    if (event.httpMethod === "POST") {
      const body = parseBody(event);

      const name = sanitizeName(body.playerName || body.name);
      const score = Math.max(0, toInt(body.score, 0));
      const mode = normalizeMode(body.mode);
      const playedAt = safeIsoDate(body.playedAt) || new Date().toISOString();
      const playerId = (body.playerId ?? "").toString().trim().slice(0, 64);

      await createSubmissionViaSite(formName, {
        playerName: name,
        score,
        mode,
        playedAt,
        playerId,
        ts: playedAt,
      });

      return json(200, { ok: true });
    }

    // ---------- GET: leaderboard ----------
    const formId = await findFormIdByName(siteId, formName);
    if (!formId) return json(404, { ok: false, error: `Form not found: ${formName}` });

    // Pagination ile tara
    const subs = await listSubmissionsAll(formId);

    // Normalize + mode filter
    let normalized = subs.map((s) => {
      const raw = s?.data || {};
      const name = sanitizeName(raw.playerName || raw.name);
      const score = Math.max(0, toInt(raw.score, 0));
      const mode = normalizeMode(raw.mode);
      const playedAt =
        safeIsoDate(raw.playedAt) ||
        safeIsoDate(raw.ts) ||
        safeIsoDate(s?.created_at) ||
        null;

      const key = buildKey(raw.playerId, name);

      return { id: s?.id || null, key, name, score, mode, playedAt };
    });

    if (modeFilter !== "all") {
      normalized = normalized.filter((r) => r.mode === modeFilter);
    }

    // Best per player
    const bestByKey = new Map();
    for (const r of normalized) {
      const prev = bestByKey.get(r.key);

      if (!prev) { bestByKey.set(r.key, r); continue; }

      if (r.score > prev.score) { bestByKey.set(r.key, r); continue; }

      if (r.score === prev.score) {
        const rT = r.playedAt ? Date.parse(r.playedAt) : -1;
        const pT = prev.playedAt ? Date.parse(prev.playedAt) : -1;
        if (rT > pT) bestByKey.set(r.key, r);
      }
    }

    const rows = [...bestByKey.values()].map(({ key, ...rest }) => rest);

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bT = b.playedAt ? Date.parse(b.playedAt) : -1;
      const aT = a.playedAt ? Date.parse(a.playedAt) : -1;
      return bT - aT;
    });

    const limited = rows.slice(0, limit);

    return json(200, {
      ok: true,
      form: { id: formId, name: formName },
      count: limited.length,
      rows: limited,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
