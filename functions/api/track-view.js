export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const body = await request.json();

    if (env.SITE_COUNTER) {
      return trackKvView_(env.SITE_COUNTER, body);
    }

    const sheetsConfig = getSheetsConfig_(env);

    if (sheetsConfig) {
      return trackSheetsView_(sheetsConfig, body);
    }

    return Response.json({
      ok: false,
      error: "Site counter is not configured. Add SITE_COUNTER KV, or add CRM_SHEETS_URL and CRM_API_TOKEN."
    }, { status: 200 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Unable to track site view." },
      { status: 500 }
    );
  }
}

function getSheetsConfig_(env) {
  const sheetsUrl = env.SITE_COUNTER_SHEETS_URL || env.CRM_SHEETS_URL || env.LEAD_WEBHOOK_URL || "";
  const apiToken = env.SITE_COUNTER_API_TOKEN || env.CRM_API_TOKEN || env.LEAD_WEBHOOK_SECRET || "";

  return sheetsUrl && apiToken ? { sheetsUrl, apiToken } : null;
}

async function trackSheetsView_({ sheetsUrl, apiToken }, body) {
  const upstream = await fetch(sheetsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...body,
      action: "trackSiteView",
      crmToken: apiToken,
      webhookSecret: apiToken
    })
  });
  const payload = await safeJson_(upstream);

  return Response.json(payload, { status: upstream.ok ? 200 : 502 });
}

async function trackKvView_(counter, body) {
  const path = normalizePath(body.path);
  const referrer = normalizeReferrer(body.referrer);
  const visitId = normalizeVisitId(body.visitId);
  const today = new Date().toISOString().slice(0, 10);

  await Promise.all([
    incrementCounter(counter, "views:total"),
    incrementCounter(counter, `views:date:${today}`),
    incrementCounter(counter, `views:path:${path}`),
    incrementCounter(counter, `views:referrer:${referrer}`),
    incrementCounter(counter, `views:pathDate:${today}:${path}`),
    incrementCounter(counter, `views:referrerDate:${today}:${referrer}`)
  ]);

  if (visitId) {
    const visitKey = `visit:${visitId}`;
    const existingVisit = await counter.get(visitKey);

    if (!existingVisit) {
      await counter.put(visitKey, today, { expirationTtl: 30 * 60 });
      await Promise.all([
        incrementCounter(counter, "visits:total"),
        incrementCounter(counter, `visits:date:${today}`)
      ]);
    }
  }

  return Response.json({ ok: true });
}

async function incrementCounter(counter, key) {
  const currentValue = Number(await counter.get(key)) || 0;
  await counter.put(key, String(currentValue + 1));
}

async function safeJson_(response) {
  try {
    return await response.json();
  } catch {
    return { ok: false, error: "Invalid site counter response." };
  }
}

function normalizePath(value) {
  const path = String(value || "/").trim() || "/";
  return path.startsWith("/") ? path.slice(0, 120) : `/${path.slice(0, 119)}`;
}

function normalizeVisitId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
}

function normalizeReferrer(value) {
  const referrer = String(value || "").trim();
  return referrer ? referrer.slice(0, 180) : "Direct";
}
