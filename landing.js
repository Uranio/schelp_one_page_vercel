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

  // -------------------- Funnel tracking (backend, con UTM) --------------------
  // Eventi del conversion funnel verso /public/landing/event, segmentabili per
  // utm_source. Best-effort (keepalive), non blocca nulla.
  var LANDING_API = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(location.hostname) ? "" : "https://api.apipodcast.org";
  var SID_KEY = "schelp_sid_v1", UTM_KEY = "schelp_utm_v1";
  var _sidEphemeral = null;
  function consentOK() { return !!(window.SchelpConsent && window.SchelpConsent.has()); }
  function newId(p) { return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (p + Date.now().toString(36) + Math.random().toString(16).slice(2)); }
  function getSid() {
    // Con consenso: id persistente (funnel journey). Senza: id effimero per-caricamento (anonimo aggregato).
    if (!consentOK()) { if (!_sidEphemeral) _sidEphemeral = newId("e"); return _sidEphemeral; }
    try {
      var v = localStorage.getItem(SID_KEY);
      if (v) return v;
      v = newId("s");
      localStorage.setItem(SID_KEY, v);
      return v;
    } catch (e) { if (!_sidEphemeral) _sidEphemeral = newId("e"); return _sidEphemeral; }
  }
  function getUtm() {
    try {
      var qs = new URLSearchParams(location.search), cur = {};
      ["source", "medium", "campaign"].forEach(function (k) { var v = qs.get("utm_" + k); if (v) cur[k] = v.slice(0, 120); });
      if (!consentOK()) return cur; // solo attribuzione della visita corrente, nessuno storage persistente
      if (Object.keys(cur).length) { localStorage.setItem(UTM_KEY, JSON.stringify(cur)); return cur; } // first-touch persistente
      return JSON.parse(localStorage.getItem(UTM_KEY) || "{}");
    } catch (e) { return {}; }
  }
  function trackLanding(eventType, extra) {
    try {
      var u = getUtm();
      var body = {
        event_type: eventType, session_id: getSid(), page: "landing", lang: currentLang,
        utm_source: u.source || null, utm_medium: u.medium || null, utm_campaign: u.campaign || null
      };
      if (extra) for (var k in extra) body[k] = extra[k];
      fetch(LANDING_API + "/public/landing/event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

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
    // Site is English-only for now (Italian commented out). Always start in EN,
    // ignoring any saved/browser locale.
    return "en";
    /* Original auto-detection — restore when Italian is re-enabled:
    try {
      var saved = localStorage.getItem(LANG_KEY);
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    var nav = (navigator.language || "it").toLowerCase();
    if (nav.indexOf("it") === 0) return "it";
    return "en";
    */
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

      var consent = document.getElementById("consent-check");
      if (consent && !consent.checked) {
        form.classList.add("is-error");
        showMessage("form.consentRequired", "error");
        try { consent.focus(); } catch (e) {}
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
        trackLanding("signup");
        if (window.SchelpSurvey) window.SchelpSurvey.open({ context: "landing", email: email, source: "landing", lang: currentLang, onDone: function () { trackLanding("survey_complete"); } });
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
        trackLanding("signup");
        if (window.SchelpSurvey) window.SchelpSurvey.open({ context: "landing", email: email, source: "landing", lang: currentLang, onDone: function () { trackLanding("survey_complete"); } });
      } catch (err) {
        console.error("[schelp] signup failed", err);
        setLoading(false);
        form.classList.add("is-error");
        showMessage("form.error", "error");
        track("Signup failed");
      }
    });
  }

  // -------------------- Cookie banner / consenso --------------------
  // Il banner e lo stato del consenso sono gestiti da consent.js (window.SchelpConsent).
  // Qui carichiamo Plausible SOLO se/quando l'utente accetta.
  function setupCookies() {
    function loadAnalytics() {
      if (!ANALYTICS_DOMAIN || document.getElementById("plausible-script")) return;
      var s = document.createElement("script");
      s.id = "plausible-script";
      s.defer = true;
      s.dataset.domain = ANALYTICS_DOMAIN;
      s.src = ANALYTICS_SRC;
      document.head.appendChild(s);
      window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
    }
    if (window.SchelpConsent) {
      if (window.SchelpConsent.has()) loadAnalytics();
      window.SchelpConsent.onChange(function (st) { if (st === "accepted") loadAnalytics(); });
    }
  }

  // -------------------- Scrollytelling --------------------
  // Keep .substeps-display from overlapping its .hiw-step-head: anchor it
  // dynamically below the head's real height. Hardcoded sticky offsets
  // (50vh - 280px / 50vh + 80px) only leave 360px of gap, and step 2's head
  // (longer body + bullets) easily blows past that, bleeding the substep
  // text over the step-head's body.
  function syncHiwSubstepsTop() {
    if (window.matchMedia('(max-width: 900px)').matches) return;
    document.querySelectorAll('.hiw-step-multi').forEach(function (step) {
      var head = step.querySelector('.hiw-step-head');
      var sub  = step.querySelector('.substeps-display');
      if (!head || !sub) return;
      var headH = head.getBoundingClientRect().height;
      // step-head sticks at calc(50vh - 280px). Pin substeps below it with
      // a 32px breathing gap, regardless of head content length.
      sub.style.top = 'calc(50vh - 280px + ' + Math.ceil(headH) + 'px + 32px)';
    });
  }

  // The section heading stays fixed above the swapping scenes. On mobile we move it
  // INTO the pinned stage as its top element, so it (a) stays put while scenes change
  // and (b) scrolls off FIRST when the stage releases at the section end. On desktop
  // it lives back at the top of .howitworks (the centered section header).
  function placeHiwIntro() {
    var intro = document.querySelector('.hiw-intro');
    var how = document.querySelector('.howitworks');
    var phoneWrap = document.querySelector('.hiw-phone-wrap');
    if (!intro || !how || !phoneWrap) return;
    if (window.matchMedia('(max-width: 900px)').matches) {
      if (phoneWrap.firstElementChild !== intro) phoneWrap.insertBefore(intro, phoneWrap.firstChild);
    } else {
      if (how.firstElementChild !== intro) how.insertBefore(intro, how.firstChild);
    }
  }

  function setupScrollytelling() {
    var scrolly = document.querySelector('.hiw-scrolly');
    var phoneWrap = document.querySelector('.hiw-phone-wrap');
    var steps = document.querySelectorAll('.hiw-step');
    // Substeps live INSIDE .substeps-display as absolute overlays. They're
    // not what the observer watches — see `spacers` below.
    var substeps = document.querySelectorAll('.hiw-substep');
    var spacers = document.querySelectorAll('.substep-spacer');
    if (!scrolly || !phoneWrap || !steps.length) return;
    // Runs on ALL viewports now: mobile shares this sticky scrollytelling — the
    // phone is pinned & scaled and the captions are pinned below it (see the
    // <=900px CSS). syncHiwSubstepsTop() is a no-op on mobile (desktop offsets).

    // Mobile pins ONE stage (phone + caption) at the top of the section, so the
    // phone must be the FIRST DOM child for a plain `top:0` sticky to pin it for
    // the whole section (no order:-1 sticky fragility). Desktop placement is locked
    // independently of DOM order via grid-column, so this move is safe both ways.
    if (scrolly.firstElementChild !== phoneWrap) {
      scrolly.insertBefore(phoneWrap, scrolly.firstElementChild);
    }
    // The mobile pinned stage shows: macro-step TITLE above the phone (mirrors the
    // desktop step heading) + a detail CAPTION below it. Both are shown only <=900px
    // (CSS) and synced to the active scene by setActive() below.
    var phoneEl = phoneWrap.querySelector('.phone');
    // Build the above-phone header (title + subtitle) and the below-phone caption.
    function ensureEl(cls, where) {
      var el = phoneWrap.querySelector('.' + cls);
      if (!el) {
        el = document.createElement('div');
        el.className = cls;
        el.setAttribute('aria-hidden', 'true');
        if (where === 'above') phoneWrap.insertBefore(el, phoneEl || phoneWrap.firstChild);
        else phoneWrap.appendChild(el);
      }
      return el;
    }
    // Order matters: title then subtitle, both ABOVE the phone; caption BELOW.
    var mobileTitle = ensureEl('hiw-m-title', 'above');
    var mobileSubtitle = ensureEl('hiw-m-subtitle', 'above');
    // Keep subtitle right after the title (ensureEl inserts before the phone; if both
    // were just created, title is first, subtitle second — already correct).
    if (mobileTitle.nextElementSibling !== mobileSubtitle) {
      phoneWrap.insertBefore(mobileSubtitle, mobileTitle.nextElementSibling);
    }
    var mobileCaption = ensureEl('hiw-m-caption', 'below');

    // Sources are the (now display:none) in-flow markup; innerHTML is readable even
    // while hidden.
    //   title    = the step's <h3>            (e.g. "Start from a spark")
    //   subtitle = the step's intro <p>        (the macro description, like desktop)
    //   caption  = substep detail (h4 + p) for multi-steps; empty for single steps
    //              (whose body already shows as the subtitle above).
    function stepEl(sceneName) {
      return document.querySelector('.hiw-step[data-scene="' + sceneName + '"]');
    }
    function mobileTitleText(sceneName) {
      var step = stepEl(sceneName);
      var h3 = step && step.querySelector('h3');
      return h3 ? h3.textContent : '';
    }
    function mobileSubtitleText(sceneName) {
      var step = stepEl(sceneName);
      var p = step && step.querySelector('.hiw-step-head > p, .hiw-step-cap > p');
      return p ? p.textContent : '';
    }
    function mobileCaptionHTML(sceneName, subSceneName) {
      if (subSceneName) {
        var sub = document.querySelector('.hiw-substep[data-sub-scene="' + subSceneName + '"] .hiw-sub-content');
        return sub ? sub.innerHTML : '';
      }
      // Single steps have no sub-scene: the body is the subtitle above, so the slot
      // below shows the step's tag chips (mirrors desktop's bullet pills).
      var ul = document.querySelector('.hiw-step[data-scene="' + sceneName + '"] .hiw-bullets');
      return ul ? ul.outerHTML : '';
    }
    function fadeSwap(el, html, key, isText) {
      if (key === el._key) return;                 // unchanged → don't re-trigger the fade
      el._key = key;
      if (isText) el.textContent = html; else el.innerHTML = html;
      el.classList.remove('is-fade');
      void el.offsetWidth;                         // reflow so the fade restarts every swap
      el.classList.add('is-fade');
    }
    function updateMobileCaption(sceneName, subSceneName) {
      fadeSwap(mobileTitle, mobileTitleText(sceneName), 't:' + sceneName, true);
      fadeSwap(mobileSubtitle, mobileSubtitleText(sceneName), 's:' + sceneName, true);
      fadeSwap(mobileCaption, mobileCaptionHTML(sceneName, subSceneName), 'c:' + sceneName + '/' + (subSceneName || '-'), false);
    }

    syncHiwSubstepsTop();
    placeHiwIntro();
    // Recompute after fonts settle and on viewport changes.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { syncHiwSubstepsTop(); });
    }
    window.addEventListener('resize', function () { syncHiwSubstepsTop(); placeHiwIntro(); });

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

      // Keep the mobile pinned-stage caption in sync (no-op visually on desktop).
      updateMobileCaption(sceneName, subSceneName);
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

  // -------------------- Try-them player --------------------
  // Three demo podcasts in the "Try them" section. We use ONE shared HTMLAudio
  // and swap its src when the user plays a different card — keeps things light
  // and guarantees only one card is audible at a time.
  function setupTryThemPlayers() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.tplayer'));
    if (!cards.length) return;

    var audio = new Audio();
    audio.preload = 'metadata';
    var current = null; // currently bound card

    function fmtTime(sec) {
      if (!isFinite(sec) || sec < 0) sec = 0;
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function buildBars(card) {
      var bars = card.querySelector('.tplayer-bars');
      if (!bars) return;
      bars.innerHTML = '';
      var peaks = [];
      try { peaks = JSON.parse(card.getAttribute('data-peaks') || '[]'); } catch (e) {}
      if (!peaks.length) {
        for (var i = 0; i < 40; i++) {
          var x = i / 40;
          var env = Math.sin(x * Math.PI) * 0.7 + 0.3;
          var noise = Math.abs(Math.sin(42 * 13.7 + i * 7.3 + Math.cos(i * 3.1 + 42 * 2.9) * 5)) * 0.6 + 0.4;
          peaks.push(env * noise);
        }
      }
      var frag = document.createDocumentFragment();
      peaks.slice(0, 40).forEach(function (h) {
        var b = document.createElement('span');
        b.className = 'b';
        var pct = Math.max(0.10, Math.min(1, h));
        b.style.height = (pct * 100) + '%';
        var bf = document.createElement('span');
        bf.className = 'bf';
        b.appendChild(bf);
        frag.appendChild(b);
      });
      bars.appendChild(frag);
    }

    function paintProgress(card, progress) {
      var bars = card.querySelectorAll('.tplayer-bars .b');
      var n = bars.length;
      if (!n) return;
      var seg = 1 / n;
      for (var i = 0; i < n; i++) {
        var start = i * seg;
        var end = (i + 1) * seg;
        var p = (progress - start) / (end - start);
        if (p < 0) p = 0;
        if (p > 1) p = 1;
        var fill = bars[i].querySelector('.bf');
        if (fill) fill.style.width = (p * 100) + '%';
      }
      var slider = card.querySelector('.tplayer-wave');
      if (slider) slider.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    }

    function setCardState(card, state) {
      cards.forEach(function (c) {
        c.classList.toggle('is-playing', c === card && state === 'playing');
        c.classList.toggle('is-loading', c === card && state === 'loading');
      });
    }

    function resetCard(card) {
      paintProgress(card, 0);
      var cur = card.querySelector('.tplayer-cur');
      if (cur) cur.textContent = '0:00';
    }

    // A seek requested before metadata is ready (clicking the waveform of a
    // not-yet-loaded card) is stashed here and applied once in the shared
    // loadedmetadata handler — avoids stacking ad-hoc one-shot listeners that race.
    var pendingSeekRatio = null;

    function bindCard(card) {
      current = card;
      var src = card.getAttribute('data-mp3');
      // Compare the exact requested src (not a substring of the resolved absolute
      // URL, which could false-match similarly-named files e.g. p376 vs p3760).
      if (audio.dataset.boundSrc === src) return; // already bound to this card
      audio.dataset.boundSrc = src;
      try { audio.pause(); } catch (e) {}
      audio.src = src;
      audio.load();
    }

    function playCard(card) {
      // If clicking the already-playing card, just toggle pause.
      if (current === card && !audio.paused) {
        audio.pause();
        return;
      }
      // Switching cards: pause old, reset its visual progress, then start new.
      if (current && current !== card) {
        try { audio.pause(); } catch (e) {}
        resetCard(current);
        setCardState(current, 'idle');
      }
      bindCard(card);
      setCardState(card, 'loading');
      var p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch(function () { setCardState(card, 'idle'); });
      }
    }

    // ---- per-card wiring ----
    cards.forEach(function (card) {
      buildBars(card);

      // Pre-fill the duration if data-duration is set and audio hasn't loaded yet
      var preDur = parseFloat(card.getAttribute('data-duration'));
      if (isFinite(preDur) && preDur > 0) {
        var dEl = card.querySelector('.tplayer-dur');
        if (dEl && !dEl.dataset.locked) dEl.textContent = fmtTime(preDur);
      }

      var playBtn = card.querySelector('.tplayer-play');
      if (playBtn) playBtn.addEventListener('click', function () { playCard(card); });

      // ±10 / ±15 skip buttons
      card.querySelectorAll('[data-skip]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (current !== card) { playCard(card); return; }
          var delta = parseFloat(btn.getAttribute('data-skip')) || 0;
          var dur = audio.duration || 0;
          if (!dur) return;
          audio.currentTime = Math.max(0, Math.min(dur - 0.1, audio.currentTime + delta));
        });
      });

      // Seek by clicking on the waveform
      var wave = card.querySelector('.tplayer-wave');
      if (wave) {
        var seek = function (clientX) {
          var rect = wave.getBoundingClientRect();
          var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
          var ratio = rect.width ? x / rect.width : 0;
          if (current !== card) {
            // Bind & start playing, then jump once metadata lands (handled by the
            // shared loadedmetadata listener below).
            playCard(card);
            pendingSeekRatio = ratio;
          } else {
            if (audio.duration) audio.currentTime = ratio * audio.duration;
            paintProgress(card, ratio);
          }
        };
        wave.addEventListener('click', function (e) { seek(e.clientX); });
        wave.addEventListener('keydown', function (e) {
          var dur = audio.duration || 0;
          if (current !== card || !dur) return;
          if (e.key === 'ArrowRight') { audio.currentTime = Math.min(dur, audio.currentTime + 5); e.preventDefault(); }
          if (e.key === 'ArrowLeft')  { audio.currentTime = Math.max(0,   audio.currentTime - 5); e.preventDefault(); }
        });
      }
    });

    // ---- shared audio events ----
    audio.addEventListener('loadedmetadata', function () {
      if (!current) return;
      var dEl = current.querySelector('.tplayer-dur');
      if (dEl && isFinite(audio.duration)) {
        dEl.textContent = fmtTime(audio.duration);
        dEl.dataset.locked = '1';
      }
      // Apply a seek that was requested before this card's metadata was ready.
      if (pendingSeekRatio != null && audio.duration) {
        audio.currentTime = pendingSeekRatio * audio.duration;
        pendingSeekRatio = null;
      }
    });
    audio.addEventListener('timeupdate', function () {
      if (!current || !audio.duration) return;
      var progress = audio.currentTime / audio.duration;
      paintProgress(current, progress);
      var cur = current.querySelector('.tplayer-cur');
      if (cur) cur.textContent = fmtTime(audio.currentTime);
    });
    audio.addEventListener('playing', function () { if (current) setCardState(current, 'playing'); });
    audio.addEventListener('pause',   function () { if (current) setCardState(current, 'idle'); });
    audio.addEventListener('waiting', function () { if (current) setCardState(current, 'loading'); });
    audio.addEventListener('ended',   function () {
      if (!current) return;
      paintProgress(current, 1);
      setCardState(current, 'idle');
    });
    audio.addEventListener('error', function () {
      if (current) setCardState(current, 'idle');
    });
  }

  // -------------------- Try-them mobile carousel dots --------------------
  // On mobile the grid becomes a horizontal scroll-snap carousel. We add a
  // dot per card that tracks the currently centered card. Desktop hides the
  // dots via CSS, so this can run unconditionally.
  function setupTryThemDots() {
    var section = document.querySelector('.trythem');
    if (!section) return;
    var grid = section.querySelector('.trythem-grid');
    var host = section.querySelector('.trythem-dots');
    if (!grid || !host) return;

    var cells = Array.prototype.slice.call(grid.querySelectorAll('.tplayer-cell'));
    if (!cells.length) return;

    host.innerHTML = '';
    cells.forEach(function (cell, idx) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'trythem-dot' + (idx === 0 ? ' is-active' : '');
      btn.setAttribute('aria-label', 'Episode ' + (idx + 1));
      btn.addEventListener('click', function () {
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        cell.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
      });
      host.appendChild(btn);
    });
    var dots = Array.prototype.slice.call(host.querySelectorAll('.trythem-dot'));

    function setActive(idx) {
      dots.forEach(function (d, i) { d.classList.toggle('is-active', i === idx); });
    }

    // IntersectionObserver against the scroller — picks the most-visible cell
    // as the active one. Threshold tuned so a half-swiped card flips the dot
    // when it crosses ~60% into view.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        var best = null;
        entries.forEach(function (e) {
          if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
        });
        if (best && best.intersectionRatio > 0.55) {
          var idx = cells.indexOf(best.target);
          if (idx >= 0) setActive(idx);
        }
      }, { root: grid, threshold: [0.55, 0.7, 0.85, 0.99] });
      cells.forEach(function (c) { io.observe(c); });
    }
  }

  // -------------------- Snap "per scena" in How it works (stile fullPage) --------------------
  // Lo scroll-snap CSS (mandatory) + spacer 100vh + elementi sticky si blocca con la
  // rotella veloce. Qui intercettiamo la rotella SOLO dentro lo scrollytelling: ogni
  // gesto avanza di UNA scena (smooth scroll esatto sul punto in cui il telefono cambia
  // schermata). Fuori dalla sezione e ai bordi (prima/ultima scena) lo scroll resta
  // libero, così non si resta mai intrappolati. Solo desktop. Touch/mobile invariati.
  function setupHiwWheelSnap() {
    if (window.matchMedia('(max-width: 900px)').matches) return;
    // Respect reduced-motion: don't hijack the wheel into smooth scene-snapping.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var section = document.querySelector('.howitworks');
    if (!section) return;

    // Posizioni-scena (scrollY assoluto in cui ogni scena è "centrata") = stessi
    // trigger dell'IntersectionObserver: gli spacer delle sub-scene + gli step singoli.
    var cache = null;
    function build() {
      var els = Array.prototype.slice.call(
        document.querySelectorAll('.substep-spacer, .hiw-step:not(.hiw-step-multi)')
      );
      var vh = window.innerHeight;
      var ys = [];
      els.forEach(function (el) {
        var r = el.getBoundingClientRect();
        ys.push(Math.round(window.scrollY + r.top + r.height / 2 - vh / 2));
      });
      ys.sort(function (a, b) { return a - b; });
      return ys;
    }
    function targets() { if (!cache) cache = build(); return cache; }
    function invalidate() { cache = null; }
    window.addEventListener('resize', invalidate);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(invalidate);

    var animating = false;

    window.addEventListener('wheel', function (e) {
      if (window.matchMedia('(max-width: 900px)').matches) return;
      var ys = targets();
      if (!ys.length) return;
      var y = window.scrollY;
      var first = ys[0], last = ys[ys.length - 1];
      if (y < first - 6 || y > last + 6) return;             // fuori dalle scene → scroll libero
      var dir = e.deltaY > 0 ? 1 : (e.deltaY < 0 ? -1 : 0);
      if (!dir) return;

      // scena più vicina
      var ni = 0, bd = Infinity, i, d;
      for (i = 0; i < ys.length; i++) { d = Math.abs(ys[i] - y); if (d < bd) { bd = d; ni = i; } }

      var targetY = null;
      if (bd > 6) {
        // non allineato → prima scena nella direzione del gesto
        if (dir > 0) { for (i = 0; i < ys.length; i++) { if (ys[i] > y) { targetY = ys[i]; break; } } }
        else { for (i = ys.length - 1; i >= 0; i--) { if (ys[i] < y) { targetY = ys[i]; break; } } }
      } else {
        // allineato a una scena → avanza di una
        var idx = ni + dir;
        if (idx >= 0 && idx < ys.length) targetY = ys[idx];
      }
      if (targetY == null) return;                           // bordo → esci con scroll normale

      e.preventDefault();
      if (animating) return;
      animating = true;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
      setTimeout(function () { animating = false; }, 480);
    }, { passive: false });
  }

  // -------------------- Init --------------------
  function init() {
    applyLanguage(detectInitialLang());
    trackLanding("page_view");
    var dcta = document.getElementById("hero-discover-cta");
    if (dcta) dcta.addEventListener("click", function () { trackLanding("discover_cta"); });
    setupLanguageToggle();
    startCountdown();
    setupForm();
    setupCookies();
    setupScrollytelling();
    setupHiwWheelSnap();
    // (Mobile uses the same sticky scrollytelling as desktop — see setupScrollytelling.)
    setupTryThemPlayers();
    setupTryThemDots();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
