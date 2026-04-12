const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatWindow = document.getElementById("chatWindow");
const statusPill = document.querySelector(".status-pill");

const config = {
  mode: "live-preferred",
  apiEndpoint: "/api/chat",
  leadEndpoint: "/api/lead"
};

const leadProfile = {
  name: "",
  intent: "",
  timeline: "",
  area: "",
  budget: "",
  phone: "",
  email: "",
  contact: ""
};

let fallbackStep = 0;
let lastForwardedLeadKey = "";
let liveReplyCount = 0;

const transcript = [
  {
    role: "assistant",
    content:
      "Hi, I'm the AI Concierge. Are you buying, selling, or just exploring?"
  }
];

const demoReplies = [
  {
    test: (text) => !leadProfile.intent && /\b(buy|buying|buyer|purchase|house hunt|looking to buy)\b/i.test(text),
    reply:
      "Great. To point you the right way, what area are you hoping to buy in, what timeline are you working with, and what's your name and best phone number or email for follow-up?"
  },
  {
    test: (text) => !leadProfile.intent && /\b(sell|selling|seller|listing|home valuation|value my home)\b/i.test(text),
    reply:
      "Absolutely. What city is the home in, how soon are you thinking of moving, and what's your name and best phone number or email for follow-up?"
  },
  {
    test: (text) => !leadProfile.intent && /\b(referral|referrals|referred|relocation|relocate|relocating)\b/i.test(text),
    reply:
      "Of course. What area are they looking in, what timeline do they have, and what's your name and best contact info for follow-up?"
  },
  {
    test: (text) => !leadProfile.timeline && isTimelineAnswer_(text),
    reply:
      "Good to know. Are you already pre-approved, or still exploring financing?"
  },
  {
    test: (text) => !leadProfile.budget && /\b(\$|budget|million|k\b|cash)\b/i.test(text),
    reply:
      "That gives me a solid picture. What's your name and best phone number or email for follow-up?"
  },
  {
    test: (text) => !leadProfile.contact && /\b(@|email|phone|call me|text me)\b/i.test(text),
    reply:
      "Perfect. And what name should I put this under?"
  },
  {
    test: (text) => /\b(pre-approved|approved)\b/i.test(text),
    reply:
      "Nice, that makes the next step easier. What's your name and best phone number or email for follow-up?"
  }
];

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = chatInput.value.trim();
  if (!message) {
    return;
  }

  appendMessage("user", message);
  updateLeadProfile(message);
  transcript.push({ role: "user", content: message });
  chatInput.value = "";

  if (config.mode !== "demo" && shouldUseLiveAI(message)) {
    const handledLive = await sendToLiveAgent(message);
    if (handledLive) {
      return;
    }
  }

  if (config.mode === "live") {
    appendMessage(
      "assistant",
      "The live AI service is unavailable right now. Check the deployment and `GEMINI_API_KEY` configuration."
    );
    return;
  }

  setAssistantStatus("Demo Fallback");
  window.setTimeout(() => {
    const reply = getDemoReply(message);
    appendAssistantReply(reply);
    void maybeForwardLead(message);
  }, 150);
});

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  wrapper.appendChild(paragraph);

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function appendAssistantReply(reply) {
  const nextReply = avoidRepeatedReply_(reply);
  appendMessage("assistant", nextReply);
  transcript.push({ role: "assistant", content: nextReply });
}

function avoidRepeatedReply_(reply) {
  const text = String(reply || "").trim();
  const lastAssistant = [...transcript].reverse().find((entry) => entry.role === "assistant");
  const lastText = String(lastAssistant?.content || "").trim();

  if (!text || text !== lastText) {
    return text;
  }

  if (leadProfile.intent === "buyer") {
    return "Great. What area, timeline, and budget range should I share with Gurleen?";
  }

  if (leadProfile.intent === "seller") {
    return "Great. What city is the home in, and what timeline are you thinking about?";
  }

  if (leadProfile.intent === "referral") {
    return "Great. What area is the referral focused on, and what is the best contact info for follow-up?";
  }

  return "Thanks. What is the best way for Gurleen to follow up with you?";
}

