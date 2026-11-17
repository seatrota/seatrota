# SeatRota

SeatRota is team scheduling for Cal.diy: team booking pages, round-robin and collective scheduling, reminders, insights, and SSO. Self-hosting is free and complete. Hosted plans come later.

Works with Cal.diy.

## Status

Early. This tree is M0 scaffolding: the MIT Cal.diy snapshot recorded in [UPSTREAM.md](./UPSTREAM.md), the `packages/teams-*` packages, clean-room checks, and the patch queue under `patches/`. The features above are the product direction. They are not finished behavior yet.

## Development

You need Node.js 22, Yarn 4.12 (the `packageManager` in `package.json`), and Docker for Postgres.

```sh
cp .env.example .env
cp .env.appStore.example .env.appStore
```

Generate `NEXTAUTH_SECRET` with `openssl rand -base64 32` and `CALENDSO_ENCRYPTION_KEY` with `openssl rand -base64 24`. Put both in `.env`.

Postgres for local `yarn dev` is `packages/prisma/docker-compose.yml` (host port 5450, user `postgres`, trust auth). The root `docker-compose.yml` also includes Postgres.

```sh
docker compose -f packages/prisma/docker-compose.yml up -d
```

That compose file creates a database named `cal-saml`. `.env.example` points `DATABASE_URL` at a database named `calendso` on the same server. Create it once:

```sh
docker compose -f packages/prisma/docker-compose.yml exec -T postgres \
  psql -U postgres -d cal-saml -c "CREATE DATABASE calendso"
```

Then install, migrate, and start the web app:

```sh
yarn
yarn workspace @calcom/prisma db-deploy
yarn dev
```

The web app listens on http://localhost:3000.

### Build

`yarn build` needs an 8GB Node heap. `DATABASE_URL` must be empty or point at a running Postgres. A URL that does not connect makes the build fail: the Prisma package build runs migrations when `DATABASE_URL` is set. When `DATABASE_URL` is set, `DATABASE_DIRECT_URL` must be empty or point at that same running Postgres. `apps/web/next.config.ts` also throws unless `NEXTAUTH_SECRET`, `CALENDSO_ENCRYPTION_KEY`, and `NEXTAUTH_URL` are set. To build without a database:

```sh
NODE_OPTIONS=--max-old-space-size=8192 \
  DATABASE_URL= DATABASE_DIRECT_URL= \
  NEXTAUTH_URL=http://localhost:3000 \
  NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
  CALENDSO_ENCRYPTION_KEY="$(openssl rand -base64 24)" \
  yarn build
```

A boot smoke starts that compose Postgres, runs `yarn dev`, waits for HTTP 200, and stops. It is the `dev-boot-smoke` job in [`.github/workflows/seatrota.yml`](./.github/workflows/seatrota.yml), and it runs only on `workflow_dispatch`. A full install plus the Next.js dev server is too heavy for every pull request. GitHub-hosted runners provide Docker. Locally, the same steps are `bash scripts/dev-boot-smoke.sh`.

## Licence

Upstream files from the Cal.diy snapshot stay under the MIT license. Their copyright notices stay in those files. See [LICENSE](./LICENSE) and [UPSTREAM.md](./UPSTREAM.md). The snapshot source is https://github.com/calcom/cal.diy at `ae027bb70e694e2d2c44569f398d6cbcee0389b1`.

`packages/teams-*` is AGPL-3.0-only. See [LICENSE-AGPL](./LICENSE-AGPL). New TypeScript and JavaScript in those packages uses the header in [`.github/spdx-header-agpl.txt`](./.github/spdx-header-agpl.txt).

Works with Cal.diy.
