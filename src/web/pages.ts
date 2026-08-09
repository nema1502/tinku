/**
 * The human-facing surface.
 *
 * Three pages: one to run a draw, one to watch it resolve, and one that any
 * participant can open to check the result themselves. The third is the
 * important one — it is the artefact an organizer points at when someone
 * accuses them of rigging the outcome.
 */
import {
  BEACON_APP_ID,
  NETWORK_NAME,
  PRICE_DRAW_BASE,
  PRICE_PER_ENTRY,
  PUBLIC_BASE_URL,
  priceForEntries,
} from "../config.js";
import type { DrawRecord, VerificationReport } from "../domain/draw.js";
import { winnerEntries } from "../domain/draw.js";
import { esc, page } from "./layout.js";

const EXPLORER = `https://lora.algokit.io/${NETWORK_NAME}`;

/**
 * Builds a link to a transaction on the Algorand explorer.
 *
 * @param txId - Transaction id.
 * @returns The explorer URL.
 */
function txUrl(txId: string): string {
  return `${EXPLORER}/transaction/${txId}`;
}

/* ══════════════════════════════ landing ══════════════════════════════ */

/**
 * Renders the home page: what this is, and a form to run a draw.
 *
 * @returns The HTML document.
 */
export function landingPage(): string {
  const body = `
<h1>Draws nobody has to take your word for.</h1>
<p class="lede">
  Tinku seals your entry list against a future Algorand randomness beacon round, then
  derives the winners from a value that did not exist when you sealed. Participants
  verify the result themselves — no account, no wallet, nothing to trust.
</p>

<div class="card">
  <label for="participants">Entries — one per line. Repeat a name to give it more chances.</label>
  <textarea id="participants" placeholder="ana@example.com&#10;beto@example.com&#10;carla@example.com"></textarea>
  <div class="row">
    <div>
      <label for="winners">Winners</label>
      <input type="number" id="winners" value="1" min="1">
    </div>
    <div style="flex:2 1 260px">
      <label for="label">What is being drawn</label>
      <input type="text" id="label" placeholder="GDG Santa Cruz — workshop seats">
    </div>
  </div>
  <div class="row" style="align-items:center">
    <button id="run">Run the draw</button>
    <div class="muted" id="quote" style="flex:2 1 200px"></div>
  </div>
  <div id="out" style="margin-top:16px"></div>
</div>

<h2>How it stays honest</h2>
<ol class="steps">
  <li><b>Seal.</b> Your list, the winner count and a future beacon round are hashed together. The hash is published immediately, so the list can no longer change.</li>
  <li><b>Wait.</b> That round has not happened yet. Nobody — including us — can know what value it will carry.</li>
  <li><b>Reveal.</b> The Algorand randomness beacon publishes its VRF output for that round, and the winners fall out of it deterministically.</li>
  <li><b>Anchor.</b> The result is written into an Algorand transaction, so the proof outlives the beacon's ~70 minute memory.</li>
</ol>

<h2>Why not the usual tools</h2>
<div class="card tight scroll">
<table>
  <tr><th></th><th>Certificate</th><th>Cost</th><th>Wallet needed</th></tr>
  <tr><td>Gleam, Easypromos</td><td>A PDF you must trust the vendor for</td><td>$19–399 / month</td><td>No</td></tr>
  <tr><td>Blockchain raffle platforms</td><td>Real proof</td><td>Built for NFT and gambling</td><td>Yes, for everyone</td></tr>
  <tr><td><b>Tinku</b></td><td><b>Public proof, checkable by anyone</b></td><td><b>Cents, per draw</b></td><td><b>Only the organizer</b></td></tr>
</table>
</div>
<p class="muted">
  Pricing is $${PRICE_DRAW_BASE} plus $${PRICE_PER_ENTRY} per entry — ${priceForEntries(300)} for a 300-person
  draw, with nothing to cancel afterwards. US sweepstakes guidance asks for a timestamped,
  verifiable selection log; that is exactly what a draw here produces.
</p>
`;

  const script = `
const $ = id => document.getElementById(id);
const entries = () => $('participants').value.split('\\n').map(s => s.trim()).filter(Boolean);

function quote() {
  const n = entries().length;
  $('quote').textContent = n ? n + ' entries — ' + fmt(n) : '';
}
function fmt(n) {
  return '$' + (${PRICE_DRAW_BASE} + ${PRICE_PER_ENTRY} * n).toFixed(4).replace(/0+$/,'').replace(/\\.$/,'');
}
$('participants').addEventListener('input', quote);

$('run').addEventListener('click', async () => {
  const participants = entries();
  const winners = parseInt($('winners').value, 10);
  const out = $('out');

  if (participants.length < 2) return out.innerHTML = '<span class="pill bad">Add at least two entries</span>';
  if (!(winners >= 1 && winners <= participants.length)) {
    return out.innerHTML = '<span class="pill bad">Winner count must be between 1 and ' + participants.length + '</span>';
  }

  $('run').disabled = true;
  out.innerHTML = '<span class="pill">Sealing…</span>';

  try {
    const res = await fetch('/v1/draws?entries=' + participants.length, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ participants, winners, label: $('label').value || null }),
    });

    if (res.status === 402) {
      const header = res.headers.get('payment-required');
      let amount = fmt(participants.length), asset = 'USDC';
      try {
        const req = JSON.parse(atob(header)).accepts[0];
        amount = '$' + (Number(req.amount) / 1e6).toFixed(4).replace(/0+$/,'').replace(/\\.$/,'');
        asset = 'USDC (ASA ' + req.asset + ')';
      } catch {}
      out.innerHTML =
        '<span class="pill">Payment required</span>' +
        '<p class="muted" style="margin:10px 0 0">This draw costs <b>' + amount + '</b> in ' + asset +
        ' on Algorand ' + ${JSON.stringify(NETWORK_NAME)} + '. Pay it with any x402 client and the sealed draw is returned immediately. ' +
        'There is no subscription and no account.</p>';
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'request failed');
    location.href = '/d/' + data.id;
  } catch (err) {
    out.innerHTML = '<span class="pill bad">' + err.message + '</span>';
  } finally {
    $('run').disabled = false;
  }
});
`;

  return page({ title: "Tinku — provably fair draws on Algorand", body, script });
}

