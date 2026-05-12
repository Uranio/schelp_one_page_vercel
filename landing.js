/* =================================================
   Schelp landing — production behaviour
   Configure SchelpConfig in <head> before this loads.
   ================================================= */

(function () {
  "use strict";

  // Pull config (set inline in HTML head). Fallbacks below.
  var CFG = window.SchelpConfig || {};
  var LAUNCH_DATE = CFG.launchDate || "2026-07-15T09:00:00";
  var FORM_ENDPOINT = CFG.formEndpoint || ""; // e.g. https://formspree.io/f/xxxxxx
  var ANALYTICS_DOMAIN = CFG.analyticsDomain || ""; // Plausible domain
  var ANALYTICS_SRC = CFG.analyticsSrc || "https://plausible.io/js/script.js";

  // -------------------- Waveform bars --------------------
  function drawWaveform() {
    var wv = document.getElementById("wv");
    if (!wv) return;
    var hs = [4, 8, 12, 6, 16, 10, 14, 8, 18, 6, 12, 16, 10, 6, 14, 8, 14, 10, 18, 5, 12, 8];
    wv.innerHTML = hs.map(function (h) { return "<i style=\"height:" + h + "px\"></i>"; }).join("");
  }

  // -------------------- Countdown --------------------
  function startCountdown() {
    var card = document.querySelector(".countdown-card");
    if (!card) return;
    var target = new Date(LAUNCH_DATE).getTime();
    var u = {
      d: document.querySelector('[data-u="d"]'),
      h: document.querySelector('[data-u="h"]'),
      m: document.querySelector('[data-u="m"]'),
      s: document.querySelector('[data-u="s"]')
    };
    var pad = function (n) { return String(n).padStart(2, "0"); };
    function tick() {
      var diff = target - Date.now();
      if (diff <= 0) {
        card.classList.add("is-arrived");
        return true;
      }
      var d = Math.floor(diff / 86400000); diff -= d * 86400000;
      var h = Math.floor(diff / 3600000);  diff -= h * 3600000;
      var m = Math.floor(diff / 60000);    diff -= m * 60000;
      var s = Math.floor(diff / 1000);
      if (u.d) u.d.textContent = pad(d);
      if (u.h) u.h.textContent = pad(h);
      if (u.m) u.m.textContent = pad(m);
      if (u.s) u.s.textContent = pad(s);
      return false;
    }
    if (tick()) return;
    var iv = setInterval(function () { if (tick()) clearInterval(iv); }, 1000);
  }

  // -------------------- Email form --------------------
  function setupForm() {
    var form = document.getElementById("signup-form");
    if (!form) return;
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector("button");
    var messageEl = document.getElementById("form-message");
    var helpEl = document.getElementById("form-help");

    function showMessage(text, type) {
      if (!messageEl) return;
      messageEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        (type === "success" ? '<path d="M20 6 9 17l-5-5"/>' : '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>') +
        '</svg><span>' + text + '</span>';
      messageEl.className = "form-message is-visible is-" + type;
      if (helpEl) helpEl.style.display = "none";
    }

    function setLoading(loading) {
      if (loading) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner" aria-hidden="true"></span> Submitting…';
      } else {
        button.disabled = false;
        button.innerHTML = 'Get early access <span aria-hidden="true">→</span>';
      }
    }

    function track(event) {
      if (window.plausible) window.plausible(event);
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      form.classList.remove("is-error");

      var email = (input.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        form.classList.add("is-error");
        showMessage("Please enter a valid email address.", "error");
        input.focus();
        return;
      }

      setLoading(true);

      // No endpoint configured — simulate success (preview / staging)
      if (!FORM_ENDPOINT) {
        await new Promise(function (r) { setTimeout(r, 700); });
        setLoading(false);
        showMessage("You're on the list. We'll be in touch.", "success");
        form.reset();
        track("Signup (preview)");
        return;
      }

      try {
        var res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ email: email, source: "landing", _subject: "New Schelp signup" })
        });
        if (!res.ok) throw new Error("Request failed: " + res.status);
        setLoading(false);
        showMessage("You're on the list. We'll be in touch.", "success");
        form.reset();
        track("Signup");
      } catch (err) {
        console.error("[schelp] signup failed", err);
        setLoading(false);
        form.classList.add("is-error");
        showMessage("Something went wrong. Try again in a moment.", "error");
        track("Signup failed");
      }
    });
  }

  // -------------------- Cookie banner --------------------
  function setupCookies() {
    var KEY = "schelp_consent_v1";
    var banner = document.getElementById("cookie-banner");
    if (!banner) return;

    function loadAnalytics() {
      if (!ANALYTICS_DOMAIN || document.getElementById("plausible-script")) return;
      var s = document.createElement("script");
      s.id = "plausible-script";
      s.defer = true;
      s.dataset.domain = ANALYTICS_DOMAIN;
      s.src = ANALYTICS_SRC;
      document.head.appendChild(s);
      // queue helper
      window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    }

    var existing = null;
    try { existing = localStorage.getItem(KEY); } catch (e) {}

    if (existing === "accepted") {
      loadAnalytics();
    } else if (existing !== "declined") {
      // Show banner after a short delay so it doesn't fight the page-load animation
      setTimeout(function () { banner.classList.add("is-visible"); }, 800);
    }

    banner.querySelector(".btn-accept").addEventListener("click", function () {
      try { localStorage.setItem(KEY, "accepted"); } catch (e) {}
      banner.classList.remove("is-visible");
      loadAnalytics();
    });
    banner.querySelector(".btn-decline").addEventListener("click", function () {
      try { localStorage.setItem(KEY, "declined"); } catch (e) {}
      banner.classList.remove("is-visible");
    });
  }

  // -------------------- Year stamp --------------------
  function stampYear() {
    var el = document.getElementById("year");
    if (el) el.textContent = new Date().getFullYear();
  }

  // -------------------- Init --------------------
  function init() {
    drawWaveform();
    startCountdown();
    setupForm();
    setupCookies();
    stampYear();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
