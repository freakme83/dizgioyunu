/**
 * Netlify Function: /.netlify/functions/leaderboard
 * - Pulls Netlify Forms submissions for the current site (SITE_ID)
 * - Builds a single leaderboard list
 * - Shows (Classic/Easy) alongside name (mode info is included in JSON too)
 *
 * Required env var:
 *   NETLIFY_ACCESS_TOKEN = your personal access token (set in Netlify UI per site)
 *
 * Notes:
 * - Uses process.env.SITE_ID to ensure we only read forms from the site where this function runs.
 * - Adds CDN cache headers (5 min) to reduce API calls.
 */

const API_BASE = "https://api.netlify.com/api/v1";

function jsonResponse(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Cache at the edge (Netlify/CDN) for 5 minutes, allow stale while revalidating
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      ...extraHeaders,
    },
    body: JSON.stringify(bodyObj),
  };
}

async function fetchJSON(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "dizgi-leaderboard-function",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Netlify API error ${res.status}: ${text.slice(0, 500)}`);
  }

  // Some endpoints always return JSON
  return text ? JSON.parse(text) : null;
}

function normalizeMode(modeRaw) {
  const m = String(modeRaw || "").toLowerCase().trim();
  if (m === "easy" || m === "kolay") return { key: "easy", labelTR: "KOLAY" };
  if (m === "classic" || m === "klasik") return { key: "classic", labelTR: "KLASİK" };
  return { key: m || "unknown", labelTR: m ? m.toUpperCase() : "?" };
}

function safeNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Defensive: Netlify submissions often come as {data:{...}}.
function getField(submission, fieldName) {
  if (!submission) return undefined;
  if (submission.data && submission.data[fieldName] !== undefined) return submission.data[fieldName];
  // sometimes fields can appear on top-level (rare)
  return submission[fieldName];
}

exports.handler = async (event) => {
  try {
    const token = process.env.NETLIFY_ACCESS_TOKEN;
    const siteId = process.env.SITE_ID;

    if (!token) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing env var NETLIFY_ACCESS_TOKEN. Set it in Netlify Site settings → Environment variables.",
      });
    }
    if (!siteId) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing env var SITE_ID. This is normally provided automatically by Netlify at runtime.",
      });
    }

    // Query params (optional)
    const urlParams = new URLSearchParams(event.queryStringParameters || {});
    const limit = Math.min(Math.max(parseInt(urlParams.get("limit") || "50", 10) || 50, 1), 200);

    // 1) Find the form named "best-score" for this SITE_ID
    const forms = await fetchJSON(`${API_BASE}/forms`, token);

    const form = (forms || []).find((f) => {
      const sameSite = String(f.site_id || "") === String(siteId);
      const sameName = String(f.name || "") === "best-score";
      return sameSite && sameName;
    });

    if (!form) {
      return jsonResponse(404, {
        ok: false,
        error: `Form not found for this site. Expected form name: "best-score".`,
        debug: { siteId },
      });
    }

    // 2) Fetch submissions for that form
    // Netlify returns newest-first by default. We'll re-sort anyway.
    const submissions = await fetchJSON(`${API_BASE}/forms/${form.id}/submissions`, token);

    // 3) Parse & normalize
    const rows = (submissions || [])
      .map((s) => {
        const playerName = String(getField(s, "playerName") || getField(s, "Player Name") || getField(s, "name") || "Anonim").trim() || "Anonim";
        const score = safeNumber(getField(s, "score") ?? getField(s, "Score"));
        const playerId = String(getField(s, "playerId") ?? getField(s, "Player") ?? "").trim();
        const modeRaw = getField(s, "mode") ?? getField(s, "Mode");
        const playedAt = String(getField(s, "playedAt") ?? getField(s, "Played At") ?? getField(s, "ts") ?? getField(s, "Ts") ?? s.created_at ?? "").trim();

        if (score === null) return null;

        const mode = normalizeMode(modeRaw);

        return {
          playerName,
          score,
          mode: mode.key,
          modeLabel: mode.labelTR, // "KOLAY" / "KLASİK"
          playedAt,                // ISO string (as stored)
          playerId: playerId || null,
        };
      })
      .filter(Boolean);

    // 4) Extra safety: even if best-only is already enforced, keep only best per playerId when available
    // If playerId missing, keep as-is.
    const bestByPlayer = new Map(); // key => row
    for (const r of rows) {
      const key = r.playerId ? `id:${r.playerId}` : `anon:${r.playerName}:${r.mode}:${r.playedAt}`;
      const prev = bestByPlayer.get(key);
      if (!prev || r.score > prev.score) bestByPlayer.set(key, r);
    }
    const deduped = Array.from(bestByPlayer.values());

    // 5) Sort: score desc, then playedAt desc (newer first as tie-break)
    deduped.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // tie-breaker
      const ta = Date.parse(a.playedAt || "") || 0;
      const tb = Date.parse(b.playedAt || "") || 0;
      return tb - ta;
    });

    const top = deduped.slice(0, limit).map((r, idx) => ({
      rank: idx + 1,
      displayName: `${r.playerName} (${r.modeLabel})`,
      playerName: r.playerName,
      score: r.score,
      mode: r.mode,
      modeLabel: r.modeLabel,
      playedAt: r.playedAt,
      playerId: r.playerId,
    }));

    return jsonResponse(200, {
      ok: true,
      count: top.length,
      siteId,
      formName: "best-score",
      generatedAt: new Date().toISOString(),
      leaderboard: top,
    });
  } catch (err) {
    return jsonResponse(500, {
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
};
