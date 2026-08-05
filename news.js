/* =================================================
   Schelp — pagina News (elenco + articolo)
   Contenuti da /public/news e /public/news/{slug}.
   Stessa impostazione di discover.js: EN-first, i18n da window.SchelpI18n.
   ================================================= */
(function () {
  "use strict";

  var API_BASE = /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(location.hostname)
    ? "" : "https://api.apipodcast.org";

  var DICT = window.SchelpI18n || { it: {}, en: {} };
  var LANG = "en";
  function t(key) {
    var d = DICT[LANG] || {};
    if (d[key] != null) return d[key];
    var fb = DICT.en || {};
    return fb[key] != null ? fb[key] : key;
  }
  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll("[data-i18n-text]").forEach(function (el) {
      var v = t(el.getAttribute("data-i18n-text")); if (v != null) el.textContent = v;
    });
    root.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      (el.getAttribute("data-i18n-attr") || "").split(";").forEach(function (pair) {
        var p = pair.split(":"); if (p.length === 2) { var v = t(p[1].trim()); if (v != null) el.setAttribute(p[0].trim(), v); }
      });
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(s) {
    if (!s) return "";
    try {
      return new Date(s).toLocaleDateString(LANG === "it" ? "it-IT" : "en-US",
        { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return ""; }
  }
  function apiGet(path) {
    return fetch(API_BASE + path, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }

  var listEl, articleEl, grid, loadingEl, emptyEl, errorEl;

  function showListState(which) {
    if (loadingEl) loadingEl.hidden = which !== "loading";
    if (emptyEl) emptyEl.hidden = which !== "empty";
    if (errorEl) errorEl.hidden = which !== "error";
    if (grid) grid.hidden = which !== "grid";
  }

  function slugFromUrl() {
    var m = location.pathname.match(/^\/news\/(.+)$/);
    return m ? decodeURIComponent(m[1].replace(/\/$/, "")) : null;
  }

  // ---------------- elenco ----------------
  function loadList() {
    listEl.hidden = false;
    articleEl.hidden = true;
    showListState("loading");
    apiGet("/public/news?per_page=50")
      .then(function (d) {
        var posts = (d && d.posts) || [];
        if (!posts.length) { showListState("empty"); return; }
        grid.innerHTML = "";
        posts.forEach(function (p, i) { grid.appendChild(card(p, i)); });
        showListState("grid");
      })
      .catch(function () { showListState("error"); });
  }

  function card(p, i) {
    var a = document.createElement("a");
    a.className = "news-card";
    a.href = "/news/" + encodeURIComponent(p.slug);
    a.style.animationDelay = (i * 60) + "ms";
    a.innerHTML =
      '<div class="news-card-cover' + (p.cover_url ? ' has-img' : '') + '"' +
        (p.cover_url ? ' style="background-image:url(\'' + p.cover_url + '\')"' : '') + '>' +
        (p.cover_url ? '' : '<span aria-hidden="true">📰</span>') +
      '</div>' +
      '<div class="news-card-body">' +
        (p.published_at ? '<span class="news-card-date">' + esc(fmtDate(p.published_at)) + '</span>' : '') +
        '<h2 class="news-card-title">' + esc(p.title || "") + '</h2>' +
        (p.excerpt ? '<p class="news-card-sub">' + esc(p.excerpt) + '</p>' : '') +
      '</div>';
    a.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // apri in nuova scheda
      e.preventDefault();
      history.pushState({ slug: p.slug }, "", "/news/" + encodeURIComponent(p.slug));
      openArticle(p.slug);
    });
    return a;
  }

  // ---------------- articolo ----------------
  function openArticle(slug) {
    listEl.hidden = true;
    articleEl.hidden = false;
    articleEl.innerHTML = '<div class="news-state"><div class="news-spinner" aria-hidden="true"></div></div>';
    window.scrollTo(0, 0);
    apiGet("/public/news/" + encodeURIComponent(slug))
      .then(function (p) {
        var atts = "";
        if (p.attachments && p.attachments.length) {
          atts = '<div class="news-attach"><h3>' + esc(t("news.attachments")) + '</h3><ul>' +
            p.attachments.map(function (a) {
              var kb = a.size ? ' <span>(' + Math.round(a.size / 1024) + ' KB)</span>' : '';
              return '<li><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a>' + kb + '</li>';
            }).join("") + '</ul></div>';
        }
        articleEl.innerHTML =
          '<a class="news-back" href="/news">← ' + esc(t("news.back")) + '</a>' +
          (p.cover_url ? '<div class="news-hero" style="background-image:url(\'' + p.cover_url + '\')"></div>' : '') +
          (p.published_at ? '<span class="news-article-date">' + esc(fmtDate(p.published_at)) + '</span>' : '') +
          '<h1 class="news-article-title">' + esc(p.title || "") + '</h1>' +
          '<div class="news-prose">' + (p.body_html || "") + '</div>' +
          atts;
        var back = articleEl.querySelector(".news-back");
        if (back) back.addEventListener("click", function (e) {
          e.preventDefault(); history.pushState({}, "", "/news"); loadList();
        });
      })
      .catch(function () {
        articleEl.innerHTML =
          '<a class="news-back" href="/news">← ' + esc(t("news.back")) + '</a>' +
          '<div class="news-state"><div class="news-state-icon">⚠️</div><p class="news-state-title">' +
          esc(t("news.error.title")) + '</p></div>';
        var back = articleEl.querySelector(".news-back");
        if (back) back.addEventListener("click", function (e) { e.preventDefault(); history.pushState({}, "", "/news"); loadList(); });
      });
  }

  function route() {
    var slug = slugFromUrl();
    if (slug) openArticle(slug); else loadList();
  }

  function init() {
    applyI18n(document);
    var y = document.getElementById("year"); if (y) y.textContent = new Date().getFullYear();
    listEl = document.getElementById("news-list");
    articleEl = document.getElementById("news-article");
    grid = document.getElementById("news-grid");
    loadingEl = document.getElementById("news-loading");
    emptyEl = document.getElementById("news-empty");
    errorEl = document.getElementById("news-error");
    window.addEventListener("popstate", route);
    route();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
