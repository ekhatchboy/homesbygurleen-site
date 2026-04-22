export async function onRequestGet(context) {
  const { env, request } = context;

  if (!isAuthorized(request, env)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (env.SITE_COUNTER) {
    return getKvStats_(env.SITE_COUNTER);
  }

  const sheetsConfig = getSheetsConfig_(env);

  if (sheetsConfig) {
    return getSheetsStats_(sheetsConfig);
  }

  return Response.json({
    ok: false,
    error: "Site counter is not configured. Add SITE_COUNTER KV, or add CRM_SHEETS_URL and CRM_API_TOKEN."
  }, { status: 500 });
}

function isAuthorized(request, env) {
  const token = env.SITE_COUNTER_ADMIN_TOKEN;

  if (!token) {
    return false;
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token") || "";
  const authHeader = request.headers.get("Authorization") || "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "");

  return queryToken === token || bearerToken === token;
}

function getSheetsConfig_(env) {
  const sheetsUrl = env.SITE_COUNTER_SHEETS_URL || env.CRM_SHEETS_URL || env.LEAD_WEBHOOK_URL || "";
  const apiToken = env.SITE_COUNTER_API_TOKEN || env.CRM_API_TOKEN || env.LEAD_WEBHOOK_SECRET || "";

  return sheetsUrl && apiToken ? { sheetsUrl, apiToken } : null;
}

async function getSheetsStats_({ sheetsUrl, apiToken }) {
  const upstream = await fetch(sheetsUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "getSiteStats",
      crmToken: apiToken,
      webhookSecret: apiToken
    })
  });
  const payload = await safeJson_(upstream);

  return Response.json(payload, { status: upstream.ok ? 200 : 502 });
}

async function getKvStats_(counter) {
  const days = getRecentDays(14);
  const pathCounts = await getPathCounts(counter);
  const referrerCounts = await getReferrerCounts(counter);

  return Response.json({
    ok: true,
    totalViews: await getNumber(counter, "views:total"),
    totalVisits: await getNumber(counter, "visits:total"),
    daily: await Promise.all(days.map(async (date) => ({
      date,
      views: await getNumber(counter, `views:date:${date}`),
      visits: await getNumber(counter, `visits:date:${date}`)
    }))),
    pages: pathCounts,
    referrers: referrerCounts
  });
}

async function getPathCounts(counter) {
  const list = await counter.list({ prefix: "views:path:", limit: 50 });
  const pages = await Promise.all(list.keys.map(async (item) => ({
    path: item.name.replace("views:path:", "") || "/",
    views: await getNumber(counter, item.name)
  })));

  return pages.sort((firstPage, secondPage) => secondPage.views - firstPage.views);
}

async function getReferrerCounts(counter) {
  const list = await counter.list({ prefix: "views:referrer:", limit: 50 });
  const referrers = await Promise.all(list.keys.map(async (item) => ({
    referrer: item.name.replace("views:referrer:", "") || "Direct",
    views: await getNumber(counter, item.name)
  })));

  return referrers.sort((firstReferrer, secondReferrer) => secondReferrer.views - firstReferrer.views);
}

async function getNumber(counter, key) {
  return Number(await counter.get(key)) || 0;
}

async function safeJson_(response) {
  try {
    return await response.json();
  } catch {
    return { ok: false, error: "Invalid site counter response." };
  }
}

function getRecentDays(count) {
  const days = [];
  const date = new Date();

  for (let index = 0; index < count; index += 1) {
    days.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return days;
}
