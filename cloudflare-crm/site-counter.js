(function () {
  const endpoint = "/api/track-view";
  const visitWindowMs = 30 * 60 * 1000;

  function getVisitId() {
    try {
      const stored = JSON.parse(localStorage.getItem("hbgVisitCounter") || "null");
      const now = Date.now();

      if (stored && stored.id && stored.expiresAt > now) {
        return {
          id: stored.id,
          isNewVisit: false
        };
      }

      const id = crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem("hbgVisitCounter", JSON.stringify({
        id,
        expiresAt: now + visitWindowMs
      }));
      return {
        id,
        isNewVisit: true
      };
    } catch {
      return {
        id: "",
        isNewVisit: false
      };
    }
  }

  const visit = getVisitId();
  const payload = JSON.stringify({
    path: window.location.pathname || "/",
    title: document.title || "",
    referrer: document.referrer || "",
    visitId: visit.id,
    isNewVisit: visit.isNewVisit
  });

  if (navigator.sendBeacon) {
    const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: "application/json" }));
    if (sent) {
      return;
    }
  }

  fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: payload,
    keepalive: true
  }).catch(() => {});
})();
