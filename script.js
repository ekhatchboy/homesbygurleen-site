const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatWindow = document.getElementById("chatWindow");
const statusPill = document.querySelector(".status-pill");
const quickActions = document.querySelectorAll(".quick-action");

const config = {
  mode: "live-preferred",
  apiEndpoint: "/api/chat"
};

const leadProfile = {
  intent: "",
  timeline: "",
  area: "",
  budget: "",
  contact: ""
};

let fallbackStep = 0;

const transcript = [
  {
    role: "assistant",
    content:
      "Hi, I'm the Homes By Gurleen Concierge. I can help with buying, selling, home valuation requests, and booking a call. Are you looking to buy, sell, or just exploring right now?"
  }
];

const demoReplies = [
  {
    test: (text) => !leadProfile.intent && /\b(buy|buying|buyer|purchase|house hunt|looking to buy)\b/i.test(text),
    reply:
      "Great. What area are you hoping to buy in?"
  },
  {
    test: (text) => !leadProfile.intent && /\b(sell|selling|seller|listing|home valuation|value my home)\b/i.test(text),
    reply:
      "Absolutely. What city is the home in?"
  },
  {
    test: (text) => !leadProfile.intent && /\b(referral|referrals|referred|relocation)\b/i.test(text),
    reply:
      "Of course. What area or city is the referral looking in?"
  },
  {
    test: (text) => !leadProfile.timeline && /\b(summer|asap|soon|month|weeks|timeline)\b/i.test(text),
    reply:
      "Good to know. Are you already pre-approved, or still exploring financing?"
  },
  {
    test: (text) => !leadProfile.budget && /\b(\$|budget|million|k\b|cash)\b/i.test(text),
    reply:
      "That gives me a solid picture. What's the best phone number or email for follow-up?"
  },
  {
    test: (text) => !leadProfile.contact && /\b(@|email|phone|call me|text me)\b/i.test(text),
    reply:
      "Perfect. The next best step would usually be a consult, a showing request, or a valuation call."
  },
  {
    test: (text) => /\b(pre-approved|approved)\b/i.test(text),
    reply:
      "Nice, that makes the next step easier. What's the best phone number or email for follow-up?"
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

  if (config.mode !== "demo") {
    const handledLive = await sendToLiveAgent(message);
    if (handledLive) {
      return;
    }
  }

  if (config.mode === "live") {
    appendMessage(
      "assistant",
      "The live AI service is unavailable right now. Check the deployment and `OPENAI_API_KEY` configuration."
    );
    return;
  }

  setAssistantStatus("Demo Fallback");
  window.setTimeout(() => {
    const reply = getDemoReply(message);
    appendMessage("assistant", reply);
    transcript.push({ role: "assistant", content: reply });
  }, 450);
});

quickActions.forEach((button) => {
  button.addEventListener("click", () => {
    chatInput.value = button.dataset.prompt || "";
    chatInput.focus();
  });
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
    return "I can help with buying, selling, relocation, or referrals. Which of those best fits what you need?";
  }

  if (leadProfile.intent === "buyer") {
    if (!leadProfile.area) {
      return "Which area or neighborhood are you focused on?";
    }

    if (!leadProfile.timeline) {
      return "What timeline are you working with?";
    }

    if (!leadProfile.budget) {
      return "Do you have a budget range in mind yet?";
    }

    if (!leadProfile.contact) {
      return "What's the best email or phone number for follow-up?";
    }

    return "Perfect. The next best step would usually be a buyer consult or a showing request.";
  }

  if (leadProfile.intent === "seller") {
    if (!leadProfile.area) {
      return "What city or area is the home in?";
    }

    if (!leadProfile.timeline) {
      return "How soon are you thinking of moving?";
    }

    if (!leadProfile.contact) {
      return "What's the best email or phone number for follow-up?";
    }

    return "Perfect. The next best step would usually be a valuation call or listing consultation.";
  }

  if (leadProfile.intent === "referral") {
    if (!leadProfile.area) {
      return "What area or city is the referral looking in?";
    }

    if (!leadProfile.timeline) {
      return "Do you know their timeline yet?";
    }

    if (!leadProfile.contact) {
      return "What's the best contact info for follow-up?";
    }

    return "Perfect. The next best step would usually be a referral follow-up or quick consultation.";
  }

  return "What's the best email or phone number for follow-up?";
}

function updateLeadProfile(text) {
  const normalizedText = text.trim();

  if (!leadProfile.intent && /\b(buy|buying|buyer|purchase)\b/i.test(text)) {
    leadProfile.intent = "buyer";
  } else if (!leadProfile.intent && /\b(sell|selling|seller|listing|valuation)\b/i.test(text)) {
    leadProfile.intent = "seller";
  } else if (!leadProfile.intent && /\b(referral|referrals|referred|relocation)\b/i.test(text)) {
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
    !/\b(buy|buying|buyer|sell|selling|seller|referral|referrals|referred|relocation|asap|soon|month|summer|spring|fall|winter|week|budget|cash|approved|pre-approved|email|phone|call|text)\b/i.test(normalizedText)
  ) {
    leadProfile.area = normalizedText;
  }

  if (!leadProfile.budget && /\$|\b\d{3}k\b|\bmillion\b/i.test(text)) {
    leadProfile.budget = normalizedText;
  }

  if (!leadProfile.contact && /\S+@\S+\.\S+|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) {
    leadProfile.contact = normalizedText;
  }
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
    setAssistantStatus("Live AI");
    const reply = data.reply || "I'm here and ready to help.";
    appendMessage("assistant", reply);
    transcript.push({ role: "assistant", content: reply });
    return true;
  } catch (error) {
    return false;
  }
}

function setAssistantStatus(label) {
  if (statusPill) {
    statusPill.textContent = label;
  }
}
