/* =================================================
   Schelp — pagina Discover (vetrina della redazione)
   Replica lo stile della sezione "Scopri" dell'app:
   griglia di card → click → player a tutta scheda.

   I dati arrivano da un file STATICO same-origin
   (assets/podcasts/schelp/podcasts.json): niente CORS,
   niente auth, nessuna modifica al backend.
   Quel file si rigenera dai podcast reali di "schelp"
   con scripts/fetch_schelp_podcasts.py.
   ================================================= */
(function () {
  "use strict";

  var AUTHOR = "schelp";
  // Sorgente live: endpoint pubblico no-auth del backend (auto-aggiornante).
  // In locale (dev.py) usa path same-origin -> il dev-server proxya a produzione
  // (niente CORS -> stessi dati live di schelp.app). In produzione: URL assoluto.
  var API_BASE = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(location.hostname)
    ? "" : "https://api.apipodcast.org";
  // Fallback statico same-origin: episodi di esempio della redazione, mostrati
  // finché l'endpoint live non restituisce podcast pubblicati (o se irraggiungibile).
  var STATIC_URL = "assets/podcasts/schelp/podcasts.json";

  var MODE = "live"; // "live" | "static"
  var ALL = []; // dataset statico (solo quando MODE === "static")

  // ---------------- survey (feedback all'ascolto) ----------------
  // Tre trigger: dopo N secondi d'ascolto, a fine episodio, e col bottone
  // "Feedback" nel player. Ognuno apre al massimo una volta per episodio, e
  // mai se l'utente ha già risposto per quel podcast (memorizzato in locale).
  var SURVEY_CTX = "discover";
  var SURVEY_SECONDS = 40;               // trigger automatico dopo N secondi
  var ANON_KEY = "schelp_anon_v1";       // id anonimo stabile (no email)
  var SURVEY_DONE_KEY = "schelp_survey_done_v1"; // podcast_id già valutati
  function getAnonId() {
    try {
      var v = localStorage.getItem(ANON_KEY);
      if (v) return v;
      var id = (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : ("a" + Date.now().toString(36) + Math.random().toString(16).slice(2));
      localStorage.setItem(ANON_KEY, id);
      return id;
    } catch (e) { return null; }
  }
  function surveyDoneSet() {
    try { return new Set(JSON.parse(localStorage.getItem(SURVEY_DONE_KEY) || "[]")); }
    catch (e) { return new Set(); }
  }
  function isSurveyDone(pid) { return pid != null && surveyDoneSet().has(pid); }
  function markSurveyDone(pid) {
    if (pid == null) return;
    try {
      var s = surveyDoneSet(); s.add(pid);
      localStorage.setItem(SURVEY_DONE_KEY, JSON.stringify(Array.from(s)));
    } catch (e) {}
  }

  // ---------------- tracking ascolti (play/progress/complete) ----------------
  // Best-effort: keepalive fetch, non blocca né rompe la riproduzione.
  function trackDiscover(pid, type, extra) {
    if (pid == null) return;
    try {
      var body = { podcast_id: pid, event_type: type, anon_id: getAnonId(), lang: LANG, source: "discover" };
      if (extra) for (var k in extra) body[k] = extra[k];
      fetch(API_BASE + "/public/discover/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  // ---------------- i18n (mirror di landing.js) ----------------
  var DICT = window.SchelpI18n || { it: {}, en: {} };
  var LANG = "en"; // il sito è EN-first per ora (vedi landing.js)
  function t(key) {
    var d = DICT[LANG] || {};
    if (d[key] != null) return d[key];
    var fb = DICT.it || {};
    return fb[key] != null ? fb[key] : key;
  }
  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n-text]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n-text"));
      if (v != null) el.textContent = v;
    });
    root.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n-html"));
      if (v != null) el.innerHTML = v;
    });
    root.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      (el.getAttribute("data-i18n-attr") || "").split(";").forEach(function (pair) {
        var parts = pair.split(":");
        if (parts.length === 2) {
          var v = t(parts[1].trim());
          if (v != null) el.setAttribute(parts[0].trim(), v);
        }
      });
    });
  }

  // Tassonomia backend in italiano -> etichette inglesi (il sito è EN-first).
  // Se in futuro LANG === "it" si mostrano i valori originali.
  var INTEREST_EN = {
    "Notizie": "News", "Tecnologia": "Technology", "Sport": "Sport", "Cinema": "Cinema",
    "Economia": "Economy", "Scienza": "Science", "Salute": "Health", "Musica": "Music",
    "Viaggi": "Travel", "Arte": "Art", "Storia": "History", "Cucina": "Food", "Moda": "Fashion",
    "Gaming": "Gaming", "Ambiente": "Environment", "Fotografia": "Photography", "Politica": "Politics",
    "Filosofia": "Philosophy", "Psicologia": "Psychology", "Astronomia": "Astronomy",
    "Architettura": "Architecture", "Letteratura": "Literature", "Automobile": "Automotive",
    "Fitness": "Fitness", "Animali": "Animals", "Design": "Design", "Calcio": "Football",
    "Podcast": "Podcast", "Startup": "Startup", "Matematica": "Math", "Lingue": "Languages"
  };
  var PTYPE_EN = {
    "giornalistico": "News", "narrativo": "Narrative", "approfondimento": "Deep dive",
    "didattica": "Educational", "dibattito": "Debate", "generico": "General"
  };
  function interestEn(v) { if (LANG === "it") return v || ""; return INTEREST_EN[v] || v || ""; }
  function ptypeEn(v) { if (!v) return ""; if (LANG === "it") return v; return PTYPE_EN[(v + "").toLowerCase()] || v; }

  // ---------------- utils ----------------
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ---------------- DOM refs ----------------
  var grid, loadingEl, emptyEl, errorEl, pitchEl, countEl, searchInput, sideList, modal, mount;
  var rendered = {}; // id -> podcast (per deep-link/condivisione)
  var currentInterest = ""; // categoria attiva nella sidebar ("" = tutte)
  var CURRENT_ROWS = []; // ultime righe caricate (per categoria), pre-ricerca

  // ---------------- deep-link & condivisione ----------------
  function deepLinkId() {
    var m = location.pathname.match(/^\/discover\/(\d+)/);
    if (m) return m[1];
    var q = new URLSearchParams(location.search).get("p");
    return q && /^\d+$/.test(q) ? q : null;
  }
  function openById(id, push) {
    if (rendered[id]) { openPlayer(rendered[id], push); return; }
    apiGet("/public/podcast/" + id)
      .then(function (p) { if (p && p.id != null) openPlayer(p, push); })
      .catch(function () {});
  }
  function showToast(msg) {
    var el = document.createElement("div");
    el.textContent = msg;
    el.setAttribute("style", "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:rgba(20,20,25,0.96);color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;z-index:300;border:1px solid rgba(255,255,255,0.12);");
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }
  function sharePodcast(p) {
    if (!p || p.id == null) return;
    var url = location.origin + "/p/" + p.id;
    var title = p.title || "Schelp";
    if (navigator.share) { navigator.share({ title: title, url: url }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { showToast(t("discover.share.copied")); }).catch(function () { window.prompt("Link:", url); });
      return;
    }
    window.prompt("Link:", url);
  }

  function showState(which) {
    if (loadingEl) loadingEl.hidden = which !== "loading";
    if (emptyEl) emptyEl.hidden = which !== "empty";
    if (errorEl) errorEl.hidden = which !== "error";
    if (pitchEl) pitchEl.hidden = which !== "pitch";
    if (grid) grid.hidden = which !== "grid";
  }
  function updateCount(n) {
    if (!countEl) return;
    countEl.textContent = n ? (n + " " + t(n === 1 ? "discover.count.one" : "discover.count.many")) : "";
  }

  // ---------------- data ----------------
  function apiGet(path) {
    return fetch(API_BASE + path, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  function loadStaticData() {
    return fetch(STATIC_URL, { headers: { Accept: "application/json" }, cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) { ALL = Array.isArray(rows) ? rows : ((rows && rows.podcasts) || []); });
  }
  function useStatic() {
    MODE = "static";
    return loadStaticData().then(function () {
      loadFacetsStatic();
      loadList();
    }).catch(function () { showState("empty"); updateCount(0); });
  }

  // ---------------- filtri ----------------
  function loadFacetsLive() {
    return apiGet("/public/author/" + AUTHOR + "/facets").then(function (f) {
      buildCategories((f.interests || []).slice().sort());
    });
  }
  function loadFacetsStatic() {
    var ints = {};
    ALL.forEach(function (p) { if (p.interest) ints[p.interest] = 1; });
    buildCategories(Object.keys(ints).sort());
  }

  // ---------------- sidebar categorie ----------------
  function buildCategories(values) {
    if (!sideList) return;
    sideList.innerHTML = "";
    function mk(val, label) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "dsc-side-item" + (val === currentInterest ? " is-active" : "");
      b.textContent = label;
      b.addEventListener("click", function () {
        if (currentInterest === val) return;
        currentInterest = val;
        sideList.querySelectorAll(".dsc-side-item").forEach(function (x) { x.classList.remove("is-active"); });
        b.classList.add("is-active");
        loadList();
      });
      sideList.appendChild(b);
    }
    mk("", t("discover.filter.all"));
    (values || []).forEach(function (v) { mk(v, interestEn(v)); });
  }

  // ---------------- lista ----------------
  function matchesSearch(p, q) {
    if (!q) return true;
    var hay = [p.title, p.author, p.interest, interestEn(p.interest), ptypeEn(p.podcast_type)]
      .join(" ").toLowerCase();
    return hay.indexOf(q.toLowerCase()) !== -1;
  }
  // Ri-applica solo la ricerca alle righe già caricate (nessuna nuova fetch).
  function renderWithSearch() {
    var q = searchInput ? searchInput.value.trim() : "";
    render(CURRENT_ROWS.filter(function (p) { return matchesSearch(p, q); }));
  }
  function loadList() {
    if (MODE === "live") {
      var q = ["per_page=50"];
      if (currentInterest) q.push("interest=" + encodeURIComponent(currentInterest));
      showState("loading");
      return apiGet("/public/author/" + AUTHOR + "?" + q.join("&"))
        .then(function (d) { CURRENT_ROWS = (d && d.podcasts) || []; renderWithSearch(); })
        .catch(function () { showState("error"); updateCount(0); });
    }
    CURRENT_ROWS = ALL.filter(function (p) {
      return !currentInterest || p.interest === currentInterest;
    });
    renderWithSearch();
    return Promise.resolve();
  }

  function render(pods) {
    grid.innerHTML = "";
    rendered = {};
    if (!pods.length) {
      // Ricerca/filtri attivi e zero risultati → pitch "generalo tu con l'AI";
      // dataset davvero vuoto → messaggio "niente pubblicato".
      var q = searchInput ? searchInput.value.trim() : "";
      if ((q || currentInterest) && pitchEl) {
        var pp = document.getElementById("pitch-prompt");
        if (pp) {
          pp.textContent = q || t("mock.gen.placeholder");
          pp.classList.toggle("is-typed", !!q);
        }
        showState("pitch"); updateCount(0); return;
      }
      showState("empty"); updateCount(0); return;
    }
    showState("grid");
    updateCount(pods.length);
    pods.forEach(function (p, i) { if (p && p.id != null) rendered[p.id] = p; grid.appendChild(card(p, i)); });
  }

  function card(p, i) {
    var c = document.createElement("button");
    c.type = "button";
    c.className = "dsc-card";
    c.style.animationDelay = (i * 50) + "ms";

    var metaBits = [];
    if (p.interest) metaBits.push(escapeHtml(interestEn(p.interest)));
    if (p.duration_minutes) metaBits.push(p.duration_minutes + " min");

    c.innerHTML =
      '<div class="dsc-card-cover">' +
        '<div class="dsc-card-ph" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm7 9a7 7 0 0 1-6 6.92V21h-2v-2.08A7 7 0 0 1 5 12h2a5 5 0 0 0 10 0h2z"/></svg>' +
        '</div>' +
        '<span class="dsc-fab" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>' +
      '</div>' +
      '<div class="dsc-card-meta">' +
        '<span class="dsc-card-title">' + escapeHtml(p.title || "Podcast") + '</span>' +
        (metaBits.length ? '<span class="dsc-card-sub">' + metaBits.join(" · ") + '</span>' : '') +
        '<span class="dsc-card-author">@' + escapeHtml(p.author || AUTHOR) + '</span>' +
      '</div>';

    if (p.image_url) {
      var cover = c.querySelector(".dsc-card-cover");
      cover.style.backgroundImage = "url('" + p.image_url + "')";
      cover.classList.add("has-img");
    }
    c.addEventListener("click", function () { openPlayer(p); });
    return c;
  }

  // ---------------- player (markup .tplayer riusato da landing.css) ----------------
  function buildPlayerHTML(p) {
    var chip = ptypeEn(p.podcast_type) || interestEn(p.interest) || "Podcast";
    var dur = p.duration_minutes ? (p.duration_minutes * 60) : "";
    var peaks = p.waveform_peaks ? JSON.stringify(p.waveform_peaks) : "[]";
    return '' +
      '<article class="tplayer" data-mp3="' + escapeHtml(p.audio_url || "") + '" data-duration="' + dur + '" data-peaks="' + escapeHtml(peaks) + '">' +
        '<div class="tplayer-cover" aria-hidden="true"><div class="tplayer-cover-overlay"></div></div>' +
        '<div class="tplayer-topbar" aria-hidden="true">' +
          '<span class="tplayer-chip tplayer-chip-style">' + escapeHtml(chip) + '</span>' +
          '<span class="tplayer-chip tplayer-chip-speed">1x</span>' +
        '</div>' +
        '<div class="tplayer-glass"><div class="tplayer-glass-bg" aria-hidden="true"></div><div class="tplayer-glass-inner">' +
          '<div class="tplayer-inforow"><div class="tplayer-info">' +
            '<span class="tplayer-artist">Schelp</span>' +
            '<h3 class="tplayer-title">' + escapeHtml(p.title || "Podcast") + '</h3>' +
          '</div>' +
          '<button type="button" class="tplayer-share" aria-label="Share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg></button>' +
          '<span class="tplayer-vol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19 6a8 8 0 0 1 0 12"/></svg></span></div>' +
          '<div class="tplayer-wave" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="tplayer-bars"></div></div>' +
          '<div class="tplayer-time"><span class="tplayer-cur">0:00</span><span class="tplayer-dur">0:00</span></div>' +
          '<div class="tplayer-transport">' +
            '<button type="button" class="tplayer-skip" data-skip="-15" aria-label="Skip back 15 seconds"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zM9.5 12 20 4v16z"/></svg></button>' +
            '<button type="button" class="tplayer-rew" data-skip="-10" aria-label="Back 10 seconds"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L6 7l6 6V9a5 5 0 1 1-5 5H5a7 7 0 1 0 7-9z"/></svg><span class="tplayer-skip-num">10</span></button>' +
            '<button type="button" class="tplayer-play" aria-label="Play"><svg class="ic-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg><svg class="ic-pause" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg></button>' +
            '<button type="button" class="tplayer-rew" data-skip="10" aria-label="Forward 10 seconds"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l6 6-6 6V9a5 5 0 1 0 5 5h2a7 7 0 1 1-7-9z"/></svg><span class="tplayer-skip-num">10</span></button>' +
            '<button type="button" class="tplayer-skip" data-skip="15" aria-label="Skip forward 15 seconds"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM4 4l10.5 8L4 20z"/></svg></button>' +
          '</div>' +
          '<div class="tplayer-fbrow">' +
            '<button type="button" class="tplayer-fb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>' + escapeHtml(t("survey.fbButton")) + '</span></button>' +
          '</div>' +
        '</div></div>' +
      '</article>';
  }

  function buildBars(card, peaksAttr) {
    var bars = card.querySelector(".tplayer-bars");
    if (!bars) return;
    bars.innerHTML = "";
    var peaks = [];
    try { peaks = JSON.parse(peaksAttr || "[]"); } catch (e) {}
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
      var b = document.createElement("span"); b.className = "b";
      b.style.height = (Math.max(0.1, Math.min(1, h)) * 100) + "%";
      var bf = document.createElement("span"); bf.className = "bf";
      b.appendChild(bf); frag.appendChild(b);
    });
    bars.appendChild(frag);
  }
  function paintProgress(card, progress) {
    var bars = card.querySelectorAll(".tplayer-bars .b");
    var n = bars.length; if (!n) return;
    var seg = 1 / n;
    for (var i = 0; i < n; i++) {
      var p = (progress - i * seg) / seg;
      p = p < 0 ? 0 : p > 1 ? 1 : p;
      var fill = bars[i].querySelector(".bf");
      if (fill) fill.style.width = (p * 100) + "%";
    }
    var slider = card.querySelector(".tplayer-wave");
    if (slider) slider.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  }

  var active = null; // teardown del player aperto

  function openPlayer(p, push) {
    closePlayer(false);
    mount.innerHTML = buildPlayerHTML(p);
    var card = mount.querySelector(".tplayer");
    if (p.image_url) card.querySelector(".tplayer-cover").style.backgroundImage = "url('" + p.image_url + "')";
    buildBars(card, card.getAttribute("data-peaks"));
    var shareBtn = card.querySelector(".tplayer-share");
    if (shareBtn) shareBtn.addEventListener("click", function () { sharePodcast(p); });

    var preDur = parseFloat(card.getAttribute("data-duration"));
    if (isFinite(preDur) && preDur > 0) card.querySelector(".tplayer-dur").textContent = fmtTime(preDur);

    // --- survey feedback: bottone + trigger automatici ---
    var pid = (p && p.id != null) ? p.id : null;
    var fbBtn = card.querySelector(".tplayer-fb");
    var autoFired = false;
    if (fbBtn && isSurveyDone(pid)) fbBtn.classList.add("is-done");
    function openSurvey(auto) {
      if (!window.SchelpSurvey) return;
      if (isSurveyDone(pid)) { if (fbBtn) fbBtn.classList.add("is-done"); return; }
      if (auto) { if (autoFired) return; autoFired = true; }
      window.SchelpSurvey.open({
        context: SURVEY_CTX, podcastId: pid, anonId: getAnonId(),
        source: "discover", lang: LANG,
        onDone: function () { markSurveyDone(pid); if (fbBtn) fbBtn.classList.add("is-done"); }
      });
    }
    if (fbBtn) fbBtn.addEventListener("click", function () { openSurvey(false); });

    // --- tracking: play (una volta) + milestones 25/50/75 + complete ---
    var playSent = false, milestones = {};

    var audio = new Audio();
    audio.preload = "metadata";
    audio.src = p.audio_url || "";

    function setState(s) {
      card.classList.toggle("is-playing", s === "playing");
      card.classList.toggle("is-loading", s === "loading");
    }
    function toggle() {
      if (audio.paused) { setState("loading"); var pr = audio.play(); if (pr && pr.then) pr.catch(function () { setState("idle"); }); }
      else { audio.pause(); }
    }
    card.querySelector(".tplayer-play").addEventListener("click", toggle);
    card.querySelectorAll("[data-skip]").forEach(function (b) {
      b.addEventListener("click", function () {
        var d = parseFloat(b.getAttribute("data-skip")) || 0, dur = audio.duration || 0;
        if (!dur) return;
        audio.currentTime = Math.max(0, Math.min(dur - 0.1, audio.currentTime + d));
      });
    });
    var wave = card.querySelector(".tplayer-wave");
    if (wave) wave.addEventListener("click", function (e) {
      var r = wave.getBoundingClientRect();
      var ratio = r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
      if (audio.duration) { audio.currentTime = ratio * audio.duration; paintProgress(card, ratio); }
    });
    var speeds = [1, 1.25, 1.5, 2], si = 0;
    var speedChip = card.querySelector(".tplayer-chip-speed");
    if (speedChip) { speedChip.style.cursor = "pointer"; speedChip.addEventListener("click", function () {
      si = (si + 1) % speeds.length; audio.playbackRate = speeds[si]; speedChip.textContent = speeds[si] + "x";
    }); }

    audio.addEventListener("loadedmetadata", function () {
      if (isFinite(audio.duration)) card.querySelector(".tplayer-dur").textContent = fmtTime(audio.duration);
    });
    audio.addEventListener("timeupdate", function () {
      if (!audio.duration) return;
      paintProgress(card, audio.currentTime / audio.duration);
      card.querySelector(".tplayer-cur").textContent = fmtTime(audio.currentTime);
      if (!autoFired && audio.currentTime >= SURVEY_SECONDS) openSurvey(true);
      // milestones di ascolto 25/50/75
      var pct = (audio.currentTime / audio.duration) * 100;
      [25, 50, 75].forEach(function (m) {
        if (pct >= m && !milestones[m]) {
          milestones[m] = 1;
          trackDiscover(pid, "progress", { percent: m, position_seconds: audio.currentTime, duration_seconds: audio.duration });
        }
      });
    });
    audio.addEventListener("playing", function () {
      setState("playing");
      if (!playSent) { playSent = true; trackDiscover(pid, "play", { duration_seconds: audio.duration || preDur || null }); }
    });
    audio.addEventListener("pause", function () { setState("idle"); });
    audio.addEventListener("waiting", function () { setState("loading"); });
    audio.addEventListener("ended", function () {
      paintProgress(card, 1); setState("idle");
      trackDiscover(pid, "complete", { percent: 100, position_seconds: audio.duration, duration_seconds: audio.duration });
      openSurvey(true);
    });
    audio.addEventListener("error", function () { setState("idle"); });

    active = { teardown: function () { try { audio.pause(); } catch (e) {} audio.src = ""; } };

    modal.hidden = false;
    document.body.style.overflow = "hidden";
    if (push !== false && p && p.id != null) {
      var path = "/discover/" + p.id;
      if (location.pathname !== path) history.pushState({ pid: p.id }, "", path);
    }
    toggle(); // autoplay
  }

  function closePlayer(push) {
    if (active) { active.teardown(); active = null; }
    if (modal) modal.hidden = true;
    if (mount) mount.innerHTML = "";
    document.body.style.overflow = "";
    if (push !== false && /^\/discover\/\d+/.test(location.pathname)) {
      history.pushState({}, "", "/discover");
    }
  }

  // ---------------- invite form (mirror del form della landing) ----------------
  function setupInviteForm() {
    var form = document.getElementById("invite-form");
    if (!form) return;
    var input = document.getElementById("invite-email");
    var button = form.querySelector("button");
    var messageEl = document.getElementById("invite-message");
    var helpEl = document.getElementById("invite-help");
    var ENDPOINT = (window.SchelpConfig && window.SchelpConfig.formEndpoint) || "";

    function showMessage(key, type) {
      if (!messageEl) return;
      messageEl.textContent = t(key);
      messageEl.className = "dsc-invite-message is-visible is-" + type;
      if (helpEl) helpEl.style.display = type === "success" ? "none" : "";
    }
    function done(ok) {
      button.disabled = false;
      if (ok) { form.reset(); showMessage("discover.pitch.success", "success"); }
      else showMessage("discover.pitch.error", "error");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = (input.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showMessage("discover.pitch.invalid", "error");
        input.focus();
        return;
      }
      button.disabled = true;
      if (!ENDPOINT) { // preview mode: nessun ESP configurato, simula successo
        setTimeout(function () { done(true); }, 600);
        return;
      }
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email: email, source: "discover", _subject: "New Schelp signup" })
      }).then(function (r) { done(r.ok); }).catch(function () { done(false); });
    });
  }

  // ---------------- init ----------------
  function init() {
    applyI18n(document);
    grid = document.getElementById("discover-grid");
    loadingEl = document.getElementById("discover-loading");
    emptyEl = document.getElementById("discover-empty");
    errorEl = document.getElementById("discover-error");
    countEl = document.getElementById("dsc-count");
    pitchEl = document.getElementById("discover-pitch");
    searchInput = document.getElementById("filter-search");
    sideList = document.getElementById("dsc-side-list");
    modal = document.getElementById("player-modal");
    mount = document.getElementById("player-mount");

    setupInviteForm();
    if (searchInput) {
      var searchTimer = null;
      searchInput.addEventListener("input", function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderWithSearch, 150);
      });
    }
    buildCategories([]); // subito "All"; le categorie vere arrivano con i facets

    if (modal) {
      modal.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", function () { closePlayer(true); }); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closePlayer(true); });
    }

    // Back/forward del browser: apri o chiudi in base all'URL.
    window.addEventListener("popstate", function () {
      var id = deepLinkId();
      if (id) openById(id, false); else closePlayer(false);
    });

    showState("loading");
    // Prova la sorgente live; se non ci sono podcast pubblicati (o è irraggiungibile)
    // ricade sugli episodi di esempio statici così la vetrina non resta vuota.
    apiGet("/public/author/" + AUTHOR + "?per_page=50")
      .then(function (d) {
        var pods = (d && d.podcasts) || [];
        if (pods.length) {
          MODE = "live";
          CURRENT_ROWS = pods;
          renderWithSearch();
          loadFacetsLive().catch(function () {});
        } else {
          return useStatic();
        }
      })
      .catch(function () { return useStatic(); })
      .then(function () {
        // Deep-link: se l'URL punta a un episodio, aprilo (senza ri-pushare).
        var id = deepLinkId();
        if (id) openById(id, false);
      });
  }

  if (document.readyState !== "loading") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
