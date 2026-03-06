// AgencyCRM First-Party Tracking Pixel
// Embed on every page: <script src="https://yourdomain.com/t.js" data-key="YOUR_SITE_API_KEY" async></script>
(function () {
  "use strict";

  var script = document.currentScript;
  var apiKey = script && script.getAttribute("data-key");
  var endpoint =
    (script && script.getAttribute("data-endpoint")) ||
    script.src.replace(/\/t\.js.*$/, "/api/inbound/pageview");

  if (!apiKey) return;

  // Generate or retrieve visitor ID (first-party cookie, 1 year)
  function getVisitorId() {
    var match = document.cookie.match(/(?:^|; )_acv=([^;]+)/);
    if (match) return match[1];
    var id =
      Date.now().toString(36) +
      Math.random().toString(36).substring(2, 10);
    var expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie =
      "_acv=" + id + ";expires=" + expires + ";path=/;SameSite=Lax";
    return id;
  }

  // Generate session ID (session cookie)
  function getSessionId() {
    var match = document.cookie.match(/(?:^|; )_acs=([^;]+)/);
    if (match) return match[1];
    var id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    document.cookie = "_acs=" + id + ";path=/;SameSite=Lax";
    return id;
  }

  // Parse UTM parameters from URL
  function getUtm() {
    var params = new URLSearchParams(window.location.search);
    return {
      utmSource: params.get("utm_source") || undefined,
      utmMedium: params.get("utm_medium") || undefined,
      utmCampaign: params.get("utm_campaign") || undefined,
      utmTerm: params.get("utm_term") || undefined,
      utmContent: params.get("utm_content") || undefined,
    };
  }

  var visitorId = getVisitorId();
  var sessionId = getSessionId();
  var pageLoadTime = Date.now();

  function sendPageView() {
    var utm = getUtm();
    var data = {
      visitorId: visitorId,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer || undefined,
      sessionId: sessionId,
      utmSource: utm.utmSource,
      utmMedium: utm.utmMedium,
      utmCampaign: utm.utmCampaign,
      utmTerm: utm.utmTerm,
      utmContent: utm.utmContent,
    };

    // Use sendBeacon if available for reliability on page unload
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        endpoint,
        new Blob(
          [JSON.stringify(data)],
          { type: "application/json" }
        )
      );
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", endpoint, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("x-api-key", apiKey);
      xhr.send(JSON.stringify(data));
    }
  }

  // Send duration on page unload
  function sendDuration() {
    var duration = Math.round((Date.now() - pageLoadTime) / 1000);
    if (duration < 1) return;
    var data = {
      visitorId: visitorId,
      url: window.location.href,
      path: window.location.pathname,
      sessionId: sessionId,
      duration: duration,
    };
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        endpoint,
        new Blob(
          [JSON.stringify(data)],
          { type: "application/json" }
        )
      );
    }
  }

  // Track page view on load
  sendPageView();

  // Send duration when leaving
  window.addEventListener("pagehide", sendDuration);

  // Expose visitor ID for form integration
  window.__acrmVisitorId = visitorId;

  // Helper: auto-inject visitorId into any form with data-acrm-form attribute
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form.hasAttribute || !form.hasAttribute("data-acrm-form")) return;
    var input = form.querySelector('input[name="visitorId"]');
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "visitorId";
      form.appendChild(input);
    }
    input.value = visitorId;
  });
})();
