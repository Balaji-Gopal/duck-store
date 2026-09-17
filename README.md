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

Prerequisites: Docker, Node.js 20+.

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

```bash
# Backend unit + integration tests (needs docker compose up -d for the MySQL-backed ones)
cd backend
npm install          # skip if you already ran this in the setup step above
npm run test         # unit tests: packaging strategies, pricing rules
npm run test:e2e     # integration tests: warehouse CRUD, the concurrent merge invariant, order pricing

# Frontend
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

Response: `{ packageType, protectionTypes, totalToPay, breakdown }`.

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
