/* =================================================
   Schelp — Survey condiviso (landing + discover)
   Uso:  window.SchelpSurvey.open({
           context: "landing" | "discover",
           email:   "user@x" | null,          // landing: dall'iscrizione
           podcastId: 123 | null,             // discover: episodio ascoltato
           anonId: "..." | null,              // discover: id anonimo (dedup senza email)
           source: "landing" | "discover",
           lang:   "it" | "en",
           onDone: fn,  onClose: fn
         });
   Le stringhe "chrome" vengono da window.SchelpI18n (survey.*).
   Le domande arrivano da GET /public/survey/{context}.
   ================================================= */
(function () {
  "use strict";

  var SURVEY_API = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(location.hostname)
    ? "" : "https://api.apipodcast.org";
  var _st = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function loc(v) {
    var lang = _st ? _st.lang : "en";
    if (v && typeof v === "object") return v[lang] || v.en || v.it || Object.values(v)[0] || "";
    return v || "";
  }
  function T(key) {
    var lang = _st ? _st.lang : "en";
    var d = (window.SchelpI18n && window.SchelpI18n[lang]) || {};
    if (d[key] != null) return d[key];
    var en = (window.SchelpI18n && window.SchelpI18n.en) || {};
    return en[key] != null ? en[key] : key;
  }
  function track(e) { if (window.plausible) window.plausible(e); }
  function escHandler(e) { if (e.key === "Escape") close(false); }

  function open(opts) {
    if (document.getElementById("sv-overlay")) return;
    opts = opts || {};
    var ctx = opts.context || "landing";
    fetch(SURVEY_API + "/public/survey/" + encodeURIComponent(ctx), { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var survey = d && d.survey;
        if (!survey || !survey.questions || !survey.questions.length) return;
        _st = {
          survey: survey, i: 0, answers: {}, sending: false,
          email: opts.email || null,
          podcastId: (opts.podcastId != null ? opts.podcastId : null),
          anonId: opts.anonId || null,
          source: opts.source || ctx,
          lang: opts.lang || "en",
          onDone: opts.onDone || null,
          onClose: opts.onClose || null
        };
        buildShell();
        renderStep();
        requestAnimationFrame(function () { var o = document.getElementById("sv-overlay"); if (o) o.classList.add("is-open"); });
        track("Survey opened: " + ctx);
      })
      .catch(function (e) { console.warn("[schelp] survey non aperto:", e); });
  }

  function close(done) {
    var ov = document.getElementById("sv-overlay");
    if (!ov) return;
    document.removeEventListener("keydown", escHandler);
    ov.classList.remove("is-open");
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 340);
    var st = _st;
    if (!done) track("Survey skipped");
    _st = null;
    if (st && st.onClose) { try { st.onClose(!!done); } catch (e) {} }
  }

  function buildShell() {
    var root = document.getElementById("survey-root") || document.body;
    var ov = document.createElement("div");
    ov.id = "sv-overlay"; ov.className = "sv-overlay";
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true");
    ov.innerHTML =
      '<div class="sv-backdrop"></div>' +
      '<div class="sv-card">' +
        '<button class="sv-close" type="button" aria-label="' + esc(T("survey.done")) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
        '<div class="sv-head">' +
          '<span class="sv-eyebrow"><span class="spark"></span>' + esc(T("survey.eyebrow")) + '</span>' +
          '<div class="sv-track"><i id="sv-bar"></i></div>' +
          '<div class="sv-count" id="sv-count"></div>' +
        '</div>' +
        '<div class="sv-body" id="sv-body"></div>' +
        '<div class="sv-err" id="sv-err"></div>' +
        '<div class="sv-foot" id="sv-foot">' +
          '<button class="sv-skip" type="button" id="sv-skip">' + esc(T("survey.skip")) + '</button>' +
          '<div class="sv-nav">' +
            '<button class="sv-btn ghost" type="button" id="sv-back">' + esc(T("survey.back")) + '</button>' +
            '<button class="sv-btn primary" type="button" id="sv-next"></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    root.appendChild(ov);
    ov.querySelector(".sv-close").addEventListener("click", function () { close(false); });
    ov.querySelector(".sv-backdrop").addEventListener("click", function () { close(false); });
    document.getElementById("sv-skip").addEventListener("click", function () { close(false); });
    document.getElementById("sv-back").addEventListener("click", function () { if (_st && _st.i > 0) { _st.i--; renderStep(); } });
    document.getElementById("sv-next").addEventListener("click", onNext);
    document.addEventListener("keydown", escHandler);
  }

  function ans(qid) { return _st.answers[qid]; }
  function isAnswered(q) {
    var v = ans(q.id);
    if (q.type === "multi") return Array.isArray(v) && v.length > 0;
    if (q.type === "text" || q.type === "email") return !!(v && String(v).trim());
    return v != null && v !== "";
  }
  function updateNext(q) { document.getElementById("sv-next").disabled = q.required && !isAnswered(q); }
  function autoAdvance() {
    if (_st.i < _st.survey.questions.length - 1) {
      setTimeout(function () { if (_st && document.getElementById("sv-overlay")) { _st.i++; renderStep(); } }, 300);
    }
  }
  function onNext() {
    var q = _st.survey.questions[_st.i];
    if (q.required && !isAnswered(q)) return;
    if (_st.i < _st.survey.questions.length - 1) { _st.i++; renderStep(); return; }
    submit();
  }

  function renderStep() {
    var st = _st, q = st.survey.questions[st.i], total = st.survey.questions.length;
    document.getElementById("sv-bar").style.width = Math.round((st.i / total) * 100) + "%";
    document.getElementById("sv-count").textContent = T("survey.progress").replace("{n}", st.i + 1).replace("{total}", total);
    document.getElementById("sv-err").textContent = "";
    var metaBits = [];
    if (q.type === "multi") metaBits.push(esc(T("survey.multiHint")));
    if (!q.required) metaBits.push('<span class="opt">' + esc(T("survey.optional")) + '</span>');
    document.getElementById("sv-body").innerHTML =
      '<div class="sv-q"><div class="sv-q-label">' + esc(loc(q.label)) + '</div>' +
      '<div class="sv-q-meta">' + metaBits.join(" &middot; ") + '</div>' + renderInput(q) + '</div>';
    bindInput(q);
    document.getElementById("sv-back").style.visibility = st.i > 0 ? "visible" : "hidden";
    var isLast = st.i === total - 1;
    document.getElementById("sv-next").innerHTML = esc(isLast ? T("survey.submit") : T("survey.next")) +
      (isLast ? "" : ' <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>');
    updateNext(q);
  }

  function renderInput(q) {
    var val = ans(q.id);
    if (q.type === "scale") {
      var n = q.scale || 5, h = '<div class="sv-scale">';
      for (var i = 1; i <= n; i++) h += '<button type="button" data-v="' + i + '" style="--i:' + (i - 1) + '" class="' + (val === i ? "is-sel" : "") + '">' + i + '</button>';
      return h + '</div><div class="sv-scale-labels"><span>' + esc(T("survey.scaleLow")) + '</span><span>' + esc(T("survey.scaleHigh")) + '</span></div>';
    }
    if (q.type === "single" || q.type === "multi") {
      var multi = q.type === "multi", arr = multi ? (val || []) : val, out = '<div class="sv-opts">';
      (q.options || []).forEach(function (opt, idx) {
        var o = loc(opt), sel = multi ? (arr.indexOf(o) !== -1) : (val === o);
        out += '<button type="button" class="sv-opt ' + (multi ? "multi" : "") + ' ' + (sel ? "is-sel" : "") + '" data-o="' + esc(o) + '" style="--i:' + idx + '">' +
          '<span class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
          (multi ? '<path d="M20 6 9 17l-5-5"/>' : '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>') +
          '</svg></span><span>' + esc(o) + '</span></button>';
      });
      return out + '</div>';
    }
    if (q.type === "email") {
      return '<input type="email" class="sv-emailin" id="sv-input" placeholder="' + esc(T("survey.emailPlaceholder")) + '" value="' + esc(val || "") + '">';
    }
    return '<textarea class="sv-textarea" id="sv-input" placeholder="' + esc(T("survey.textPlaceholder")) + '">' + esc(val || "") + '</textarea>';
  }

  function bindInput(q) {
    var body = document.getElementById("sv-body");
    if (q.type === "scale") {
      body.querySelectorAll(".sv-scale button").forEach(function (b) {
        b.addEventListener("click", function () {
          _st.answers[q.id] = parseInt(b.dataset.v, 10);
          body.querySelectorAll(".sv-scale button").forEach(function (x) { x.classList.toggle("is-sel", x === b); });
          updateNext(q); autoAdvance();
        });
      });
    } else if (q.type === "single") {
      body.querySelectorAll(".sv-opt").forEach(function (b) {
        b.addEventListener("click", function () {
          _st.answers[q.id] = b.dataset.o;
          body.querySelectorAll(".sv-opt").forEach(function (x) { x.classList.toggle("is-sel", x === b); });
          updateNext(q); autoAdvance();
        });
      });
    } else if (q.type === "multi") {
      body.querySelectorAll(".sv-opt").forEach(function (b) {
        b.addEventListener("click", function () {
          var cur = _st.answers[q.id] || [], o = b.dataset.o, k = cur.indexOf(o);
          if (k === -1) cur.push(o); else cur.splice(k, 1);
          _st.answers[q.id] = cur;
          b.classList.toggle("is-sel", cur.indexOf(o) !== -1);
          updateNext(q);
        });
      });
    } else {
      var inp = document.getElementById("sv-input");
      if (inp) inp.addEventListener("input", function () { _st.answers[q.id] = inp.value; updateNext(q); });
    }
  }

  function collectedEmail() {
    if (_st.email) return _st.email;
    var eq = _st.survey.questions.filter(function (q) { return q.type === "email"; })[0];
    var v = eq && _st.answers[eq.id];
    return (v && String(v).trim()) ? String(v).trim() : null;
  }

  function submit() {
    var st = _st;
    if (st.sending) return;
    st.sending = true;
    var nextBtn = document.getElementById("sv-next");
    nextBtn.disabled = true; nextBtn.innerHTML = '<span class="spinner"></span>';
    document.getElementById("sv-bar").style.width = "100%";
    var email = collectedEmail();
    // se su Discover lasciano l'email -> iscrivili anche alla lista (idempotente)
    if (email && st.source === "discover") {
      try {
        fetch(SURVEY_API + "/public/signup", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ email: email, source: "discover", lang: st.lang })
        }).catch(function () {});
      } catch (e) {}
    }
    fetch(SURVEY_API + "/public/survey/response", {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        survey_key: st.survey.key, email: email || null,
        podcast_id: st.podcastId, anon_id: st.anonId,
        answers: st.answers, lang: st.lang, source: st.source
      })
    }).then(function (r) {
      if (!r.ok) throw new Error("bad status " + r.status);
      track("Survey completed: " + st.survey.context);
      if (st.onDone) { try { st.onDone(); } catch (e) {} }
      thanks();
    }).catch(function (err) {
      console.error("[schelp] survey submit failed", err);
      st.sending = false;
      document.getElementById("sv-err").textContent = T("survey.error");
      nextBtn.disabled = false; nextBtn.innerHTML = esc(T("survey.submit"));
    });
  }

  function thanks() {
    var card = document.querySelector("#sv-overlay .sv-card");
    card.querySelector(".sv-head").style.display = "none";
    document.getElementById("sv-err").textContent = "";
    document.getElementById("sv-foot").style.display = "none";
    document.getElementById("sv-body").innerHTML =
      '<div class="sv-thanks">' +
        '<div class="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>' +
        '<h3>' + esc(T("survey.thanksTitle")) + '</h3>' +
        '<p>' + esc(T("survey.thanksSub")) + '</p>' +
        '<button class="sv-btn primary" type="button" id="sv-doneb" style="margin:0 auto;">' + esc(T("survey.done")) + '</button>' +
      '</div>';
    document.getElementById("sv-doneb").addEventListener("click", function () { close(true); });
    setTimeout(function () { close(true); }, 4500);
  }

  window.SchelpSurvey = { open: open, close: close };
})();
