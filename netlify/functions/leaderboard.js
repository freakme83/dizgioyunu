export default async (request, context) => {
  try {
    const token = process.env.NETLIFY_ACCESS_TOKEN;
    const siteId = process.env.NETLIFY_SITE_ID;
    const formName = process.env.NETLIFY_FORM_NAME || "best-score";

    if (!token || !siteId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing NETLIFY_ACCESS_TOKEN or NETLIFY_SITE_ID" }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const apiBase = "https://api.netlify.com/api/v1";
    const headers = { Authorization: `Bearer ${token}` };

    // 1) Site formlarını çek
    const formsRes = await fetch(`${apiBase}/sites/${siteId}/forms`, { headers });
    if (!formsRes.ok) {
      const txt = await formsRes.text();
      return new Response(
        JSON.stringify({ ok: false, step: "list_forms", status: formsRes.status, body: txt }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const forms = await formsRes.json();
    const form = forms.find((f) => f.name === formName);

    if (!form) {
      return new Response(
        JSON.stringify({ ok: false, error: `Form not found: ${formName}`, availableForms: forms.map(f => f.name) }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }

    // 2) Submissions çek
    const subsRes = await fetch(`${apiBase}/forms/${form.id}/submissions`, { headers });
    if (!subsRes.ok) {
      const txt = await subsRes.text();
      return new Response(
        JSON.stringify({ ok: false, step: "list_submissions", status: subsRes.status, body: txt, formId: form.id }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    const submissions = await subsRes.json();

    // (opsiyonel) query ile limit
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || "50")));

    // Normalize edelim (senin alan adlarına göre)
    const rows = submissions
      .slice(0, limit)
      .map((s) => ({
        id: s.id,
        name: s.data?.["Player Name"] ?? s.data?.playerName ?? s.data?.name ?? null,
        score: Number(s.data?.Score ?? s.data?.score ?? 0),
        mode: s.data?.Mode ?? s.data?.mode ?? null,
        playedAt: s.data?.["Played At"] ?? s.data?.playedAt ?? null,
        ts: s.data?.Ts ?? s.data?.ts ?? s.created_at ?? null,
        raw: s.data
      }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    return new Response(
      JSON.stringify({ ok: true, form: { id: form.id, name: form.name }, count: rows.length, rows }),
      { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
