export async function onRequestPost(context) {
  const { env, request } = context;
  const counter = env.SITE_COUNTER;

  if (!counter) {
    return Response.json({ ok: false, error: "Missing SITE_COUNTER KV binding." }, { status: 500 });
  }

  try {
    const body = await request.json();
    const path = normalizePath(body.path);
    const visitId = normalizeVisitId(body.visitId);
    const today = new Date().toISOString().slice(0, 10);

    await Promise.all([
      incrementCounter(counter, "views:total"),
      incrementCounter(counter, `views:date:${today}`),
      incrementCounter(counter, `views:path:${path}`)
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
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Unable to track site view." },
      { status: 500 }
    );
  }
}

async function incrementCounter(counter, key) {
  const currentValue = Number(await counter.get(key)) || 0;
  await counter.put(key, String(currentValue + 1));
}

function normalizePath(value) {
  const path = String(value || "/").trim() || "/";
  return path.startsWith("/") ? path.slice(0, 120) : `/${path.slice(0, 119)}`;
}

function normalizeVisitId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
}
