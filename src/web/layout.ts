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

export interface PageOptions {
  title: string;
  body: string;
  script?: string;
}

/**
 * Wraps page content in the full document shell.
 *
 * @param options - Title, body markup and an optional inline script.
 * @returns A complete HTML document.
 */
export function page({ title, body, script }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Provably fair draws on Algorand. Anyone can verify the result without trusting the organizer.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='9' fill='%23e8703a'/></svg>">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <div class="mark"></div>
  <div class="brand">Tinku<span>provably fair draws</span></div>
</header>
${body}
<footer>
  Randomness comes from the Algorand randomness beacon. Every result is anchored on chain.
  &nbsp;·&nbsp; <a href="https://github.com/nema1502/tinku">Source</a>
</footer>
</div>
${script ? `<script>${script}</script>` : ""}
</body>
</html>`;
}
