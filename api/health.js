export default function handler(request, response) {
  response.status(200).json({
    ok: true,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    hasLeadWebhook: Boolean(process.env.LEAD_WEBHOOK_URL),
    model: process.env.OPENAI_MODEL || "gpt-5"
  });
}
