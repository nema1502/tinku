/**
 * Page shell.
 *
 * Everything is inlined — no fonts, scripts or stylesheets from other hosts.
 * A verification page that depends on a CDN is a verification page that stops
 * working when the CDN does, and this one has to keep resolving for years.
 */

/**
 * Escapes text for safe interpolation into HTML.
 *
 * Participant names come from untrusted uploads and are rendered on a public
 * page, so this is load-bearing rather than decorative.
 *
 * @param value - Raw text.
 * @returns HTML-safe text.
 */
export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
:root {
  --bg: #fdfaf7;
  --surface: #ffffff;
  --surface-2: #f4eee8;
  --border: #e4d8cd;
  --text: #241c17;
  --muted: #7a6a5e;
  --accent: #c2521f;
  --accent-soft: #fbeadf;
  --gold: #b07d12;
  --ok: #2f7d52;
  --ok-soft: #e3f3e9;
  --bad: #b3261e;
  --shadow: 0 1px 2px rgba(36,28,23,.06), 0 8px 24px rgba(36,28,23,.06);
  --radius: 14px;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
:root:not([data-theme="light"]) {
  @media (prefers-color-scheme: dark) {
    --bg: #14100e;
    --surface: #1d1815;
    --surface-2: #262019;
    --border: #382f28;
    --text: #f3ece5;
    --muted: #a49385;
    --accent: #e8703a;
    --accent-soft: #35211a;
    --gold: #e2b14b;
    --ok: #5fbc86;
    --ok-soft: #17291f;
    --bad: #e5695f;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.35);
  }
}
:root[data-theme="dark"] {
  --bg: #14100e;
  --surface: #1d1815;
  --surface-2: #262019;
  --border: #382f28;
  --text: #f3ece5;
  --muted: #a49385;
  --accent: #e8703a;
  --accent-soft: #35211a;
  --gold: #e2b14b;
  --ok: #5fbc86;
  --ok-soft: #17291f;
  --bad: #e5695f;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.35);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 860px; margin: 0 auto; padding: 32px 20px 80px; }
a { color: var(--accent); }

header.top {
  display: flex; align-items: center; gap: 10px;
  padding-bottom: 28px;
}
.mark {
  width: 30px; height: 30px; border-radius: 9px; flex: none;
  background: linear-gradient(135deg, var(--accent), var(--gold));
}
.brand { font-weight: 650; letter-spacing: -.02em; font-size: 18px; }
.brand span { color: var(--muted); font-weight: 400; margin-left: 8px; font-size: 14px; }

h1 { font-size: clamp(28px, 5vw, 40px); line-height: 1.15; letter-spacing: -.03em; margin: 0 0 14px; }
h2 { font-size: 20px; letter-spacing: -.02em; margin: 36px 0 12px; }
.lede { font-size: 18px; color: var(--muted); margin: 0 0 28px; max-width: 60ch; }

.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 22px; box-shadow: var(--shadow);
  margin-bottom: 18px;
}
.card.tight { padding: 16px 18px; }

label { display: block; font-size: 13px; font-weight: 600; color: var(--muted); margin-bottom: 6px; }
textarea, input[type=text], input[type=number] {
  width: 100%; padding: 11px 13px; font: inherit; color: var(--text);
  background: var(--bg); border: 1px solid var(--border); border-radius: 10px;
}
textarea { min-height: 170px; resize: vertical; font-family: var(--mono); font-size: 14px; }
.row { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px; }
.row > div { flex: 1 1 160px; }

button {
  font: inherit; font-weight: 600; cursor: pointer;
  padding: 12px 20px; border-radius: 10px; border: 1px solid transparent;
  background: var(--accent); color: #fff;
}
button:hover { filter: brightness(1.07); }
button:disabled { opacity: .5; cursor: not-allowed; }
button.ghost { background: transparent; color: var(--text); border-color: var(--border); }

.pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 11px; border-radius: 999px; font-size: 12.5px; font-weight: 600;
  background: var(--surface-2); color: var(--muted); border: 1px solid var(--border);
}
.pill.ok { background: var(--ok-soft); color: var(--ok); border-color: transparent; }
.pill.bad { background: var(--accent-soft); color: var(--bad); border-color: transparent; }

.kv { display: grid; grid-template-columns: minmax(120px, auto) 1fr; gap: 8px 18px; font-size: 14px; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; font-family: var(--mono); font-size: 13px; word-break: break-all; }

.winners { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; }
.winner {
  display: flex; align-items: center; gap: 10px;
  background: var(--accent-soft); border-radius: 10px; padding: 10px 15px;
  font-weight: 600; font-size: 15px;
}
.winner b { color: var(--accent); font-variant-numeric: tabular-nums; }

