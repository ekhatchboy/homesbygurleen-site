const config = {
  sheetsUrl: process.env.SITE_COUNTER_SHEETS_URL || process.env.CRM_SHEETS_URL || "",
  apiToken: process.env.SITE_COUNTER_API_TOKEN || process.env.CRM_API_TOKEN || ""
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }

  if (!config.sheetsUrl || !config.apiToken) {
    return response.status(200).json({ ok: false, error: "Site counter is not configured." });
  }

  try {
    const upstream = await fetch(config.sheetsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...(request.body || {}),
        action: "trackSiteView",
        crmToken: config.apiToken
      })
    });

    const payload = await safeJson(upstream);
    return response.status(upstream.ok ? 200 : 502).json(payload);
  } catch (error) {
    return response.status(200).json({ ok: false, error: error.message || "Unable to track site view." });
  }
}

async function safeJson(upstream) {
  try {
    return await upstream.json();
  } catch {
    return { ok: false, error: "Invalid site counter response." };
  }
}
