export async function onRequestPost(context) {
  const { env, request } = context;

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
    const body = await request.json();

    const upstream = await fetch(env.CRM_SHEETS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...body,
        crmToken: env.CRM_API_TOKEN
      })
    });

    const responseBody = await upstream.text();
    const payload = safeJsonParse(responseBody);

    return Response.json(payload, {
      status: upstream.status
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error.message || "Unable to update CRM lead."
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
