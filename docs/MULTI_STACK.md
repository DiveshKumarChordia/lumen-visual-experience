# Running multiple stacks at once

One repo, many Contentstack stacks, all deployed simultaneously. Configuration
lives in **GitHub Environments** — nothing stack-specific is committed.

```
                    ┌── GitHub Environment: dev15 ──┐
                    │  vars:    CS_INSTANCE=dev15    │
                    │           CS_STACK_API_KEY=…   │
                    │           VERCEL_PROJECT_ID=…  │
git push  ─────────▶│  secrets: CS_PREVIEW_TOKEN=…   │──▶ Vercel project A ──▶ site A
   │                └────────────────────────────────┘
   │                ┌── GitHub Environment: dev22 ──┐
   └───────────────▶│  vars:    CS_INSTANCE=dev22    │──▶ Vercel project B ──▶ site B
                    │           …                    │
                    └────────────────────────────────┘
```

Matrix jobs run in parallel, and each targets its **own Vercel project**, so the
deployments never overwrite one another.

## Why GitHub Environments rather than branches

Branch-per-stack means merge management forever. Environments keep one `main`
and vary only configuration — which is the only thing that actually differs
between stacks.

They also give you per-environment protection rules and required reviewers, which
matters once one of these points at something real.

## One env file per stack

Every script takes `--env <file>`, so a stack is just a file:

```bash
npm run bootstrap    -- --env .env.secondproject
npm run site:url     -- --env .env.secondproject https://other.vercel.app
npm run seed:timeline -- --env .env.secondproject
npm run gh:env       -- rbac-demo --env .env.secondproject
```

`--env` is loaded in-process rather than via node's `--env-file`, because that
flag has to precede the script path and so cannot be forwarded through
`npm run … --`. Values already in the real environment always win, so CI is
unaffected.

**Derived tokens are per stack.** A run writes two files:

| File | Purpose |
|---|---|
| `.env.local` | what Vite reads — the *active* stack for `npm run dev` |
| `.env.<name>.local` | durable record for that stack |

The sidecar matters: without it, bootstrapping a second stack overwrites the
first stack's tokens and `gh:env` would then publish the wrong values. `gh:env`
reads the sidecar matching the `--env` file you pass.

## Organizations

If `CS_ORG_UID` and/or `CS_ORG_NAME` are set, the bootstrap resolves that org and
then **verifies the stack api key actually belongs to it** before writing
anything.

This matters once an account spans several orgs: previously a supplied
`CS_STACK_API_KEY` caused the org to be skipped entirely, so a stack name reused
across orgs could send content to the wrong place. Supplying both uid and name
cross-checks them and fails on a mismatch.

## Adding a stack

1. Create `.env.<name>` for it and bootstrap:

   ```bash
   # CS_INSTANCE, CS_ORG_UID / CS_ORG_NAME, CS_STACK_API_KEY, CS_ENVIRONMENT, credentials
   npm run bootstrap -- --env .env.<name>
   ```

2. Create a Vercel project for it and note the ids:

   ```bash
   vercel link --yes --project lumen-<stack>
   cat .vercel/project.json     # projectId, orgId
   ```

3. Register the GitHub Environment from your local config:

   ```bash
   npm run gh:env -- <stack> --env .env.<name>   # add --dry-run to preview
   ```

   Reads `.env` + `.env.local` and sets the variables and secrets. Secrets go in
   over stdin, never argv, so they cannot leak via `ps` or a dry-run echo.

4. Add the Vercel wiring (not derivable locally):

   ```bash
   gh variable set VERCEL_ORG_ID     --env <stack> --body team_…
   gh variable set VERCEL_PROJECT_ID --env <stack> --body prj_…
   gh secret   set VERCEL_TOKEN      --env <stack>          # prompts
   ```

5. Add it to the deploy matrix:

   ```bash
   gh variable set DEPLOY_ENVIRONMENTS --body '["dev15","<stack>"]'
   ```

## What lives where

| | Where | Why |
|---|---|---|
| `CS_INSTANCE`, `CS_ENVIRONMENT`, `CS_BRANCH`, `CS_LOCALE` | variable | not secret |
| `CS_STACK_API_KEY`, `CS_*_HOST`, `CS_APP_URL` | variable | public; in the bundle anyway |
| `CS_USER_EMAIL` | variable | identifies the automation account |
| `CS_USER_PASSWORD`, `CS_USER_TOTP_SECRET` | **secret** | full CMA access |
| `CS_DELIVERY_TOKEN`, `CS_PREVIEW_TOKEN` | **secret** | see the warning below |
| `VERCEL_TOKEN` | **secret** | can deploy |
| `DEPLOY_ENVIRONMENTS` | repo variable | the matrix |

### The preview token is public once deployed

`VITE_`-prefixed values are compiled into the client bundle. Vercel enforces
this — it refuses secret visibility for them:

> *Environment variables with a public framework prefix (VITE) cannot use secret
> visibility on Production or Preview.*

A preview token grants read access to **unpublished drafts**. On a public URL
that means anyone with the URL can read your drafts. Storing it as a GitHub
secret keeps it out of git and out of logs, but cannot make it private in the
browser.

If drafts must stay private, the CSR model is the wrong one — move preview reads
behind SSR or a server route so the token stays server-side.

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `deploy.yml` | push to `main`, or manual | Builds and deploys every environment in the matrix, in parallel. `workflow_dispatch` takes an `only` input to target one. |
| `bootstrap.yml` | **manual only** | Creates/syncs content types, taxonomies, global fields, assets and entries in one stack. Never runs on push, because it writes content. |

### 2FA in CI

The bootstrap logs in as a real user. A typed 6-digit code is impossible in CI,
so `CS_USER_TOTP_SECRET` (base32) is required — the script generates codes from
it. It also retries across the 30-second window, since a code is single-use and
consecutive runs otherwise collide.

### Repointing Contentstack after deploy

Visual Builder frames the URL held in the Contentstack **environment**, so each
stack should point at its own deployment. Set `CS_SYNC_SITE_URL=true` on an
environment and `deploy.yml` runs `scripts/set-site-url.mjs` after deploying.

Prefer setting `CS_PUBLIC_URL` to the stable production alias
(`<project>.vercel.app`). The per-deployment URL changes every push, and on this
Vercel account the deployment-specific and team-scoped URLs sit behind
Deployment Protection — which sends `frame-ancestors 'none'` and so **cannot be
framed by Visual Builder**. The clean production alias is the one that works.

## Local development

Unchanged. `.env` selects the stack, `npm run bootstrap` derives `.env.local`,
`npm run dev` serves it. To edit against localhost in Visual Builder:

```bash
npm run site:url -- http://localhost:3000
```

and back to the deployment when you're done.

## Local Vercel linking

`.vercel/project.json` holds a single project link, so `npm run deploy` targets
whichever stack you linked last. Switch with:

```bash
vercel link --yes --project lumen-rbac-demo
```

CI is unaffected — it uses `VERCEL_PROJECT_ID` / `VERCEL_ORG_ID` from the
environment rather than this file.

## Current environments

| GitHub Environment | Org | Stack | Vercel |
|---|---|---|---|
| `dev15` | (default) | `blt5aaa47d1d5525234` | `lumen-visual-experience.vercel.app` |
| `rbac-demo` | `cms-rbac` | `bltf7a45afcce89b6a5` | `lumen-rbac-demo.vercel.app` |

`DEPLOY_ENVIRONMENTS = ["dev15","rbac-demo"]` — both deploy in parallel.