.muted { color: var(--muted); font-size: 14px; }
code { font-family: var(--mono); font-size: 13px; background: var(--surface-2); padding: 2px 6px; border-radius: 6px; }
pre {
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px;
  padding: 14px; overflow-x: auto; font-family: var(--mono); font-size: 13px; margin: 0;
}
.steps { counter-reset: s; list-style: none; padding: 0; margin: 0; }
.steps li { counter-increment: s; position: relative; padding-left: 38px; margin-bottom: 16px; font-size: 14.5px; }
.steps li::before {
  content: counter(s); position: absolute; left: 0; top: 1px;
  width: 25px; height: 25px; border-radius: 50%; display: grid; place-items: center;
  background: var(--surface-2); color: var(--muted); font-size: 12.5px; font-weight: 700;
}
footer { margin-top: 56px; padding-top: 22px; border-top: 1px solid var(--border); font-size: 13.5px; color: var(--muted); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; font-size: 12.5px; text-transform: uppercase; letter-spacing: .04em; }
.scroll { overflow-x: auto; }
@media (max-width: 560px) { .kv { grid-template-columns: 1fr; gap: 2px 0; } .kv dd { margin-bottom: 10px; } }
`;

/**
 * Styles that only the projected event screen needs.
 *
 * It is pinned to the dark palette and sized in viewport units: this is meant
 * to be thrown on a wall in front of a room, where the browser's theme
 * preference is irrelevant and legibility from the back row is not.
 */
const EVENT_CSS = `
html, body { height: 100%; }
body.event {
  --bg: #100c0a; --surface: #1b1512; --border: #3a2f27;
  --text: #f7f1ea; --muted: #a08d7e; --accent: #ff7a3d; --gold: #f0bb52;
  background: radial-gradient(120% 90% at 50% 0%, #241a15 0%, var(--bg) 62%);
  color: var(--text);
  display: flex; flex-direction: column; overflow: hidden;
}
.ev-head { padding: 3.4vh 4vw 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
.ev-title { font-size: clamp(24px, 3.4vw, 52px); font-weight: 700; letter-spacing: -.03em; line-height: 1.1; margin: 0; }
.ev-sub { color: var(--muted); font-size: clamp(13px, 1.2vw, 19px); margin-top: .5vh; }
.ev-stage { flex: 1; display: grid; place-items: center; padding: 2vh 4vw; min-height: 0; }
.ev-foot { padding: 0 4vw 3.4vh; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; }
.ev-qr { display: flex; align-items: center; gap: 16px; }
.ev-qr svg { width: clamp(84px, 9vw, 132px); height: auto; border-radius: 8px; background: #fff; padding: 7px; display: block; }
.ev-qr-text { font-size: clamp(12px, 1.15vw, 17px); line-height: 1.45; }
.ev-qr-text b { display: block; font-size: clamp(14px, 1.35vw, 20px); }
.ev-qr-text span { color: var(--muted); }
.ev-meta { text-align: right; font-family: var(--mono); font-size: clamp(10px, .85vw, 13px); color: var(--muted); line-height: 1.7; }
.ev-status { font-size: clamp(15px, 1.6vw, 26px); color: var(--gold); font-weight: 600; }
.ev-winner {
  display: flex; align-items: center; gap: clamp(14px, 1.8vw, 28px);
  font-size: clamp(28px, 5.6vw, 86px); font-weight: 750; letter-spacing: -.035em; line-height: 1.12;
  animation: rise .55s cubic-bezier(.2,.9,.25,1) backwards;
}
.ev-winner i { font-style: normal; color: var(--accent); font-size: .5em; font-variant-numeric: tabular-nums; opacity: .85; }
@keyframes rise { from { opacity: 0; transform: translateY(26px) } to { opacity: 1; transform: none } }
.ev-reel { font-size: clamp(30px, 6vw, 92px); font-weight: 750; letter-spacing: -.035em; opacity: .55; }
@media (prefers-reduced-motion: reduce) { .ev-winner { animation: none } #wheel { transition: none !important } }
`;

export interface PageOptions {
  title: string;
  body: string;
  script?: string;
  /** Drops the header, footer and centred column — for the projected screen. */
  bare?: boolean;
  /** Class applied to `<body>`. */
  bodyClass?: string;
}

/**
 * Wraps page content in the document shell.
 *
 * @param options - Title, body markup, optional inline script and chrome flags.
 * @returns A complete HTML document.
 */
export function page({ title, body, script, bare, bodyClass }: PageOptions): string {
  const content = bare
    ? body
    : `<div class="wrap">
<header class="top">
  <div class="mark"></div>
  <div class="brand">Tinku<span>provably fair draws</span></div>
</header>
${body}
<footer>
  Randomness comes from the Algorand randomness beacon. Every result is anchored on chain.
  &nbsp;·&nbsp; <a href="https://github.com/nema1502/tinku">Source</a>
</footer>
</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Provably fair draws on Algorand. Anyone can verify the result without trusting the organizer.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='9' fill='%23e8703a'/></svg>">
<style>${CSS}${bare ? EVENT_CSS : ""}</style>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
${content}
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}
