# Duck Store

Implementation of the Digital Harbor "Duck Store Coding Exercise" (v2, August 2026):
a warehouse CRUD module (NestJS + MySQL + React) and a stateless order-pricing/packaging
API (NestJS only, no UI, per the spec).

Full design rationale: [docs/superpowers/specs/2026-09-16-duck-store-design.md](docs/superpowers/specs/2026-09-16-duck-store-design.md).

## Stack

- Backend: NestJS + TypeORM + MySQL 8
- Frontend: React + Vite
- Tests: Jest + Supertest (backend), Vitest + React Testing Library (frontend)

## Setup (clean machine)

Prerequisites: Docker.

### Option A — just want to see it running

```bash
docker compose up --build
```

That's it — one command builds and starts MySQL, the backend, the frontend, and a database
admin UI together. Once it settles:

- Warehouse UI: **http://localhost:8080**
- Backend API: `http://localhost:4000` (mapped from the container's internal port 3000, the
  same way MySQL maps to host port 3307 — chosen to avoid colliding with the very
  commonly-used port 3000 on your machine)
- Database (browser, via [Adminer](https://www.adminer.org/)): **http://localhost:8082**

  Log in with:

  | Field    | Value          |
  |----------|----------------|
  | System   | MySQL          |
  | Server   | **`mysql`**    |
  | Username | `duck_store`   |
  | Password | `duck_store`   |
  | Database | `duck_store`   |

  > The **Server** field must be `mysql` (this project's docker-compose service name).
  > Browsers often autofill it to `db` from other Adminer tutorials/muscle memory — if
  > login fails with a "name resolution" / "getaddrinfo failed" error, that's why: clear
  > the field and type `mysql` explicitly.

### Option B — iterating on the code

Prerequisites: Docker, Node.js 22+ (`vitest`'s own `engines` field requires
`^22.12.0 || ^24.0.0 || >=26.0.0` — Node 20 is not supported for running the frontend tests).

```bash
# 1. Start MySQL only (also creates the duck_store_test schema used by integration tests)
docker compose up -d mysql

# 2. Backend
cd backend
npm install
npm run start:dev   # first run auto-creates .env from .env.example, then runs pending
                     # migrations on boot, then listens on :3000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev          # first run auto-creates .env from .env.example, then listens on
                      # :5173 by default, with hot reload
```

Open the frontend URL printed by Vite (`http://localhost:5173`). The backend API is at
`http://localhost:3000`.

(`.env` is gitignored and auto-created from `.env.example` the first time you run `start:dev`/
`dev`/`test:e2e` — no manual copy step needed. It's only ever recreated if missing, so any local
edits you make to it are never overwritten.)

> **Note:** the `mysql` service only runs the `duck_store_test` schema init script
> (`backend/docker/init-test-db.sql`) on a **fresh** Docker volume — Docker only executes
> scripts under `/docker-entrypoint-initdb.d/*` the first time a container's volume is
> created. If you're reusing an existing `duck-store-mysql-data` volume from a prior run, the
> `duck_store_test` schema may not exist yet. If integration tests fail with a "database
> duck_store_test does not exist"-style error, run `docker compose down -v` (drops the volume)
> and then `docker compose up -d` again to re-trigger the init script.

## Running tests

Neither `start:dev` (backend) nor `dev` (frontend) needs to be running for any of this —
the e2e tests boot their own in-process Nest app and talk to it directly (no real HTTP
server, no separately-running backend), and the frontend tests mock `fetch` entirely.
The **only** external dependency is MySQL (specifically its `duck_store_test` schema),
for the backend's `test:e2e` only.

```bash
# 0. Only needed once, only for backend e2e (unit tests need nothing external):
docker compose up -d mysql

# Backend
cd backend
npm install          # skip if you already ran this in the setup step above
npm run test         # unit tests: packaging strategies, pricing rules -- no DB needed
npm run test:e2e     # integration tests: warehouse CRUD, the concurrent merge invariant,
                      # order pricing -- needs the mysql container from step 0

# Frontend (independent of the backend and the database entirely)
cd frontend
npm install          # skip if you already ran this in the setup step above
npm run test
```

## API

### Warehouse

| Method | Path         | Body                                | Notes |
|--------|--------------|--------------------------------------|-------|
| GET    | `/ducks`     | —                                    | Non-deleted ducks, sorted by quantity ascending |
| POST   | `/ducks`     | `{ color, size, price, quantity }`  | Merges into an existing duck with the same color+size+price |
| PATCH  | `/ducks/:id` | `{ price?, quantity? }`             | Color/size are immutable |
| DELETE | `/ducks/:id` | —                                    | Logical delete |

### Store

| Method | Path            | Body                                                              |
|--------|-----------------|--------------------------------------------------------------------|
| POST   | `/orders/quote` | `{ color, size, quantity, destinationCountry, shippingMode }`     |

Response: `{ unitPrice, packageType, protectionTypes, totalToPay, breakdown }`. `breakdown`'s
first entry is always a `Base (qty x unitPrice)` line, so every entry's `amount` sums exactly
to `totalToPay` — the response is fully self-reconciling, not just a total with unexplained
deltas.

## Decisions made where the spec was ambiguous

- **List sort direction** — the spec says "sort by quantity" without a direction. Ascending, so
  low-stock ducks surface first, which is what a warehouse operator would act on.
- **Add-duck merge under concurrency** — implemented as a single atomic MySQL
  `INSERT ... ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`, backed by a
  unique `(color, size, price)` index, instead of a read-then-write cycle or application-level
  locking. Verified with a test that fires concurrent adds and asserts a single merged row.
- **Re-adding a previously deleted duck** — the same key collision un-deletes and merges
  quantity into the old row, rather than failing or creating a second row, to stay consistent
  with the "merge, don't duplicate" spirit of the stated rule.
- **Editing price into a collision** — since `price` is part of the uniqueness key, an edit that
  would collide with another *active* duck's color+size+price is rejected with `409 Conflict`
  rather than silently merged; the response tells the caller to use "add duck" instead, which
  already has well-defined merge semantics.
- **Order price resolution** — the order carries no price, and because the uniqueness key
  includes price, more than one active duck can match a given color+size. Resolved to the
  **cheapest** active match. The store endpoint does not reserve or decrement warehouse stock —
  it's a stateless pricing/packaging calculator per the spec ("no UI required"), and nothing in
  the spec asks an order to affect inventory.
- **Money math** — all pricing arithmetic uses `decimal.js` rather than native floating-point,
  so percentage discounts/surcharges and flat fees stay accurate to the cent regardless of
  application order.

## Design patterns

- **Strategy** (`backend/src/store/packaging/`) — one `PackagingStrategy` implementation per
  package type (wood/cardboard/plastic); a resolver picks one from duck size, and each strategy
  derives its own protection filler from shipping mode.
- **Chain of Responsibility** (`backend/src/store/pricing/`) — an ordered list of `PricingRule`
  objects, each contributing one labeled line item to a running `PriceBreakdown`. This is what
  produces the itemized discount/surcharge breakdown the spec requires as output.

## Security notes

What's covered:

- **SQL injection** — the only raw SQL is the parameterized atomic upsert in
  `WarehouseService.addDuck` (`?` placeholders with a bound args array, never string
  concatenation); everything else goes through TypeORM's query builder/repository API.
- **Input validation** — every DTO uses `class-validator` with a global `ValidationPipe({
  whitelist: true, transform: true })`, so unknown fields are stripped and every accepted field
  is type/range-checked (including an upper bound on `price` matching the `decimal(10,2)` column,
  and `@IsInt()` on quantities — added after a review pass found a value like `100000000` could
  reach a raw SQL insert unvalidated and surface as an unhandled 500).
- **Prototype-safe lookups** — `DestinationSurchargeRule`'s country → surcharge table is a `Map`,
  not a plain object literal. A plain-object version was vulnerable to
  `destinationCountry: "__proto__"` resolving to `Object.prototype` instead of `undefined`,
  crashing the pricing calculation with an unhandled exception from a single crafted request —
  found and fixed in review, with a regression test.
- **No secrets in source** — `.env` is gitignored; only dummy, documented, local-dev-only
  credentials (`duck_store`/`duck_store`, `root`/`root`) appear in `docker-compose.yml` and
  `.env.example`, matching this project's own Docker network.
- **Error responses never leak internals** — no stack trace, SQL text, or dependency version
  is ever returned in an HTTP response body; NestJS's default exception handling logs those
  server-side only.

Deliberately out of scope (the exercise doesn't call for these, and adding them would be scope
beyond the ask):

- **No authentication/authorization** — nothing in the spec describes user accounts or access
  control.
- **CORS is fully open** (`app.enableCors()` with no origin restriction) — reasonable for a
  local-dev exercise with no session/cookie-based trust model to protect; would need
  restricting to the actual frontend origin before any real deployment.
- **Known low-severity dependency advisories** — `npm audit` flags a few `multer`/`qs`
  advisories transitively pulled in by `@nestjs/platform-express`, for features this app
  doesn't use (multipart file uploads, complex query-string parsing — every endpoint here takes
  a JSON body or no query params at all). The available fix requires an `@nestjs/platform-express`
  major-version bump; deliberately not applied this close to submission to avoid an
  unnecessary, untested breaking change for advisories with no real reachable attack surface
  here.

## Known limitations / possible improvements

Written down deliberately rather than left implicit, per the exercise's own "decide
deliberately... make a reasonable choice and write it down" instruction:

- **`ON DUPLICATE KEY UPDATE ... VALUES(quantity)`** (the atomic merge upsert) uses a MySQL
  syntax deprecated since 8.0.20 in favor of a row-alias form. Still correct on `mysql:8.0`;
  worth migrating before a future MySQL major removes it.
- **No pagination on `GET /ducks`** — returns every non-deleted duck in one response. Fine at
  this exercise's scale; a real production warehouse listing would need `limit`/`cursor` params.
- **No request-level rate limiting** — not needed for an unauthenticated exercise API, but
  would matter before any public deployment.
- **Frontend mutation-error and load-error banners both use `role="alert"`** — cosmetic; a test
  querying by that role alone could see two simultaneously in the rare case both fire at once.
- **`DuckForm`'s Save button has no disabled-while-submitting state** — a user could
  theoretically fire overlapping submits by clicking twice after a failed save. Low-impact edge
  case, not fixed to avoid over-engineering a small form.
