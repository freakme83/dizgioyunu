
const DEFAULT_FORM = "best-score";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

const MAX_SCORE = 20000;

const BLOCKED_SUBSTRINGS = [
  "sik",
  "sikeyim",
  "siker",
  "siki",
  "sikim",
  "sikin",
  "siktir",
  "amk",
  "amq",
  "orospu",
  "yarrak",
  "yarak",
  "yarraq",
  "amcık",
  "amcik",
  "çük",
  "cuk",
  "yavşak",
  "yavsak",
  "puşt",
  "pust",
  "ibne",
  "ipne",
  "kavat",
  "gavat",
  "oçocuğu",
  "ococuğu",
  "skim",
  "skem",
  "çocuu",
];

const PER_PAGE = 100;

const HARD_MAX_SCAN = 5000;

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
  let s = (v ?? "").toString();
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");
  s = s.replace(/[<>]/g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "Anonim";
  s = s.slice(0, 32);
  return s || "Anonim";
}

function normalizeTR(input) {
  const s = (input ?? "").toString();
  const lower = s.toLocaleLowerCase("tr-TR");
  return lower
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function getNormalizedBlocked() {
  return (BLOCKED_SUBSTRINGS || [])
    .map((w) => normalizeTR(w).trim())
    .filter((w) => w.length >= 2) // 1-char çok agresif olur
    .sort((a, b) => b.length - a.length);
}

function maskBlockedSubstrings(name) {
  const original = sanitizeName(name);
  const norm = normalizeTR(original);
  const blocked = getNormalizedBlocked();
  if (!blocked.length) return original;

  const mark = new Array(norm.length).fill(false);

  for (const term of blocked) {
    if (!term) continue;
    let idx = 0;
    while (idx <= norm.length - term.length) {
      const found = norm.indexOf(term, idx);
      if (found === -1) break;
      for (let i = found; i < found + term.length; i++) mark[i] = true;
      idx = found + term.length;
    }
  }

  let out = "";
  for (let i = 0; i < original.length; i++) {
    if (mark[i]) {
      if (i === 0 || !mark[i - 1]) out += "*";
      continue;
    }
    out += original[i];
  }

  out = out.replace(/\s+/g, " ").trim();
  if (!out) return "Anonim";
  return out.slice(0, 32) || "Anonim";
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

function safeIso(v) {
  return safeIsoDate(v);
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

  const txt = await res.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = txt; }

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

    if (chunk.length < PER_PAGE) break;

    page += 1;
  }

  return all.slice(0, HARD_MAX_SCAN);
}

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
  return `name:${normalizeTR(name)}`;
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

    if (event.httpMethod === "POST") {
      const body = parseBody(event);

      const name = maskBlockedSubstrings(body.playerName || body.name);

      const scoreRaw = toInt(body.score, NaN);
      if (!Number.isFinite(scoreRaw) || scoreRaw < 0 || scoreRaw > MAX_SCORE) {
        return json(400, { ok: false, error: `Invalid score. Must be 0..${MAX_SCORE}` });
      }
      const score = scoreRaw;

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

    const formId = await findFormIdByName(siteId, formName);
    if (!formId) return json(404, { ok: false, error: `Form not found: ${formName}` });

    const subs = await listSubmissionsAll(formId);

    let normalized = subs
      .map((s) => {
      const raw = s?.data || {};
      const name = maskBlockedSubstrings(raw.playerName || raw.name);
      const score = toInt(raw.score, NaN);
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) return null;
      const mode = normalizeMode(raw.mode);

      const playedAt =
        safeIso(raw.playedAt) ||
        safeIso(raw.ts) ||
        safeIso(s?.created_at) ||
        null;

      const key = buildKey(raw.playerId, name);

      return {
        id: s?.id || null,
        key, // internal only
        name,
        score: Math.max(0, score),
        mode,
        playedAt,
      };
    })
      .filter(Boolean);

    if (modeFilter !== "all") {
      normalized = normalized.filter((r) => r.mode === modeFilter);
    }

    const bestByKey = new Map();
    for (const r of normalized) {
      const prev = bestByKey.get(r.key);

      if (!prev) {
        bestByKey.set(r.key, r);
        continue;
      }

      if (r.score > prev.score) {
        bestByKey.set(r.key, r);
        continue;
      }

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
