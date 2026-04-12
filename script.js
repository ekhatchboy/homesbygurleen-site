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
    test: (text) => !leadProfile.timeline && /\b(summer|asap|soon|month|weeks|timeline)\b/i.test(text),
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
    appendMessage("assistant", reply);
    transcript.push({ role: "assistant", content: reply });
    void maybeForwardLead(message);
  }, 450);
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

  if (!leadProfile.intent && /\b(buy|buying|buyer|purchase)\b/i.test(text)) {
    leadProfile.intent = "buyer";
  } else if (!leadProfile.intent && /\b(sell|selling|seller|listing|valuation)\b/i.test(text)) {
    leadProfile.intent = "seller";
  } else if (!leadProfile.intent && /\b(referral|referrals|referred|relocation|relocate|relocating)\b/i.test(text)) {
    leadProfile.intent = "referral";
  }

  if (!leadProfile.timeline && /\b(asap|soon|month|summer|spring|fall|winter|week)\b/i.test(text)) {
    leadProfile.timeline = text;
  }

  if (!leadProfile.area && /\b(in|near|around)\s+[a-z]/i.test(text)) {
    leadProfile.area = normalizedText;
  } else if (
    !leadProfile.area &&
    leadProfile.intent &&
    /^[A-Za-z][A-Za-z\s,'.-]{1,40}$/.test(normalizedText) &&
    !/\b(buy|buying|buyer|sell|selling|seller|referral|referrals|referred|relocation|relocate|relocating|asap|soon|month|summer|spring|fall|winter|week|budget|cash|approved|pre-approved|email|phone|call|text)\b/i.test(normalizedText)
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
    !/\b(buy|buying|buyer|sell|selling|seller|referral|referrals|referred|relocation|relocate|relocating|asap|soon|month|summer|spring|fall|winter|week|budget|cash|approved|pre-approved|email|phone|call|text|contact|merced|atwater)\b/i.test(text)
  ) {
    return cleanName_(text);
  }

  return "";
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
  const alreadyQualified = Boolean(
    leadProfile.intent &&
    leadProfile.area &&
    leadProfile.timeline &&
    leadProfile.contact
  );

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
    appendMessage("assistant", reply);
    transcript.push({ role: "assistant", content: reply });
    liveReplyCount += 1;
    markLeadForwarded();
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
    statusPill.textContent = label;
  }
}
