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

const transcript = [
  {
    role: "assistant",
    content:
      "Hi, I'm the Homes By Gurleen Concierge. I can help with buying, selling, home valuation requests, and booking a call. Are you looking to buy, sell, or just exploring right now?"
  }
];

const demoReplies = [
  {
    test: (text) => /\b(buy|buyer|purchase|house hunt|looking to buy)\b/i.test(text),
    reply:
      "Exciting. To help narrow things down, what area are you hoping to buy in, and what kind of timeline are you working with?"
  },
  {
    test: (text) => /\b(sell|seller|listing|home valuation|value my home)\b/i.test(text),
    reply:
      "Absolutely. I can help with a sale strategy and a valuation request. What city is the home in, and how soon are you hoping to move?"
  },
  {
    test: (text) => /\b(summer|asap|soon|month|weeks|timeline)\b/i.test(text),
    reply:
      "That helps. Are you already pre-approved or still exploring financing? If you're selling, are you also buying after the sale?"
  },
  {
    test: (text) => /\b(\$|budget|million|k\b|pre-approved|approved|cash)\b/i.test(text),
    reply:
      "Perfect. I can pass that along to the realtor so she has context before reaching out. What's the best name, phone number, or email for follow-up?"
  },
  {
    test: (text) => /\b(@|email|phone|call me|text me)\b/i.test(text),
    reply:
      "Thank you. You're officially in the queue for a personal follow-up. If you'd like, I can also help draft the next best step, like a buyer consult, a home valuation call, or a showing request."
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
    return matchedReply.reply;
  }

  if (!leadProfile.intent) {
    return "I can help with buying, selling, relocation, or referrals. Which of those best fits what you need?";
  }

  return "Thanks for sharing that. I'd keep the next question focused on your timeline, preferred area, and the best way for the realtor to follow up.";
}

function updateLeadProfile(text) {
  if (!leadProfile.intent && /\b(buy|buyer|purchase)\b/i.test(text)) {
    leadProfile.intent = "buyer";
  } else if (!leadProfile.intent && /\b(sell|seller|listing|valuation)\b/i.test(text)) {
    leadProfile.intent = "seller";
  }

  if (!leadProfile.timeline && /\b(asap|soon|month|summer|spring|fall|winter|week)\b/i.test(text)) {
    leadProfile.timeline = text;
  }

  if (!leadProfile.budget && /\$|\b\d{3}k\b|\bmillion\b/i.test(text)) {
    leadProfile.budget = text;
  }

  if (!leadProfile.contact && /\S+@\S+\.\S+|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(text)) {
    leadProfile.contact = text;
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