/* ══════════════════════════════ the draw ══════════════════════════════ */

/**
 * Renders a draw: the wheel while it resolves, the winners once it has.
 *
 * @param record - The draw record.
 * @param currentRound - The chain round at render time.
 * @returns The HTML document.
 */
export function drawPage(record: DrawRecord, currentRound: number): string {
  const names = record.participants;
  const wheel = names.length <= 16;
  const winners = winnerEntries(record);
  const remaining = Math.max(0, record.targetRound + 3 - currentRound);

  const body = `
<h1>${esc(record.label || "Draw")}</h1>
<p class="lede">${names.length} entries · ${record.winners} winner${record.winners > 1 ? "s" : ""}</p>

<div class="card" style="text-align:center">
  <div id="stage" style="min-height:280px;display:grid;place-items:center">
    <div class="muted">Loading…</div>
  </div>
  <div id="status" style="margin-top:8px"></div>
</div>

<div class="card">
  <dl class="kv">
    <dt>Commit</dt><dd>${esc(record.commit)}</dd>
    <dt>Deciding round</dt><dd>${record.targetRound}</dd>
    ${record.beacon ? `<dt>Beacon output</dt><dd>${esc(record.beacon)}</dd>` : ""}
    ${
      record.anchorTxId
        ? `<dt>On chain</dt><dd><a href="${txUrl(record.anchorTxId)}">${esc(record.anchorTxId)}</a></dd>`
        : ""
    }
  </dl>
  <div class="row">
    <a href="/v/${esc(record.id)}"><button class="ghost">Verify this draw</button></a>
  </div>
</div>
<p class="muted">Share the verification link with participants — it needs no account and never expires.</p>
`;

  const script = `
const NAMES = ${JSON.stringify(names)};
const WHEEL = ${wheel};
let winners = ${JSON.stringify(winners)};
let indexes = ${JSON.stringify(record.winnerIndexes)};
let remaining = ${remaining};

const stage = document.getElementById('stage');
const status = document.getElementById('status');

function wheelSvg(highlight) {
  const n = NAMES.length, r = 120, cx = 140, cy = 140;
  let out = '<svg viewBox="0 0 280 280" width="260" height="260" id="wheel" style="transition:transform 4.2s cubic-bezier(.15,.9,.2,1)">';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const hue = 18 + (i * 320 / n) % 320;
    const on = highlight != null && highlight.includes(i);
    out += '<path d="M' + cx + ' ' + cy + ' L' + x0 + ' ' + y0 + ' A' + r + ' ' + r + ' 0 ' + (2*Math.PI/n > Math.PI ? 1 : 0) + ' 1 ' + x1 + ' ' + y1 + ' Z" fill="hsl(' + hue + ' 62% ' + (on ? 58 : 46) + '%)" opacity="' + (highlight && !on ? .25 : 1) + '" stroke="rgba(0,0,0,.18)"/>';
    const am = (a0 + a1) / 2, tx = cx + r * .66 * Math.cos(am), ty = cy + r * .66 * Math.sin(am);
    const label = NAMES[i].length > 12 ? NAMES[i].slice(0, 11) + '…' : NAMES[i];
    out += '<text x="' + tx + '" y="' + ty + '" font-size="10" font-weight="600" fill="#fff" text-anchor="middle" dominant-baseline="middle" transform="rotate(' + (am * 180 / Math.PI) + ' ' + tx + ' ' + ty + ')">' + label.replace(/[<>&]/g, '') + '</text>';
  }
  out += '<circle cx="140" cy="140" r="20" fill="var(--surface)" stroke="var(--border)"/></svg>';
  return '<div style="position:relative;display:inline-block">' + out +
    '<div style="position:absolute;top:-4px;left:50%;transform:translateX(-50%);font-size:22px;line-height:1">▼</div></div>';
}

function reel(name) {
  return '<div style="font-size:30px;font-weight:700;letter-spacing:-.02em;min-height:44px">' +
    (name || '').replace(/[<>&]/g, '') + '</div>';
}

function showWinners() {
  const list = winners.map((w, i) =>
    '<div class="winner"><b>' + (i + 1) + '</b>' + w.replace(/[<>&]/g, '') + '</div>').join('');
  stage.innerHTML = (WHEEL ? wheelSvg(indexes) : '') +
    '<div class="winners" style="justify-content:center;margin-top:18px">' + list + '</div>';
  status.innerHTML = '<span class="pill ok">Revealed and verifiable</span>';
}

async function spinThenShow() {
  if (!WHEEL) {
    stage.innerHTML = reel('');
    const el = stage.firstChild;
    let t = 0;
    const iv = setInterval(() => {
      el.textContent = NAMES[Math.floor(Math.random() * NAMES.length)];
      if (++t > 28) { clearInterval(iv); showWinners(); }
    }, 70);
    return;
  }
  stage.innerHTML = wheelSvg(null);
  const svg = document.getElementById('wheel');
  const n = NAMES.length;
  const target = 360 * 5 + (360 - (indexes[0] + 0.5) * (360 / n));
  requestAnimationFrame(() => { svg.style.transform = 'rotate(' + target + 'deg)'; });
  setTimeout(showWinners, 4400);
}

async function poll() {
  status.innerHTML = '<span class="pill">Sealed — waiting for round ' + ${record.targetRound} + '</span>';
  stage.innerHTML = WHEEL ? wheelSvg(null) : reel('…');
  const iv = setInterval(async () => {
    const r = await fetch('/v1/draws/' + ${JSON.stringify(record.id)}).then(r => r.json());
    if (r.status === 'revealed') {
      clearInterval(iv);
      winners = r.winners; indexes = r.winnerIndexes;
      spinThenShow();
    } else if (typeof r.roundsRemaining === 'number') {
      status.innerHTML = '<span class="pill">' + (r.roundsRemaining || 1) + ' rounds to go</span>';
    }
  }, 3000);
}

if (winners) spinThenShow(); else poll();
`;

  return page({ title: `${record.label || "Draw"} — Tinku`, body, script });
}

