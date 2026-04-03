const businessConfig = {
  webhookUrl: process.env.LEAD_WEBHOOK_URL || "",
  webhookSecret: process.env.LEAD_WEBHOOK_SECRET || "",
  realtorName: process.env.REALTOR_NAME || "Gurleen Chahal",
  brandName: process.env.BRAND_NAME || "Homes By Gurleen",
  market: process.env.MARKET_NAME || "the local market",
  contactEmail: process.env.CONTACT_EMAIL || "the team email on file"
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!businessConfig.webhookUrl) {
    return response.status(500).json({
      error: "Missing LEAD_WEBHOOK_URL."
    });
  }

  try {
    const { message = "", leadProfile = {}, transcript = [] } = request.body || {};

    if (!shouldForwardLead(leadProfile)) {
      return response.status(400).json({
        error: "Lead needs both intent and contact before forwarding."
      });
    }

    const headers = {
      "Content-Type": "application/json"
    };

    if (businessConfig.webhookSecret) {
      headers["x-webhook-secret"] = businessConfig.webhookSecret;
    }

    const webhookResponse = await fetch(businessConfig.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "website-ai-agent",
        sentAt: new Date().toISOString(),
        webhookSecret: businessConfig.webhookSecret,
        message,
        leadProfile,
        transcript: buildLeadSummaryTranscript_(leadProfile, transcript),
        businessConfig
      })
    });

    if (!webhookResponse.ok) {
      const details = await safeReadText(webhookResponse);
      return response.status(502).json({
        error: "Lead webhook failed.",
        details: details || `Webhook responded with ${webhookResponse.status}.`
      });
    }

    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(500).json({
      error: "Lead forwarding failed.",
      details: error?.message || "Unknown server error."
    });
  }
}

function shouldForwardLead(leadProfile) {
  return Boolean(
    String(leadProfile?.intent || "").trim() &&
    String(leadProfile?.contact || "").trim()
  );
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function buildLeadSummaryTranscript_(leadProfile, transcript) {
  const lines = [];

  if (leadProfile.name) lines.push(`Name: ${leadProfile.name}`);
  if (leadProfile.intent) lines.push(`Intent: ${leadProfile.intent}`);
  if (leadProfile.area) lines.push(`Area: ${leadProfile.area}`);
  if (leadProfile.timeline) lines.push(`Timeline: ${leadProfile.timeline}`);
  if (leadProfile.budget) lines.push(`Budget: ${leadProfile.budget}`);
  if (leadProfile.phone) lines.push(`Phone: ${leadProfile.phone}`);
  if (leadProfile.email) lines.push(`Email: ${leadProfile.email}`);
  if (leadProfile.contact) lines.push(`Best contact: ${leadProfile.contact}`);

  const latestUserMessage = Array.isArray(transcript)
    ? [...transcript].reverse().find((entry) => entry?.role === "user" && String(entry.content || "").trim())
    : null;

  if (latestUserMessage) {
    lines.push(`Latest note: ${String(latestUserMessage.content).trim()}`);
  }

  return [
    {
      role: "summary",
      content: lines.join("\n")
    }
  ];
}