function getDemoReply(text) {
  const matchedReply = demoReplies.find((item) => item.test(text));

  if (matchedReply) {
    fallbackStep += 1;
    return matchedReply.reply;
  }

  if (!leadProfile.intent) {
    return "Are you buying, selling, or helping with a referral?";
  }

  if (leadProfile.intent === "buyer") {
    if (!leadProfile.area) {
      return "Which area are you focused on?";
    }

    if (!leadProfile.timeline) {
      return "What timeline are you working with?";
    }

    if (!leadProfile.budget) {
      return "Do you have a budget range in mind?";
    }

    if (!leadProfile.contact) {
      return "What's your name and best email or phone number for follow-up?";
    }

    if (!leadProfile.name) {
      return "And what name should I put this under?";
    }

    return "Perfect. The next step would usually be a buyer consult or showing.";
  }

  if (leadProfile.intent === "seller") {
    if (!leadProfile.area) {
      return "What city is the home in?";
    }

    if (!leadProfile.timeline) {
      return "How soon are you thinking of moving?";
    }

    if (!leadProfile.contact) {
      return "What's your name and best email or phone number for follow-up?";
    }

    if (!leadProfile.name) {
      return "And what name should I put this under?";
    }

    return "Perfect. The next step would usually be a valuation call or listing consult.";
  }

  if (leadProfile.intent === "referral") {
    if (!leadProfile.area) {
      return "What area is the referral looking in?";
    }

    if (!leadProfile.timeline) {
      return "Do you know their timeline yet?";
    }

    if (!leadProfile.contact) {
      return "What's your name and best contact info for follow-up?";
    }

    if (!leadProfile.name) {
      return "And what name should I put this under?";
    }

    return "Perfect. The next step would usually be a quick referral follow-up.";
  }

  if (!leadProfile.contact) {
    return "What's your name and best email or phone number for follow-up?";
  }

  if (!leadProfile.name) {
    return "And what name should I put this under?";
  }

  return "Perfect. The next step would usually be a quick consult or follow-up.";
}

function updateLeadProfile(text) {
  const normalizedText = text.trim();

  if (!leadProfile.intent && /\b(buy|buying|buyer|purchase|purchasing|home search|house hunt|looking for a home|looking to buy)\b/i.test(text)) {
    leadProfile.intent = "buyer";
  } else if (!leadProfile.intent && /\b(sell|selling|seller|listing|valuation|value my home)\b/i.test(text)) {
    leadProfile.intent = "seller";
  } else if (!leadProfile.intent && /\b(referral|referrals|referred|relocation|relocate|relocating)\b/i.test(text)) {
    leadProfile.intent = "referral";
  }

  if (!leadProfile.timeline && isTimelineAnswer_(text)) {
    leadProfile.timeline = normalizedText;
  }

  if (!leadProfile.area && /\b(in|near|around)\s+[a-z]/i.test(text)) {
    leadProfile.area = normalizedText;
  } else if (
    !leadProfile.area &&
    leadProfile.intent &&
    /^[A-Za-z][A-Za-z\s,'.-]{1,40}$/.test(normalizedText) &&
    !isTimelineAnswer_(normalizedText) &&
    !/\b(buy|buying|buyer|sell|selling|seller|referral|referrals|referred|relocation|relocate|relocating|asap|soon|month|summer|spring|fall|winter|week|year|budget|cash|approved|pre-approved|email|phone|call|text)\b/i.test(normalizedText)
  ) {
    leadProfile.area = normalizedText;
  }

  if (!leadProfile.budget && /\$|\b\d{3}k\b|\bmillion\b/i.test(text)) {
    leadProfile.budget = normalizedText;
  }

  const emailMatch = text.match(/\S+@\S+\.\S+/);
  if (!leadProfile.email && emailMatch) {
    leadProfile.email = emailMatch[0];
  }

  const phoneMatch = text.match(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/);
  if (!leadProfile.phone && phoneMatch) {
    leadProfile.phone = phoneMatch[0];
  }

  if (!leadProfile.contact && (leadProfile.phone || leadProfile.email)) {
    leadProfile.contact = [leadProfile.phone, leadProfile.email].filter(Boolean).join(" | ");
  } else if (!leadProfile.contact && /\S+@\S+\.\S+|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) {
    leadProfile.contact = normalizedText;
  }

  if (!leadProfile.name) {
    const inferredName = inferName_(normalizedText);
    if (inferredName) {
      leadProfile.name = inferredName;
    }
  }
}

function inferName_(text) {
  const explicitMatch = text.match(/\b(?:my name is|i am|i'm)\s+([A-Za-z][A-Za-z' -]{1,40})/i);
  if (explicitMatch) {
    return cleanName_(explicitMatch[1]);
  }

  if (
    /^[A-Za-z][A-Za-z' -]{1,40}$/.test(text) &&
    !isTimelineAnswer_(text) &&
    !/\b(buy|buying|buyer|sell|selling|seller|referral|referrals|referred|relocation|relocate|relocating|asap|soon|month|summer|spring|fall|winter|week|year|budget|cash|approved|pre-approved|email|phone|call|text|contact|merced|atwater)\b/i.test(text)
  ) {
    return cleanName_(text);
  }

  return "";
}

function isTimelineAnswer_(text) {
  return /\b(asap|soon|immediately|now|today|tomorrow|week|weeks|month|months|year|years|timeline|spring|summer|fall|autumn|winter|quarter|q[1-4]|this year|next year|later this year|early next year|end of the year|before the end of the year|by the end of the year|within the year|in a few months|couple months|few months|3 months|6 months|12 months)\b/i.test(String(text || ""));
}

function cleanName_(value) {
  return String(value || "")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

function shouldUseLiveAI(message) {
  const normalized = String(message || "").trim();
  if (!normalized) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).length;
  const looksLikeQuestion = /[?]|\b(can|could|do|does|is|are|what|when|where|why|how|which|who)\b/i.test(normalized);
  const isOpeningIntentAnswer = transcript.length <= 2 && Boolean(leadProfile.intent) && wordCount <= 10 && !looksLikeQuestion;
  const alreadyQualified = Boolean(
    leadProfile.intent &&
    leadProfile.area &&
    leadProfile.timeline &&
    leadProfile.contact
  );

  if (isOpeningIntentAnswer) {
    return false;
  }

  if (isTimelineAnswer_(normalized) && wordCount <= 6) {
    return false;
  }

  if (liveReplyCount === 0) {
    return true;
  }

  if (looksLikeQuestion || wordCount >= 16) {
    return true;
  }

  if (alreadyQualified) {
    return true;
  }

  return false;
}

async function sendToLiveAgent(message) {
  try {
    setAssistantStatus("Connecting...");
    const response = await fetch(config.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        leadProfile,
        transcript
      })
    });

    if (!response.ok) {
      throw new Error("Unable to reach the AI service.");
    }

    const data = await response.json();
    setAssistantStatus(data.provider ? `${data.provider} Live` : "Live AI");
    const reply = data.reply || "I'm here and ready to help.";
    appendAssistantReply(reply);
    liveReplyCount += 1;
    void maybeForwardLead(message);
    return true;
  } catch (error) {
    return false;
  }
}