/* ══════════════════════════ verification ══════════════════════════ */

/**
 * Renders the public verification page — the artefact a skeptic reads.
 *
 * @param record - The draw record.
 * @param report - The independent recomputation of that record.
 * @returns The HTML document.
 */
export function verifyPage(record: DrawRecord, report: VerificationReport): string {
  const winners = winnerEntries(record);
  const ok = report.entriesUnchanged && report.winnersMatchTheChain === true;
  const pending = record.beacon === null;

  const verdict = pending
    ? `<span class="pill">Sealed — not yet decided</span>`
    : ok
      ? `<span class="pill ok">✓ Verified</span>`
      : `<span class="pill bad">✕ Does not check out</span>`;

  const body = `
<h1>Verification</h1>
<p class="lede">${esc(record.label || "Draw")} · ${record.participants.length} entries · ${record.winners} winner${record.winners > 1 ? "s" : ""}</p>

<div class="card">
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    ${verdict}
    <span class="pill ${report.entriesUnchanged ? "ok" : "bad"}">
      ${report.entriesUnchanged ? "Entry list unchanged" : "Entry list was altered"}
    </span>
    ${
      pending
        ? ""
        : `<span class="pill ${report.winnersMatchTheChain ? "ok" : "bad"}">
             ${report.winnersMatchTheChain ? "Winners follow from the chain" : "Winners do not follow from the chain"}
           </span>`
    }
  </div>
  <p class="muted" style="margin:14px 0 0">
    These checks were recomputed from the raw record just now — the stored commit and the
    stored winners were both rebuilt from scratch rather than believed.
  </p>
</div>

${
  winners
    ? `<h2>Winners</h2>
       <div class="winners">${winners.map((w, i) => `<div class="winner"><b>${i + 1}</b>${esc(w)}</div>`).join("")}</div>`
    : ""
}

<h2>The record</h2>
<div class="card">
  <dl class="kv">
    <dt>Sealed at</dt><dd>${esc(record.createdAt)}</dd>
    <dt>Commit</dt><dd>${esc(record.commit)}</dd>
    <dt>Nonce</dt><dd>${esc(record.nonce)}</dd>
    <dt>Deciding round</dt><dd>${record.targetRound}</dd>
    <dt>Beacon output</dt><dd>${record.beacon ? esc(record.beacon) : "— not yet published"}</dd>
    <dt>Winning positions</dt><dd>${record.winnerIndexes ? `[${record.winnerIndexes.join(", ")}]` : "—"}</dd>
    <dt>Revealed at</dt><dd>${record.revealedAt ? esc(record.revealedAt) : "—"}</dd>
    <dt>On chain</dt><dd>${
      record.anchorTxId
        ? `<a href="${txUrl(record.anchorTxId)}">${esc(record.anchorTxId)}</a>`
        : "— not anchored"
    }</dd>
  </dl>
</div>

<h2>Check it yourself</h2>
<ol class="steps">
  <li>Recompute the commit from the entry list, winner count, nonce and round:
      <pre>sha256(JSON.stringify({participants, winners, nonce, targetRound}))</pre></li>
  <li>Read the beacon yourself. It is a public contract —
      <a href="${EXPLORER}/application/${BEACON_APP_ID}">application ${BEACON_APP_ID}</a>
      on Algorand ${NETWORK_NAME} — and the call is
      <code>must_get(${record.targetRound}, "")</code>.</li>
  <li>Derive the winners: a partial Fisher-Yates shuffle over
      <code>sha256(commit || beacon)</code>, using rejection sampling so no position is favoured.</li>
  <li>${
    record.anchorTxId
      ? `Compare against the <a href="${txUrl(record.anchorTxId)}">transaction written at reveal time</a> — it carries the same commit, round and result.`
      : `This draw has no on-chain anchor.`
  }</li>
</ol>
<p class="muted">
  The full record is available as JSON at
  <code>${esc(PUBLIC_BASE_URL)}/v1/draws/${esc(record.id)}/verify</code>, and the
  derivation is <a href="https://github.com/nema1502/tinku">open source</a>.
</p>

<h2>Entries</h2>
<div class="card tight scroll">
  <table>
    <tr><th style="width:70px">#</th><th>Entry</th><th style="width:90px">Result</th></tr>
    ${record.participants
      .map((p, i) => {
        const place = record.winnerIndexes?.indexOf(i) ?? -1;
        return `<tr>
          <td class="muted">${i}</td>
          <td>${esc(p)}</td>
          <td>${place >= 0 ? `<span class="pill ok">#${place + 1}</span>` : ""}</td>
        </tr>`;
      })
      .join("")}
  </table>
</div>
`;

  return page({ title: `Verification — ${record.label || "Draw"} — Tinku`, body });
}
