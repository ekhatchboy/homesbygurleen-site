const config = {
  sheetsUrl: process.env.SITE_COUNTER_SHEETS_URL || process.env.CRM_SHEETS_URL || process.env.LEAD_WEBHOOK_URL || "",
  apiToken: process.env.SITE_COUNTER_API_TOKEN || process.env.CRM_API_TOKEN || process.env.LEAD_WEBHOOK_SECRET || "",
  adminToken: process.env.SITE_COUNTER_ADMIN_TOKEN || "",
  fallbackTokens: [
    process.env.SITE_COUNTER_API_TOKEN,
    process.env.CRM_API_TOKEN,
    process.env.LEAD_WEBHOOK_SECRET
  ].filter(Boolean)
};

export default async function handler(request, response) {
  if (!["GET", "DELETE"].includes(request.method)) {
    response.setHeader("Allow", "GET, DELETE");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (!isAuthorized(request)) {
    return response.status(401).json({ ok: false, error: "Unauthorized." });
  }

  if (!config.sheetsUrl || !config.apiToken) {
    return response.status(500).json({ ok: false, error: "Site counter is not configured." });
  }

  if (request.method === "DELETE") {
    return resetSiteStats(request, response);
  }

  try {
    const upstream = await fetch(config.sheetsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "getSiteStats",
        crmToken: config.apiToken,
        webhookSecret: config.apiToken
      })
    });

    const payload = await safeJson(upstream);
    return response.status(upstream.ok ? 200 : 502).json(payload);
  } catch (error) {
    return response.status(500).json({ ok: false, error: error.message || "Unable to load site counter." });
  }
}

async function resetSiteStats(request, response) {
  const resetDate = normalizeDate(request.query?.date || "");

  try {
    const upstream = await fetch(config.sheetsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: resetDate ? "resetSiteStatsDay" : "resetSiteStats",
        date: resetDate,
        crmToken: config.apiToken,
        webhookSecret: config.apiToken
      })
    });

    const payload = await safeJson(upstream);
    return response.status(upstream.ok ? 200 : 502).json(payload);
  } catch (error) {
    return response.status(500).json({ ok: false, error: error.message || "Unable to reset site counter." });
  }
}

function isAuthorized(request) {
  const allowedTokens = [config.adminToken, ...config.fallbackTokens]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  if (!allowedTokens.length) {
    return false;
  }

  const queryToken = String(request.query?.token || "");
  const bearerToken = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return allowedTokens.includes(queryToken) || allowedTokens.includes(bearerToken);
}

async function safeJson(upstream) {
  try {
    return await upstream.json();
  } catch {
    return { ok: false, error: "Invalid site counter response." };
  }
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}
