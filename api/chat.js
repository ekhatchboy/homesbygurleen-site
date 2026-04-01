import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const model = process.env.OPENAI_MODEL || "gpt-5";
const businessConfig = {
  realtorName: process.env.REALTOR_NAME || "Gurleen Chahal",
  brandName: process.env.BRAND_NAME || "HomesbyGurleen",
  market: process.env.MARKET_NAME || "the local market",
  contactEmail: process.env.CONTACT_EMAIL || "the team email on file",
  webhookUrl: process.env.LEAD_WEBHOOK_URL || "",
  webhookSecret: process.env.LEAD_WEBHOOK_SECRET || ""
};

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!process.env.OPENAI_API_KEY) {
    return response.status(500).json({
      error: "Missing OPENAI_API_KEY."
    });
  }

  try {
    const { message, leadProfile = {}, transcript = [] } = request.body || {};

    if (!message || typeof message !== "string") {
      return response.status(400).json({
        error: "A user message is required."
      });
    }

    const leadSummary = summarizeLeadProfile(leadProfile);
    const recentTranscript = summarizeTranscript(transcript);

    const aiResponse = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      instructions: [
        `You are the AI assistant for ${businessConfig.brandName}.`,
        `The realtor is ${businessConfig.realtorName} and the market is ${businessConfig.market}.`,
        "You are a warm, concise, conversion-focused AI assistant for a realtor business.",
        "Your job is to help buyers, sellers, and referrals feel supported while qualifying the lead.",
        "Ask at most one follow-up question unless the user explicitly asks for a list.",
        "Prioritize collecting: intent, location, timeline, price range, financing status, and contact information.",
        "If the user appears to be a buyer, focus on area, timing, budget, and pre-approval status.",
        "If the user appears to be a seller, focus on property location, timing, motivation, and valuation interest.",
        "If the lead is ready, recommend one clear next step such as a buyer consult, seller valuation call, or showing.",
        `If contact information is already present, you can mention that ${businessConfig.realtorName} can follow up at ${businessConfig.contactEmail}.`,
        "Do not invent listings, legal advice, mortgage approvals, or market stats you have not been given.",
        "Keep replies under 120 words and sound personal rather than robotic."
      ].join(" "),
      input: [
        {
          role: "developer",
          content: `Known lead details so far: ${leadSummary}`
        },
        {
          role: "developer",
          content: `Recent conversation: ${recentTranscript}`
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    const reply = aiResponse.output_text || "I'd be happy to help. What would you like to do next?";

    if (shouldForwardLead(leadProfile) && businessConfig.webhookUrl) {
      await forwardLead({
        message,
        reply,
        leadProfile,
        transcript,
        businessConfig
      });
    }

    return response.status(200).json({
      reply
    });
  } catch (error) {
    const statusCode = error?.status || 500;
    return response.status(statusCode).json({
      error: "OpenAI request failed.",
      details: error?.message || "Unknown server error."
    });
  }
}

function summarizeLeadProfile(leadProfile) {
  const entries = Object.entries(leadProfile)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${key}: ${value.trim()}`);

  return entries.length ? entries.join("; ") : "No lead details captured yet.";
}

function summarizeTranscript(transcript) {
  if (!Array.isArray(transcript) || !transcript.length) {
    return "No transcript yet.";
  }

  return transcript
    .slice(-6)
    .map((entry) => `${entry.role}: ${String(entry.content || "").trim()}`)
    .join(" | ");
}

function shouldForwardLead(leadProfile) {
  return Boolean(leadProfile.intent && leadProfile.contact);
}

async function forwardLead(payload) {
  try {
    const headers = {
      "Content-Type": "application/json"
    };

    if (businessConfig.webhookSecret) {
      headers["x-webhook-secret"] = businessConfig.webhookSecret;
    }

    await fetch(businessConfig.webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: "website-ai-agent",
        sentAt: new Date().toISOString(),
        ...payload
      })
    });
  } catch (error) {
    console.error("Lead webhook failed:", error);
  }
}
