export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.CRM_SHEETS_URL || !env.CRM_API_TOKEN) {
    return Response.json(
      { ok: false, error: "Missing CRM_SHEETS_URL or CRM_API_TOKEN." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const url = new URL(env.CRM_SHEETS_URL);
    url.searchParams.set("crmToken", env.CRM_API_TOKEN);

    const upstream = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const responseBody = await upstream.text();
    return Response.json(safeJsonParse(responseBody), { status: upstream.status });
  } catch (error) {
    return Response.json(
      { ok: false, error: error.message || "Unable to update map homes." },
      { status: 500 }
    );
  }
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { ok: false, error: value || "Invalid JSON response." };
  }
}
