import { GoogleGenAI } from "@google/genai";

const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const businessConfig = {
  realtorName: process.env.REALTOR_NAME || "Gurleen Chahal",
  brandName: process.env.BRAND_NAME || "Homes By Gurleen",
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

  try {
    const { message, leadProfile = {}, transcript = [] } = request.body || {};

    if (!message || typeof message !== "string") {
      return response.status(400).json({
        error: "A user message is required."
      });
    }

    const prompt = buildPrompt(message, leadProfile, transcript);
    const result = await generateReplyWithFallback(prompt);

    if (!result.reply) {
      return response.status(500).json({
        error: "No AI provider is currently available.",
        details: "Add a Gemini, OpenRouter, or OpenAI API key."
      });
    }

    if (shouldForwardLead(leadProfile) && businessConfig.webhookUrl) {
      await forwardLead({
        message,
        reply: result.reply,
        leadProfile,
        transcript,
        businessConfig
      });
    }

    return response.status(200).json({
      reply: result.reply,
      provider: result.provider
    });
  } catch (error) {
    return response.status(500).json({
      error: "AI request failed.",
      details: error?.message || "Unknown server error."
    });
  }
}

function buildPrompt(message, leadProfile, transcript) {
  const leadSummary = summarizeLeadProfile(leadProfile);
  const recentTranscript = summarizeTranscript(transcript);

  return [
    `You are the AI assistant for ${businessConfig.brandName}.`,
    `The realtor is ${businessConfig.realtorName} and the market is ${businessConfig.market}.`,
    "You are a warm, concise, conversion-focused AI assistant for a realtor business.",
    "Your job is to help buyers, sellers, investors, and referrals feel supported while qualifying the lead.",
    "Sound like a thoughtful human assistant, not a bot following a script.",
    "Ask at most one follow-up question unless the user explicitly asks for a list.",
    "Never repeat the same question or summary if the user already answered it.",
    "Acknowledge what the user already shared before moving to the next question.",
    "If enough context is already present, stop gathering details and suggest one concrete next step.",
    "Prioritize collecting: intent, location, timeline, price range, financing status, and contact information.",
    "If the user appears to be a buyer, focus on area, timing, budget, and pre-approval status.",
    "If the user appears to be a seller, focus on property location, timing, motivation, and valuation interest.",
    "If the user appears to be an investor, focus on area, budget, return goals, and timeline.",
    "Do not ask for any detail that already appears in the known lead details or recent conversation.",
    "Vary your sentence openings and avoid repeating stock phrases in every reply.",
    "If the lead is ready, recommend one clear next step such as a buyer consult, seller valuation call, or showing.",
    `If contact information is already present, you can mention that ${businessConfig.realtorName} can follow up at ${businessConfig.contactEmail}.`,
    "Do not invent listings, legal advice, mortgage approvals, or market stats you have not been given.",
    "Keep replies under 90 words and sound personal rather than robotic.",
    `Known lead details so far: ${leadSummary}`,
    `Recent conversation: ${recentTranscript}`,
    `User message: ${message}`
  ].join("\n\n");
}

async function generateReplyWithFallback(prompt) {
  const providers = [
    tryGeminiResponse,
    tryOpenRouterResponse,
    tryGroqResponse,
    tryOpenAIResponse
  ];

  const errors = [];

  for (const provider of providers) {
    try {
      const result = await provider(prompt);
      if (result?.reply) {
        return result;
      }
    } catch (error) {
      errors.push(error?.message || "Unknown provider error.");
    }
  }

  if (errors.length) {
    throw new Error(errors.join(" | "));
  }

  throw new Error("No AI provider is configured.");
}

async function tryGeminiResponse(prompt) {
  if (!geminiClient) {
    return null;
  }

  const aiResponse = await geminiClient.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
    contents: prompt
  });

  const reply = String(aiResponse.text || "").trim();
  if (!reply) {
    throw new Error("Gemini returned an empty response.");
  }

  return {
    reply,
    provider: "Gemini"
  };
}

async function tryOpenRouterResponse(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return null;
  }

  const models = getOpenRouterModels_();
  const errors = [];

  for (const model of models) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_BASE_URL || "https://homesbygurleen.com",
        "X-Title": process.env.BRAND_NAME || "Homes By Gurleen"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const details = await safeReadText(response);
      errors.push(`${model}: ${details || response.status}`);
      continue;
    }

    const data = await response.json();
    const reply = String(data?.choices?.[0]?.message?.content || "").trim();

    if (reply) {
      return {
        reply,
        provider: `OpenRouter (${model})`
      };
    }

    errors.push(`${model}: empty response`);
  }

  throw new Error(`OpenRouter failed: ${errors.join(" | ")}`);
}

async function tryOpenAIResponse(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const details = await safeReadText(response);
    throw new Error(`OpenAI failed: ${details || response.status}`);
  }

  const data = await response.json();
  const reply = String(data?.choices?.[0]?.message?.content || "").trim();

  if (!reply) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    reply,
    provider: "OpenAI"
  };
}

async function tryGroqResponse(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const details = await safeReadText(response);
    throw new Error(`Groq failed: ${details || response.status}`);
  }

  const data = await response.json();
  const reply = String(data?.choices?.[0]?.message?.content || "").trim();

  if (!reply) {
    throw new Error("Groq returned an empty response.");
  }

  return {
    reply,
    provider: "Groq"
  };
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
    .slice(-4)
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
        webhookSecret: businessConfig.webhookSecret,
        ...payload
      })
    });
  } catch (error) {
    console.error("Lead webhook failed:", error);
  }
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function getOpenRouterModels_() {
  const configured = String(process.env.OPENROUTER_MODEL || "").trim();
  if (configured) {
    return configured
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [
    "meta-llama/llama-3.1-8b-instruct:free",
    "mistralai/mistral-7b-instruct:free",
    "google/gemma-2-9b-it:free"
  ];
}
