# Duck Store — Design Spec

Date: 2026-09-16
Source: Digital Harbor "Duck Store Coding Exercise" (v2, August 2026)

## 1. Purpose

Implement the Duck Store coding exercise: a warehouse module (CRUD + UI for
rubber ducks) and a store module (a single stateless order-pricing/packaging
REST endpoint). Grading emphasizes separation of concerns, thoughtful backend
design via design patterns, correct handling of the stated rules and their
implied edge cases, and readable/reusable code — not breadth of features.

## 2. Stack

- **Backend**: NestJS (TypeScript). Chosen because its module/provider/DI
  system maps directly onto "separation of concerns" and lets the packaging
  and pricing rules be implemented as injectable Strategy /
  Chain-of-Responsibility classes rather than procedural code.
- **Database**: MySQL, via TypeORM. TypeORM has first-class Nest integration
  and plain-SQL migration files, which keeps schema history transparent.
- **Frontend**: React (Vite), warehouse UI only — the store module is
  explicitly "no UI required" per the spec.
- **Testing**: Jest (backend), Vitest + React Testing Library (frontend).
- **Local dev environment**: Docker Compose running MySQL, so setup on a
  clean machine is `docker compose up` + install + migrate + run.

## 3. Repo layout

```
duck-store/
├── backend/
│   └── src/
│       ├── warehouse/   # duck CRUD module
│       ├── store/       # order-pricing module
│       └── shared/      # Duck entity/repository, used by both modules
├── frontend/            # React app (warehouse UI)
├── docker-compose.yml   # MySQL for local dev
└── README.md            # setup steps + documented ambiguity decisions
```

Single NestJS application with two feature modules sharing one MySQL
database, rather than two separately-deployed services. A multi-service
split was considered and rejected: it adds network calls, service discovery,
and cross-service data consistency concerns the exercise doesn't ask for, and
directly conflicts with the exercise's explicit "avoid scope beyond the ask"
and "avoid unnecessary complexity" guidance.

## 4. Data model

