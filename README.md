# Schelp Landing Page

Production-ready coming-soon page for **schelp.app**.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Main landing page |
| `landing.css` | All page styles (tokens come from `../../colors_and_type.css`) |
| `landing.js` | Form submission, countdown, cookie banner, analytics loader |
| `privacy.html` | GDPR privacy policy |
| `og.png` | 1200×630 social-share image |
| `og.html` | Editable source used to design `og.png` (kept for future tweaks) |

## What's already wired

- ✅ **SEO:** title, meta description, canonical, robots, OpenGraph, Twitter card, JSON-LD `SoftwareApplication` schema
- ✅ **Favicons:** uses `assets/logo-schelp.png` for both favicon and apple-touch-icon
- ✅ **Social preview:** `og.png` referenced via absolute URL (`https://schelp.app/og.png`) — see below
- ✅ **Accessibility:** skip link, focus-visible rings, semantic landmarks (`<header>` / `<main>` / `<footer>`), aria-labels on icon links, hidden form label, `aria-live` for form status, `prefers-reduced-motion` respected
- ✅ **Privacy:** dedicated policy page, cookie banner with Accept / Decline, no tracking by default
- ✅ **Email signup:** validation, loading state, success/error messages, analytics event on submit
- ✅ **Countdown:** ticks to `SchelpConfig.launchDate`, gracefully shows "We're live" state when zero
- ✅ **Responsive:** desktop / tablet / mobile breakpoints; phone mockup dropped on small mobile so the form stays above the fold

## Configuration

All deployment switches live in a single block at the top of `index.html`:

```html
<script>
  window.SchelpConfig = {
    formEndpoint: "",        // Drop your Formspree/Web3Forms/Loops endpoint here
    launchDate: "2026-07-15T09:00:00",
    analyticsDomain: "",     // e.g. "schelp.app" — empty = no analytics
    analyticsSrc: "https://plausible.io/js/script.js"
  };
</script>
```

### 1. Email collection

The form POSTs JSON `{ email, source: "landing" }` to `formEndpoint`. Compatible out-of-the-box with:

- **Formspree** (`https://formspree.io/f/XXXXXX`) — easiest, free tier 50 submissions/month
- **Web3Forms** (`https://api.web3forms.com/submit`) — free unlimited, needs access key in body
- **Loops** custom forms endpoint
- **Resend** webhook → your own ESP

If `formEndpoint` is empty, the form **simulates success** (handy for preview/staging).

### 2. Analytics

Loads **Plausible** if (a) `analyticsDomain` is set and (b) the user accepted the cookie banner. Want a different provider? Swap `analyticsSrc` and edit the `loadAnalytics()` function in `landing.js`. Nothing loads until consent.

### 3. Launch date

Change `launchDate` in the config. The countdown automatically swaps to a "we're live" callout at zero — no manual switch needed.

## Deployment

Drop the **entire `ui_kits/landing/` folder** at the root of your static host:

```
schelp.app/
├── index.html
├── landing.css
├── landing.js
├── privacy.html
├── og.png
└── (also: copy colors_and_type.css and assets/logo-schelp.png to the same root,
         then adjust the relative paths in index.html / privacy.html accordingly)
```

**Or** — recommended — inline everything into a single `dist/` folder via a build step (Vite/Astro/Eleventy). The `super_inline_html` tool in this project also bundles everything into one file if you need a true single-file drop.

### Recommended hosts
- **Vercel** — drag-and-drop the folder, done.
- **Netlify** — same.
- **Cloudflare Pages** — same, with the bonus of free unlimited bandwidth.
- **GitHub Pages** — works, slower.

### Custom domain checklist
- Update **canonical URL** in `index.html` (`<link rel="canonical">`) — currently `https://schelp.app/`
- Update **OG / Twitter image URLs** — currently `https://schelp.app/og.png`
- Update **OG / canonical site URL** in og:url meta
- Test the social preview with [opengraph.xyz](https://www.opengraph.xyz/) or Slack/iMessage's own preview

## Outstanding items (when you're ready)

These are real production niceties, not blockers — most landings ship without them:

- [ ] **Self-host fonts** — currently uses Google Fonts via `@import` in `colors_and_type.css`. For full GDPR compliance, download Plus Jakarta Sans + Inter, host on your domain, replace the `@import`.
- [ ] **Italian version** — set up `/it/` route or query param. Copy & strings are easy; the only Italian text in the screenshot mockup is intentional Italian product UI.
- [ ] **Sitemap + robots.txt** — generate when more pages are added.
- [ ] **A/B variants of the headline** — Vercel/Netlify have built-in split testing.

## Local preview

Open `index.html` directly in a browser, or serve with any static server:

```sh
npx serve ui_kits/landing
```

In the previewer / dev mode, the form is configured with no endpoint, so submissions show success without actually sending anything. Set `SchelpConfig.formEndpoint` to test real submission.
