/* =================================================
   Schelp — gestione consenso cookie/tracciamento (condiviso)
   Incluso PRIMA di landing.js / discover.js su tutte le pagine.

   Modello a due livelli (GDPR + Linee guida Garante 2021):
   - Livello 1 (sempre, esente): metriche anonime aggregate con ID effimero
     per-caricamento (gestito nei singoli tracker, non qui).
   - Livello 2 (solo dopo "Accept"): identificatori persistenti (schelp_sid,
     schelp_anon, UTM first-touch) per funnel/unique — abilitati da SchelpConsent.has().

   Espone window.SchelpConsent: status()/has()/onChange(cb)/accept()/decline().
   Gestisce il banner: usa #cookie-banner se presente (index.html), altrimenti
   lo inietta (discover.html, privacy.html) con stili self-contained.
   ================================================= */
(function () {
  "use strict";
  var KEY = "schelp_consent_v1";
  var subs = [];

  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function status() { var v = read(); return v === "accepted" ? "accepted" : (v === "declined" ? "declined" : "unset"); }
  function has() { return status() === "accepted"; }
  function notify() { var s = status(); subs.forEach(function (cb) { try { cb(s); } catch (e) {} }); }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} notify(); }
  function onChange(cb) { if (typeof cb === "function") subs.push(cb); }

  function injectBanner() {
    var st = document.createElement("style");
    st.textContent =
      "#schelp-cookie{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:640px;margin:0 auto;" +
      "background:#141417;color:#f4f4f5;border:1px solid rgba(255,255,255,.12);border-radius:16px;" +
      "padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:'Inter',system-ui,sans-serif;" +
      "transform:translateY(140%);opacity:0;transition:transform .4s ease,opacity .4s ease;}" +
      "#schelp-cookie.is-visible{transform:none;opacity:1;}" +
      "#schelp-cookie strong{display:block;font-size:15px;margin-bottom:6px;}" +
      "#schelp-cookie p{margin:0 0 14px;font-size:13px;line-height:1.5;color:rgba(255,255,255,.7);}" +
      "#schelp-cookie a{color:#FF6B6B;}" +
      "#schelp-cookie .row{display:flex;gap:10px;justify-content:flex-end;}" +
      "#schelp-cookie button{cursor:pointer;border-radius:10px;font-size:13px;font-weight:600;padding:9px 18px;border:1px solid rgba(255,255,255,.18);}" +
      "#schelp-cookie .btn-decline{background:transparent;color:#f4f4f5;}" +
      "#schelp-cookie .btn-accept{background:linear-gradient(135deg,#FF8E8E,#FF6B6B 60%,#F25060);color:#fff;border:0;}";
    document.head.appendChild(st);
    var b = document.createElement("aside");
    b.id = "schelp-cookie";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", "Cookie consent");
    b.innerHTML =
      "<strong>A small ask before we measure.</strong>" +
      "<p>We use privacy-friendly, first-party analytics. Anonymous, aggregate stats run for everyone; " +
      "detailed analytics tied to a random id only if you accept. See our <a href=\"privacy.html\">privacy &amp; cookie policy</a>.</p>" +
      "<div class=\"row\"><button type=\"button\" class=\"btn-decline\">Decline</button>" +
      "<button type=\"button\" class=\"btn-accept\">Accept</button></div>";
    document.body.appendChild(b);
    return b;
  }

  function initBanner() {
    var b = document.getElementById("cookie-banner") || injectBanner();
    var accept = b.querySelector(".btn-accept");
    var decline = b.querySelector(".btn-decline");
    if (accept) accept.addEventListener("click", function () { set("accepted"); b.classList.remove("is-visible"); });
    if (decline) decline.addEventListener("click", function () { set("declined"); b.classList.remove("is-visible"); });
    if (status() === "unset") {
      setTimeout(function () { b.classList.add("is-visible"); }, 800);
    }
  }

  if (document.body) initBanner();
  else document.addEventListener("DOMContentLoaded", initBanner);

  window.SchelpConsent = {
    status: status,
    has: has,
    onChange: onChange,
    accept: function () { set("accepted"); },
    decline: function () { set("declined"); }
  };
})();
