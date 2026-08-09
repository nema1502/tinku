# Tinku

Provably fair draws on Algorand, paid per request with [x402](https://algorand.co/agentic-commerce/x402).

Scholarships, event raffles, limited spots, audit sampling — these get decided behind
closed doors every day, and the people who lose have no way to check whether the process
was honest. Tinku makes the check possible: the entry list is sealed against a future
randomness beacon round, and anyone can rerun the selection afterwards from public data.

**Running a draw is paid. Reading and verifying a result is free, forever** — a proof
nobody can afford to check is not a proof.

---

## How the fairness works

A draw happens in two moves that cannot be swapped.

**1. Seal.** We hash the entry list, the winner count, a server nonce and a *future*
beacon round, and publish that hash immediately:

```
commit = sha256(JSON.stringify({participants, winners, nonce, targetRound}))
```

**2. Reveal.** Once that round exists, the [Algorand randomness
beacon](https://developer.algorand.org/articles/randomness-on-algorand/) — a VRF oracle
run by the Algorand Foundation — publishes its output for it. The winners fall out
deterministically:

```
winners = partial Fisher-Yates over sha256(commit || beacon), rejection sampled
```

Two things are therefore impossible. The organizer cannot change the entries after the
fact, because the commit pins them. And the organizer cannot steer the outcome, because
the randomness is a VRF value that did not exist when the commit was published.

Two details that matter more than they look:

- **Rejection sampling, not modulo.** A modulo would make earlier entries very slightly
  likelier to win. `pnpm test` asserts uniformity across 20,000 draws.
- **Repeated entries are allowed on purpose.** Listing someone twice gives them twice the
  chance, which is how "complete a lesson, earn a ticket" mechanics work.

### Why results are anchored on chain

The beacon only retains a round for 189 slots × 8 rounds ≈ **1,512 rounds, about seventy
minutes**. After that it stops answering, and a verification link that dies after seventy
minutes is worthless.

So at reveal time Tinku writes the result into the note field of a zero-amount
self-payment:

```
tinku/v1 {"id":…,"commit":…,"targetRound":…,"beacon":…,"resultHash":…}
```

That transaction is permanent, timestamped by the network, and readable from any indexer
for as long as Algorand exists. Cost is one minimum fee — 0.001 ALGO per draw.

---

## Architecture

```
src/
├── config.ts           validated at import; the process refuses to start on bad config
├── logger.ts           one JSON object per line, for CloudWatch
├── algorand/
│   ├── client.ts       algod client
│   ├── beacon.ts       reads the randomness beacon via read-only `simulate`
│   └── anchor.ts       writes the permanent on-chain record
├── domain/
│   ├── draw.ts         pure commit / derive / verify — no I/O, fully tested
│   └── draw.test.ts
├── service/draws.ts    orchestration: seal, reveal, anchor
├── store/              DrawRepository: Postgres in production, memory in dev
└── http/
    ├── payment.ts      x402 routes, Bazaar discovery, challenge tag
    └── app.ts          HTTP surface
```

The domain layer has no dependencies on the chain, the database or HTTP, which is what
makes the fairness claims testable in isolation.

---

## Endpoints

### For people

| Page | What it is |
| --- | --- |
| `/` | Run a draw — paste the list, get a price, seal it |
| `/d/:id` | The draw resolving live: a wheel for short lists, a name reel for long ones |
| `/e/:id` | **Event screen** — full bleed, built to project. `F` fullscreen, `R` replays |
| `/v/:id` | Public verification, free forever, recomputed on every view |

The event screen carries a QR that points at `/v/:id`, so a room can recheck the draw on
their own phones while the winners are still on the wall. The QR is rendered server-side
as inline SVG — conference wifi is exactly where a CDN dependency fails.

### For machines

| Endpoint | Price | What it does |
| --- | --- | --- |
| `POST /v1/draws?entries=N` | $0.01 + $0.002/entry | Seals an entry list and schedules the deciding round |
| `GET /v1/draws/:id` | free | The result, once that round exists |
| `GET /v1/draws/:id/verify` | free | Full record plus an independent recomputation |
| `GET /health` · `GET /ready` | free | Liveness and readiness |

```bash
curl -X POST 'https://your-domain/v1/draws?entries=3' \
  -H 'content-type: application/json' \
  -d '{"participants":["ana","beto","carla"],"winners":1,"label":"GDG workshop seat"}'
```

Without payment this returns `402 Payment Required` with the x402 requirements in the
`payment-required` header. `GET /` content-negotiates: browsers get the product, agents get
the JSON description.

The entry count is declared in the query string because the price is quoted before the body
is read. The handler refuses to seal more entries than were paid for; fewer is fine.

---

## Running locally

```bash
pnpm install
cp .env.example .env      # set PAY_TO at minimum
pnpm dev
```

With `PAY_TO` unset the config refuses to start. With `DATABASE_URL` unset it runs on
in-memory storage and warns — fine for development, never for production.

```bash
pnpm check                # typecheck + tests
docker compose up --build # service + Postgres, same path as production
```

---

## Deploying

The service runs two ways from the same code: as a serverless function (`api/index.ts`) or
as a long-lived container (`Dockerfile`). Storage initialises lazily, so neither needs a
boot phase.

### Vercel + Supabase — free tier

The cheapest path that still satisfies the competition rules: HTTPS, a stable domain, and
no sleeping instance during the October measurement window.

1. **Database.** Create a Supabase project and copy the **connection pooler** URI (port
   `6543`), not the direct one — serverless opens many short-lived connections.
2. **Import the repo** at [vercel.com/new](https://vercel.com/new). `vercel.json` already
   routes every path to the function; there is nothing to configure.
3. **Environment variables** in the Vercel project settings:

   | Variable | Value |
   | --- | --- |
   | `ALGORAND_NETWORK` | `testnet`, then `mainnet` |
   | `PAY_TO` | your receiving address, opted in to USDC |
   | `PUBLIC_BASE_URL` | `https://<project>.vercel.app` |
   | `DATABASE_URL` | Supabase pooler URI |
   | `DATABASE_SSL` | `true` |
   | `ANCHOR_ENABLED` | `true` |
   | `ANCHOR_MNEMONIC` | 25 words — mark as **sensitive** |
   | `NODE_ENV` | `production` |

4. **Verify** with `GET /ready`, then `POST /v1/draws` — it must answer `402`.

`PUBLIC_BASE_URL` is baked into every verification link handed to users, so it has to be
the real public URL from the first request onward.

### Containers — Railway, Fly.io, Render, ECS

```bash
docker build -t tinku .
docker run -p 8402:8402 --env-file .env tinku
```

| Setting | Value |
| --- | --- |
| Port | `8402` |
| Health check | `GET /health` |
| Readiness | `GET /ready` |
| Resources | 0.25 vCPU / 0.5 GB is plenty |

Avoid any free tier that sleeps on inactivity: the leaderboard is measured over an
unannounced window, and a cold instance that fails a request scores nothing.

### About the domain

A platform subdomain such as `tinku.vercel.app` satisfies "deployed to a domain and not
localhost" at no cost. A custom domain buys a cleaner merchant page in the Bazaar, which
enriches its catalog entry from your domain metadata.

**Decide before the first MainNet payment either way.** `payTo` cannot change for the
duration of the competition and a merchant account is expected to map to a single root
domain, so moving hosts mid-competition means starting the leaderboard history over.

---

## Going to MainNet

The competition checklist, in the order it has to happen:

- [x] Endpoint returns `402` without payment
- [x] Settlement goes through the GoPlausible facilitator
- [x] Bazaar discovery extension enabled per route
- [x] `x402-global-challenge` tag present in the route's `extra`
- [x] Full flow validated on TestNet
- [ ] `ALGORAND_NETWORK=mainnet` (switches USDC to ASA `31566704` and the beacon to app `1615566206`)
- [ ] `PAY_TO` is a MainNet account **opted in to USDC** — this address must not change for
      the rest of the competition, it is how the leaderboard attributes the entry
- [ ] Deployed to a public HTTPS domain
- [ ] One real MainNet payment settled end to end, USDC received
- [ ] Endpoint visible in the Bazaar and on the leaderboard with the challenge filter on

Every route shares one `payTo`, so the facilitator groups them into a single **Composite
entry** and their volume adds up instead of competing.

---

## Known limitations

Stated plainly, because the product is about not having to take anyone's word for it.

- **Reveal is single-instance safe only.** Concurrent reveals of the same draw are
  deduplicated within one process. Running more than one replica needs a row-level lock
  before the anchor write, otherwise the same draw can be anchored twice. The result is
  identical either way — the derivation is pure — but the fee is paid twice.
- **Anchoring is best-effort.** A chain hiccup logs an error and leaves `anchorTxId` null
  rather than failing the user's request. There is no retry queue yet.
- **The beacon reader needs a funded sender.** `simulate` applies balance checks even
  though nothing is submitted, so `BEACON_READER_ADDRESS` defaults to the beacon deployer.
- **Verification is JSON, not a page.** Non-technical participants need a human-readable
  verification screen; the API is the substrate for it, not the product.

## License

MIT
