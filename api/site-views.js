const config = {
  sheetsUrl: process.env.SITE_COUNTER_SHEETS_URL || process.env.CRM_SHEETS_URL || "",
  apiToken: process.env.SITE_COUNTER_API_TOKEN || process.env.CRM_API_TOKEN || "",
  adminToken: process.env.SITE_COUNTER_ADMIN_TOKEN || ""
};

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (!isAuthorized(request)) {
    return response.status(401).json({ ok: false, error: "Unauthorized." });
  }

  if (!config.sheetsUrl || !config.apiToken) {
    return response.status(500).json({ ok: false, error: "Site counter is not configured." });
  }

  try {
    const upstream = await fetch(config.sheetsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "getSiteStats",
        crmToken: config.apiToken
      })
    });

    const payload = await safeJson(upstream);
    return response.status(upstream.ok ? 200 : 502).json(payload);
  } catch (error) {
    return response.status(500).json({ ok: false, error: error.message || "Unable to load site counter." });
  }
}

function isAuthorized(request) {
  if (!config.adminToken) {
    return false;
  }

  const queryToken = String(request.query?.token || "");
  const bearerToken = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return queryToken === config.adminToken || bearerToken === config.adminToken;
}

async function safeJson(upstream) {
  try {
    return await upstream.json();
  } catch {
    return { ok: false, error: "Invalid site counter response." };
  }
}
