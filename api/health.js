export default function handler(request, response) {
  response.status(200).json({
    ok: true,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
    hasGroqKey: Boolean(process.env.GROQ_API_KEY),
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    hasLeadWebhook: Boolean(process.env.LEAD_WEBHOOK_URL),
    geminiModel: process.env.GEMINI_MODEL || "gemini-3-flash-preview",
    openRouterModel: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free,mistralai/mistral-7b-instruct:free,google/gemma-2-9b-it:free",
    groqModel: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    openAIModel: process.env.OPENAI_MODEL || "gpt-4.1-mini"
  });
}
