# Running multiple stacks at once

One repo, many Contentstack stacks, all deployed simultaneously.

```
                      ┌── Vercel project: lumen-visual-experience ──┐
                      │  VITE_* for stack blt5aaa…                  │
git push ────────────▶│  → lumen-visual-experience.vercel.app       │
   (Vercel Git        └─────────────────────────────────────────────┘
    integration,      ┌── Vercel project: lumen-rbac-demo ──────────┐
    both in parallel) │  VITE_* for stack bltf7a4…                  │
                      │  → lumen-rbac-demo.vercel.app               │
                      └─────────────────────────────────────────────┘
```

**Deployment is owned by Vercel, not GitHub Actions.** Both projects are
connected to this repo, so one push builds and promotes both in parallel, each
using its own project-scoped `VITE_*` values. There is no `VERCEL_TOKEN` and no
deploy workflow — an Actions-based deploy was tried first and removed: it
duplicated what the Git integration already does, needed a token, and created a
second source of truth for the same values.

What each system owns:

| Concern | Owner |
|---|---|
| Build + deploy per stack | Vercel Git integration |
| Build-time `VITE_*` per stack | Vercel project env vars (`npm run vercel:env`) |
| Writing content into a stack | `bootstrap.yml` + GitHub Environments (manual) |
| Typecheck / build check | `ci.yml` (no secrets) |

## Adding a stack, end to end

```bash
# 1. Contentstack — create/sync everything in the new stack
npm run bootstrap -- --env .env.<name>

# 2. Vercel — one project per stack, then push its derived values
vercel link --yes --project lumen-<name>
npm run vercel:env -- --apply          # reads .env.<name>.local

# 3. Deploy once manually; afterwards `git push` handles it
vercel deploy --prod --yes

# 4. Point Visual Builder at it
npm run site:url -- --env .env.<name> https://lumen-<name>.vercel.app

# 5. Optional — only if you want CI to run the bootstrap for this stack
npm run gh:env -- <name> --env .env.<name>
```

## Why not a branch per stack

Branch-per-stack means merge management forever. One `main` with per-project
configuration varies only the thing that actually differs between stacks.

GitHub Environments still earn their place for `bootstrap.yml`, which writes to
Contentstack and benefits from protection rules and required reviewers.

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
| `ci.yml` | push / PR | Typecheck, build with placeholder config, and parse-check every script. Needs no secrets. |
| `bootstrap.yml` | **manual only** | Creates/syncs content types, taxonomies, global fields, assets and entries in one stack. Never runs on push, because it writes content. |

Deployment is not a workflow — see the top of this document.

### 2FA in CI

The bootstrap logs in as a real user. A typed 6-digit code is impossible in CI,
so `CS_USER_TOTP_SECRET` (base32) is required — the script generates codes from
it. It also retries across the 30-second window, since a code is single-use and
consecutive runs otherwise collide.

### Repointing Contentstack after deploy

Visual Builder frames the URL held in the Contentstack **environment**, so each
stack should point at its own deployment:

```bash
npm run site:url -- --env .env.<name> https://lumen-<name>.vercel.app
```

Use the stable production alias
(`<project>.vercel.app`) — it is stable across pushes, whereas the
per-deployment URL changes every time.

This matters more than it looks. The project sets
`ssoProtection.deploymentType: "all_except_custom_domains"`, so the
deployment-specific and team-scoped URLs sit behind Vercel SSO, which serves
`x-frame-options: DENY` and `frame-ancestors 'none'` and therefore **cannot be
framed by Visual Builder**. Only the clean production alias is framable.

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
