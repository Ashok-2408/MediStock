# Smart Medicine Inventory

A secure inventory dashboard for managing medicines, monitoring expiry and stock levels, dispensing items, and reviewing activity.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — API contract and generated client source of truth
- `lib/db/src/schema/inventory.ts` — persistent inventory and activity tables
- `artifacts/api-server/src/routes/inventory.ts` — inventory, dashboard, checkout, reports, and feedback API
- `artifacts/smart-medicine-inventory/` — React web app

## Architecture decisions

- Clerk handles sign-in, sign-up, and password recovery; server routes enforce administrator permissions.
- The first authenticated application account is granted administrator access atomically; later accounts receive staff access.
- Inventory values are computed from current database rows so dashboard totals and warning counts stay current.

## Product

Medicine CRUD, low-stock/expiry alerts, confirmed cart checkout, activity and stock reports, feedback, and FAQs.

## User preferences

- Keep the dashboard creative, polished, responsive, and easy to scan for a college demonstration.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
