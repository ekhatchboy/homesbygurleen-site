export default function handler(request, response) {
  response.status(200).json({
    ok: true,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    hasLeadWebhook: Boolean(process.env.LEAD_WEBHOOK_URL),
    model: process.env.GEMINI_MODEL || "gemini-3-flash-preview"
  });
}
