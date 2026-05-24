/* =================================================
   Schelp landing — production behaviour
   Configure SchelpConfig in <head> before this loads.
   Loads i18n dictionary from window.SchelpI18n.
   ================================================= */

(function () {
  "use strict";

  // Pull config (set inline in HTML head). Fallbacks below.
  var CFG = window.SchelpConfig || {};
  var LAUNCH_DATE = CFG.launchDate || "2026-07-15T09:00:00";
  var FORM_ENDPOINT = CFG.formEndpoint || ""; // e.g. https://formspree.io/f/xxxxxx
  var ANALYTICS_DOMAIN = CFG.analyticsDomain || ""; // Plausible domain
  var ANALYTICS_SRC = CFG.analyticsSrc || "https://plausible.io/js/script.js";

  // -------------------- i18n --------------------
  var LANG_KEY = "schelp_lang_v1";
  var DICT = window.SchelpI18n || { it: {}, en: {} };
  var SUPPORTED = ["it", "en"];
  var currentLang = "it";

  function t(key) {
    var d = DICT[currentLang] || {};
    if (d[key] != null) return d[key];
    var fb = DICT.it || {};
    return fb[key] != null ? fb[key] : key;
  }

  function detectInitialLang() {
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    var nav = (navigator.language || "it").toLowerCase();
    if (nav.indexOf("it") === 0) return "it";
    return "en";
  }

  function applyLanguage(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = "it";
    currentLang = lang;
    document.documentElement.lang = lang;

    // textContent assignments
    document.querySelectorAll("[data-i18n-text]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-text");
      el.textContent = t(k);
    });

    // innerHTML assignments (used for strings that contain inline tags)
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-html");
      el.innerHTML = t(k);
    });

    // attribute assignments — pattern: data-i18n-attr="attrName:key" (or "attr1:key1;attr2:key2")
    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      var spec = el.getAttribute("data-i18n-attr");
      spec.split(";").forEach(function (pair) {
        var bits = pair.split(":");
        if (bits.length === 2) el.setAttribute(bits[0].trim(), t(bits[1].trim()));
      });
    });

    // templated textContent (e.g. "© {year} Schelp…") — supports {year}
    var year = new Date().getFullYear();
    document.querySelectorAll("[data-i18n-text-template]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-text-template");
      var s = t(k);
      el.textContent = s.replace(/\{year\}/g, year);
    });

    // <title>
    var titleEl = document.querySelector("title");
    if (titleEl) titleEl.textContent = t("meta.title");

    // theme-color (re-set in case dict overrides)
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor && t("meta.themeColor")) themeColor.setAttribute("content", t("meta.themeColor"));

    // Lang toggle chip
    var active = document.getElementById("lang-active");
    var other = document.getElementById("lang-other");
    if (active && other) {
      var otherLang = lang === "it" ? "en" : "it";
      active.textContent = lang.toUpperCase();
      other.textContent = otherLang.toUpperCase();
    }

    // Re-render countdown labels (no-op for numbers, just trigger localised tick)
    refreshCountdownNow();

    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }

  function setupLanguageToggle() {
    var btn = document.getElementById("lang-toggle");
    if (!btn) return;
    btn.addEventListener("click", function () {
      applyLanguage(currentLang === "it" ? "en" : "it");
    });
  }

  // -------------------- Countdown --------------------
  var COUNTDOWN_ELS = null;
  function startCountdown() {
    var card = document.querySelector(".countdown-card");
    if (!card) return;
    var target = new Date(LAUNCH_DATE).getTime();
    COUNTDOWN_ELS = {
      card: card,
      target: target,
      d: document.querySelector('[data-u="d"]'),
      h: document.querySelector('[data-u="h"]'),
      m: document.querySelector('[data-u="m"]'),
      s: document.querySelector('[data-u="s"]')
    };
    if (tick()) return;
    var iv = setInterval(function () { if (tick()) clearInterval(iv); }, 1000);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  function tick() {
    if (!COUNTDOWN_ELS) return false;
    var diff = COUNTDOWN_ELS.target - Date.now();
    if (diff <= 0) {
      COUNTDOWN_ELS.card.classList.add("is-arrived");
      return true;
    }
    var d = Math.floor(diff / 86400000); diff -= d * 86400000;
    var h = Math.floor(diff / 3600000);  diff -= h * 3600000;
    var m = Math.floor(diff / 60000);    diff -= m * 60000;
    var s = Math.floor(diff / 1000);
    if (COUNTDOWN_ELS.d) COUNTDOWN_ELS.d.textContent = pad(d);
    if (COUNTDOWN_ELS.h) COUNTDOWN_ELS.h.textContent = pad(h);
    if (COUNTDOWN_ELS.m) COUNTDOWN_ELS.m.textContent = pad(m);
    if (COUNTDOWN_ELS.s) COUNTDOWN_ELS.s.textContent = pad(s);
    return false;
  }

  function refreshCountdownNow() { if (COUNTDOWN_ELS) tick(); }

  // -------------------- Email form --------------------
  function setupForm() {
    var form = document.getElementById("signup-form");
    if (!form) return;
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector("button");
    var messageEl = document.getElementById("form-message");
    var helpEl = document.getElementById("form-help");

    function showMessage(textKey, type) {
      if (!messageEl) return;
      messageEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        (type === "success" ? '<path d="M20 6 9 17l-5-5"/>' : '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>') +
        '</svg><span>' + t(textKey) + '</span>';
      messageEl.className = "form-message is-visible is-" + type;
      if (helpEl) helpEl.style.display = "none";
    }

    function setLoading(loading) {
      if (loading) {
        button.disabled = true;
        button.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + escapeHtml(t("form.submitting"));
      } else {
        button.disabled = false;
        // Rebuild from i18n so language switches mid-session still work
        button.innerHTML = '<span data-i18n-text="hero.cta">' + escapeHtml(t("hero.cta")) + '</span> <span aria-hidden="true">→</span>';
      }
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
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
        showMessage("form.invalid", "error");
        input.focus();
        return;
      }

      setLoading(true);

      // No endpoint configured — simulate success (preview / staging)
      if (!FORM_ENDPOINT) {
        await new Promise(function (r) { setTimeout(r, 700); });
        setLoading(false);
        showMessage("form.success", "success");
        form.reset();
        track("Signup (preview)");
        return;
      }

      try {
        var res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ email: email, source: "landing", lang: currentLang, _subject: "New Schelp signup" })
        });
        if (!res.ok) throw new Error("Request failed: " + res.status);
        setLoading(false);
        showMessage("form.success", "success");
        form.reset();
        track("Signup");
      } catch (err) {
        console.error("[schelp] signup failed", err);
        setLoading(false);
        form.classList.add("is-error");
        showMessage("form.error", "error");
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

  // -------------------- Scrollytelling --------------------
  function setupScrollytelling() {
    var phoneWrap = document.querySelector('.hiw-phone-wrap');
    var steps = document.querySelectorAll('.hiw-step');
    // Substeps live INSIDE .substeps-display as absolute overlays. They're
    // not what the observer watches — see `spacers` below.
    var substeps = document.querySelectorAll('.hiw-substep');
    var spacers = document.querySelectorAll('.substep-spacer');
    if (!phoneWrap || !steps.length) return;
    if (window.matchMedia('(max-width: 900px)').matches) return;

    var scenes = phoneWrap.querySelectorAll('.scene');
    var genSubs = phoneWrap.querySelectorAll('.gen-sub');

    function setActive(sceneName, subSceneName) {
      phoneWrap.setAttribute('data-scene', sceneName);
      if (subSceneName) phoneWrap.setAttribute('data-sub-scene', subSceneName);
      else phoneWrap.removeAttribute('data-sub-scene');

      steps.forEach(function (s) { s.classList.toggle('is-active', s.dataset.scene === sceneName); });

      // Substep overlays — match by sub-scene only (they're scoped inside step 1)
      substeps.forEach(function (s) {
        s.classList.toggle('is-active', !!subSceneName && s.dataset.subScene === subSceneName);
      });

      scenes.forEach(function (s) { s.classList.toggle('is-active', s.dataset.scene === sceneName); });

      // Toggle sub-scenes (works for scene-generate AND scene-tune — any scene with .gen-sub children)
      if (subSceneName) {
        genSubs.forEach(function (g) { g.classList.toggle('is-active', g.dataset.subScene === subSceneName); });
      }
    }

    var observer = new IntersectionObserver(function (entries) {
      var best = null;
      entries.forEach(function (e) {
        if (e.isIntersecting && (!best || e.intersectionRatio > best.intersectionRatio)) {
          best = e;
        }
      });
      if (best) {
        var ds = best.target.dataset;
        setActive(ds.scene, ds.subScene || null);
      }
    }, {
      threshold: [0.35, 0.5, 0.6, 0.7],
      rootMargin: '-25% 0px -25% 0px'
    });

    // Observe the 4 spacers (substep triggers) + all macro steps except .hiw-step-multi (which is driven by spacers)
    spacers.forEach(function (s) { observer.observe(s); });
    steps.forEach(function (s) {
      if (!s.classList.contains('hiw-step-multi')) observer.observe(s);
    });

    // Initial state: first sub-scene (quick)
    if (spacers.length) {
      setActive(spacers[0].dataset.scene, spacers[0].dataset.subScene);
    } else {
      setActive(steps[0].dataset.scene);
    }
  }

  // -------------------- Mobile "How it works" --------------------
  // On <=900px viewports the desktop sticky scrollytelling is hidden. Instead of
  // scroll-jacking the phone through scenes (fragile: hardcoded sticky offsets,
  // overlapping titles, content clipped on short viewports), we lay the section
  // out as a plain vertical flow and clone the phone mockups inline:
  //   - multi-steps  -> one mini-phone PER substep, each locked to that sub-scene,
  //                     prepended inside the substep so every app screen is shown;
  //   - single steps -> one mini-phone appended after the step text.
  // No IntersectionObserver, no sticky, no magic numbers.
  function buildMobilePhone(sceneClone, sceneName) {
    var wrap = document.createElement('div');
    wrap.className = 'mobile-phone-clone';
    wrap.setAttribute('data-scene', sceneName);
    wrap.setAttribute('aria-hidden', 'true');
    var screen = document.createElement('div');
    screen.className = 'mp-screen';
    screen.appendChild(sceneClone);
    wrap.appendChild(screen);
    return wrap;
  }

  // Clone a scene and, if it has .gen-sub sub-scenes, keep only the one matching
  // `subScene` active (null = leave the clone's default active sub-scene as-is).
  function cloneScene(src, subScene) {
    var clone = src.cloneNode(true);
    clone.classList.add('is-active');
    if (subScene) {
      clone.querySelectorAll('.gen-sub').forEach(function (g) {
        g.classList.toggle('is-active', g.dataset.subScene === subScene);
      });
    }
    return clone;
  }

  function setupMobileHowItWorks() {
    if (!window.matchMedia('(max-width: 900px)').matches) return;

    var phoneWrap = document.querySelector('.hiw-phone-wrap');
    if (!phoneWrap) return;

    // Multi-steps (1, 2): one mini-phone per substep, locked to its sub-scene.
    document.querySelectorAll('.hiw-step-multi[data-scene]').forEach(function (step) {
      var sceneName = step.dataset.scene;
      var src = phoneWrap.querySelector('.scene[data-scene="' + sceneName + '"]');
      if (!src) return;
      step.querySelectorAll('.hiw-substep').forEach(function (substep) {
        var wrap = buildMobilePhone(cloneScene(src, substep.dataset.subScene), sceneName);
        substep.insertBefore(wrap, substep.firstChild);
      });
    });

    // Single steps (3, 4): one mini-phone appended after the step text.
    document.querySelectorAll('.hiw-step:not(.hiw-step-multi)[data-scene]').forEach(function (step) {
      var sceneName = step.dataset.scene;
      var src = phoneWrap.querySelector('.scene[data-scene="' + sceneName + '"]');
      if (!src) return;
      step.appendChild(buildMobilePhone(cloneScene(src, null), sceneName));
    });
  }

  // -------------------- Init --------------------
  function init() {
    applyLanguage(detectInitialLang());
    setupLanguageToggle();
    startCountdown();
    setupForm();
    setupCookies();
    setupScrollytelling();
    setupMobileHowItWorks();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
