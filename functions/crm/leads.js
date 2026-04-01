export async function onRequestGet(context) {
  const { env } = context;

  if (!env.CRM_SHEETS_URL || !env.CRM_API_TOKEN) {
    return Response.json(
      {
        ok: false,
        error: "Missing CRM_SHEETS_URL or CRM_API_TOKEN."
      },
      { status: 500 }
    );
  }

  try {
    const url = new URL(env.CRM_SHEETS_URL);
    url.searchParams.set("mode", "leads");
    url.searchParams.set("crmToken", env.CRM_API_TOKEN);

    const upstream = await fetch(url.toString(), {
      headers: {
        "Accept": "application/json"
      }
    });

    const body = await upstream.text();
    const payload = safeJsonParse(body);

    return Response.json(payload, {
      status: upstream.status
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error.message || "Unable to load CRM leads."
      },
      { status: 500 }
    );
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {
      ok: false,
      error: value || "Invalid JSON response."
    };
  }
}