async function maybeForwardLead(message) {
  const forwardKey = getLeadForwardKey();

  if (!forwardKey || forwardKey === lastForwardedLeadKey) {
    return;
  }

  try {
    const response = await fetch(config.leadEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        leadProfile,
        transcript
      })
    });

    if (!response.ok) {
      throw new Error("Lead forwarding failed.");
    }

    lastForwardedLeadKey = forwardKey;
    setAssistantStatus("Lead Captured");
    appendAssistantReply("Thanks, I sent your details to Gurleen. She can follow up with you personally from here.");
  } catch (error) {
    console.error(error);
  }
}

function getLeadForwardKey() {
  const intent = String(leadProfile.intent || "").trim().toLowerCase();
  const contact = String(leadProfile.contact || "").trim().toLowerCase();

  if (!intent || !contact) {
    return "";
  }

  return `${intent}|${contact}`;
}

function markLeadForwarded() {
  const forwardKey = getLeadForwardKey();
  if (forwardKey) {
    lastForwardedLeadKey = forwardKey;
  }
}

function setAssistantStatus(label) {
  if (statusPill) {
    const statusLabel = String(label || "Checking AI status").trim();
    statusPill.innerHTML = `<span class="sr-only">${escapeHtml(statusLabel)}</span>`;
    statusPill.setAttribute("aria-label", statusLabel);
    statusPill.setAttribute("title", statusLabel);
    statusPill.classList.remove("is-live", "is-fallback", "is-offline", "is-checking");

    if (/live|captured/i.test(statusLabel)) {
      statusPill.classList.add("is-live");
    } else if (/unavailable|error|offline/i.test(statusLabel)) {
      statusPill.classList.add("is-offline");
    } else if (/fallback|demo|connecting|checking/i.test(statusLabel)) {
      statusPill.classList.add("is-fallback");
    } else {
      statusPill.classList.add("is-checking");
    }
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