**`duck` table** (matches the spec's entity table exactly):

| column   | type    | notes                                   |
|----------|---------|------------------------------------------|
| id       | int PK  | auto-increment, stable identifier        |
| color    | enum    | Red, Green, Yellow, Black                |
| size     | enum    | XLarge, Large, Medium, Small, XSmall     |
| price    | decimal | unit price, USD                          |
| quantity | int     | units in stock                           |
| deleted  | boolean | logical-delete flag, default false       |

A unique index on `(color, size, price)` — global, not scoped to
`deleted` — backs the "no duplicate active duck" invariant at the database
level rather than relying purely on application logic. It is deliberately
*not* scoped to non-deleted rows: MySQL has no partial/filtered unique
index, and a global key is exactly what §5 below needs for the
undelete-and-merge behavior (one row can only ever exist per key, active or
deleted, so the same atomic upsert handles both cases).

## 5. Concurrency: the add-duck merge invariant

Requirement: adding a duck with the same (price, color, size) as an existing
active duck must add to that duck's quantity rather than create a duplicate,
and this must hold under concurrent requests.

**Decision**: use a single atomic upsert statement —

```sql
INSERT INTO duck (color, size, price, quantity, deleted)
VALUES (?, ?, ?, ?, false)
ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
```

This relies on MySQL's own atomicity for the upsert instead of a
read-modify-write cycle (which would race under concurrent requests) or
explicit application-level locking (`SELECT ... FOR UPDATE`), which is more
code and a larger transaction-timeout surface for no additional correctness.

**Edge case not covered by the spec, decided here**: if a *logically-deleted*
duck exists with the same (color, size, price), a new "add" for that same
combination will collide with the unique index. Decision: treat this as
un-delete-and-merge — restore the row (`deleted = false`) and add the new
quantity to whatever quantity remains on the old record — rather than
silently failing or permitting a second active row for the same key. This
keeps the same "merge, don't duplicate" spirit as the stated rule.

## 6. Warehouse module (CRUD + UI)

**API**:

```
GET    /ducks        list, non-deleted, sorted by quantity ascending
                       (documented ambiguity: the spec says "sort by
                       quantity" without direction; ascending surfaces
                       low-stock ducks first, which is more actionable for
                       a warehouse operator than descending)
POST   /ducks         add (invariant from §5 applies)
PATCH  /ducks/:id     edit — quantity and/or price only; 400 if color/size
                       is present in the body and differs from the stored
                       value
DELETE /ducks/:id     logical delete (deleted = true); requires no special
                       body, confirmation happens client-side
```

**Frontend**: `DuckTable` (Id, Color, Size, Price, Quantity, Actions, sorted
by quantity, matching the spec's layout) with Edit/Delete per row and an "Add
duck" control above it. A single `DuckForm` component is reused for both add
and edit — in edit mode, Color and Size render disabled/read-only, matching
the spec's "same form" instruction. A `ConfirmDialog` gates delete. Data
fetching and mutation live in a `useDucks` hook so `DuckTable`/`DuckForm`
stay presentation-only.

## 7. Store module (order pricing — backend only)

**API**:

```
POST /orders/quote
  body: { color, size, quantity, destinationCountry, shippingMode }
  200: { packageType, protectionTypes: string[], totalToPay, breakdown: [...] }
  404/422: no active duck matches the requested color+size
```

### 7a. Price resolution (documented ambiguity)

The order carries no price, and because the warehouse's uniqueness key is
`(color, size, price)`, more than one *active* duck can exist for the same
color+size at different prices. **Decision**: resolve to the **cheapest
active price** among matching, non-deleted `(color, size)` records. This is
deterministic, customer-favorable, and simple to justify. The store module
does **not** reserve or decrement warehouse stock — it is a stateless
pricing/packaging calculator (the spec describes it as "one REST endpoint,
no UI required" and never asks orders to affect inventory), so introducing
stock reservation/decrement logic would be scope beyond what's asked.

### 7b. Packaging — Strategy pattern

A `PackagingStrategy` interface with one implementation per package type:
`WoodPackaging`, `CardboardPackaging`, `PlasticPackaging`. A
`PackagingResolver` selects the strategy from the duck's size (rules 1–3 in
the spec); each strategy itself derives its protection filler(s) from
shipping mode (rules 4–7). This keeps each of the 7 packaging rules local to
the package type it belongs to, instead of one large conditional.

### 7c. Pricing — Chain of Responsibility

An ordered list of `PricingRule` objects, each taking and returning a running
`PriceBreakdown` (current total + list of applied line items):

1. `BulkDiscountRule` — >100 units → 20% off
2. `PackagingSurchargeRule` — wood +5%, plastic +10%, cardboard −1%
3. `DestinationSurchargeRule` — USA +18%, Bolivia +13%, India +19%, other +15%
4. `ShippingModeFeeRule` — sea +$400 flat; land +$10/unit; air +$30/unit,
   reduced 15% if order exceeds 1000 units

Rule order follows the numbered order in the spec, each applied to the
running total as specified. Each rule contributes its own labeled line item
to the breakdown, which directly produces the "itemized breakdown of every
discount and increment applied" the spec requires as output. Adding or
changing a pricing rule later means adding or editing one small class, not
touching a monolithic calculator.

## 8. Testing strategy

- **Merge invariant**: fire concurrent `POST /ducks` requests for the same
  (color, size, price) against a real (test) database; assert exactly one
  resulting row with correctly summed quantity.
- **Pricing**: each `PricingRule` unit-tested in isolation against the
  numbers in the spec (e.g. ">100 units → 20% off", "air + >1000 units →
  15% off the air fee"), plus one integration test reproducing a full
  worked example end-to-end to the cent.
- **Packaging**: each `PackagingStrategy`'s protection-filler selection is
  tested for all three shipping modes.
- **Warehouse rules**: edit rejects a changed color/size; delete is logical
  and excluded from subsequent listings; list is sorted by quantity.
- **Frontend**: `DuckForm` validation and read-only color/size in edit mode;
  table sort order; delete confirmation flow.

## 9. Tooling / setup

- `docker-compose.yml` brings up MySQL for local dev.
- TypeORM migrations checked into the repo; README setup is `docker compose
  up -d` → `npm install` (backend, frontend) → run migrations → `npm run
  start:dev` (backend) → `npm run dev` (frontend).
- README documents every ambiguous-requirement decision made in this spec
  (§5 undelete-on-re-add, §7a price resolution) inline, per the exercise's
  "decide deliberately... make a reasonable choice and write it down"
  instruction.

## 10. Explicitly out of scope

- A UI for the store/order module (spec says none required).
- Stock reservation/decrement on order placement (not asked for; would be
  scope creep on a stateless pricing endpoint).
- Multi-service/microservice split (rejected in §3).
- Authentication/authorization (not mentioned anywhere in the exercise).
