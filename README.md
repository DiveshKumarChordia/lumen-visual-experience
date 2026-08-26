# Visual Experience Project

A website built on Contentstack **Visual Experience** — Live Preview SDK + Visual
Builder — where the stack, environment, tokens, content types and entries are all
created **by a script**, so a fresh run reproduces the same result.

It also exercises the two preview **products** directly: the **Preview REST API**
and the **GraphQL Preview API**.

---

## Quick start

```bash
cp .env.example .env      # fill in CS_INSTANCE + credentials
npm install
npm run bootstrap         # creates everything in Contentstack
npm run dev               # http://localhost:3000
```

Then open Visual Builder at
`<CS_APP_HOST>/#!/stack/<api_key>/visual-builder`.

Only three things are truly required in `.env`:

```bash
CS_INSTANCE=na            # or eu, dev11, dev22 … — drives every host
CS_USER_EMAIL=…
CS_USER_PASSWORD=…
CS_USER_TOTP_SECRET=…     # only if the account has 2FA
```

Everything else is derived or created.

---

## What `npm run bootstrap` does

Ten idempotent steps. Output marks `+` created, `=` already existed, `!` warning.

| # | Step | API |
|---|------|-----|
| 1 | Log in (TOTP if challenged) | `POST /v3/user-session` |
| 2 | Resolve organization | `GET /v3/user?include_orgs_roles=true` |
| 3 | Resolve or create stack | `GET/POST /v3/stacks` |
| 4 | Environment, pointed at `CS_SITE_URL` | `GET/POST/PUT /v3/environments` |
| 5 | Delivery **+ preview** token | `POST /v3/stacks/delivery_tokens?create_with_preview_token=true` |
| 6 | Enable Live Preview on the stack | `POST /v3/stacks/settings` |
| 7 | Create/sync 4 content types | `POST/PUT /v3/content_types` |
| 8 | 2 singletons, 4 posts, 3 pages | `POST/PUT /v3/content_types/:ct/entries` |
| 9 | Publish everything | `POST …/entries/:uid/publish` |
| 10 | Write `.env.local` for Vite | — |

Re-running updates in place: singletons match on `title`, pages and posts on
`url`. Nothing duplicates.

---

## Content model

Built to exercise **every field type Visual Builder can edit**, while still
modelling a real site. Field builders live in
[scripts/lib/fields.mjs](scripts/lib/fields.mjs); the authoritative list of
editable types is the SDK's own resolver,
`live-preview-sdk/src/visualBuilder/utils/getFieldType.ts`.

| Content type | `is_page` | Notes |
|---|---|---|
| `header` | no | singleton — brand, logo, nav (link fields) |
| `footer` | no | singleton — nested groups of link fields |
| `author` | no | referenced by posts, not a page |
| `blog_post` | **yes** | JSON RTE body, author reference, taxonomy, SEO global field |
| `page` | **yes** | 10 modular block types |

**Taxonomies** (created first — the CMA validates `taxonomy_uid` on save):
`topic` with nested terms (`observability`/`performance` under `engineering`,
`oncall` under `practice`) and `audience`.

**Global field** `seo_metadata` — one schema reused by `page` and `blog_post`.

**Page blocks:** `hero`, `rich_text`, `markdown_section`, `feature_grid`,
`stats_band`, `image_text`, `latest_posts`, `faq`, `quote`, `cta_banner`.

### Field type coverage

All 17 editable types are used: `SINGLELINE`, `MULTILINE`, `HTML_RTE`,
`MARKDOWN_RTE`, `SELECT`, `URL`, `JSON_RTE`, `NUMBER`, `BOOLEAN`, `ISODATE`,
`FILE`, `LINK`, `REFERENCE`, `GROUP`, `MODULAR_BLOCK`, `GLOBAL_FIELD`,
`TAXONOMY`.

Not used, and why: `CUSTOM_FIELD` needs a UI extension installed;
`EXPERIENCE_CONTAINER` needs a Personalize project; `BLOCK` is the inner block
of a modular block rather than a top-level type.

### Shapes that are easy to get wrong

Several types are distinguished only by `field_metadata` flags, and several
entry values do not match their schema key:

| Thing | Correct form |
|---|---|
| multiline vs RTE vs markdown | `text` + `multiline` / `allow_rich_text` / `markdown` |
| select | `text` + `enum: { advanced, choices: [{ value }] }` |
| url field | uid **must** be `url` with `field_metadata._default` |
| link entry value | `{ title, href }` — **not** `{ title, url }` |
| reference entry value | `[{ uid, _content_type_uid }]`, array even when single |
| taxonomy field | uid reserved as `taxonomies`, **must** be `multiple: true` |
| taxonomy entry value | `[{ taxonomy_uid, term_uid }]` |
| taxonomy placement | **root only** — cannot live inside a group or block |
| taxonomy term `order` | scoped to siblings; a global index is rejected |

## How the Visual Builder wiring works

Mirrors the canonical reference app,
`visual-builder/test-resources/csr/src/sdk/entry.ts`.

**1. Point the delivery SDK at rest-preview** ([src/sdk/entry.ts](src/sdk/entry.ts))

```ts
contentstack.Stack({
  api_key, delivery_token, environment, branch,
  live_preview: { enable: true, preview_token, host: previewHost },
});
```

The `preview_token` + rest-preview `host` are what let the iframe render
*unpublished* content. Without them the editor shows stale published data.

**2. Initialise in builder mode**

```ts
ContentstackLivePreview.init({
  mode: "builder", ssr: false, stackSdk: Stack,
  editButton: { enable: false },                 // VB draws its own overlays
  editInVisualBuilderButton: { enable: true },
});
```

**3. Tag every field** ([src/helper/index.ts](src/helper/index.ts))

`addEditableTags(entry, ctUid, true, locale)` attaches a `$` map of `data-cslp`
attributes. No tags means the site renders but nothing is clickable in the
editor. Attributes are applied through [src/utils/cslp.ts](src/utils/cslp.ts),
which whitelists `data-cslp*` rather than spreading `$` wholesale.

**4. Index modular blocks correctly** ([src/components/RenderBlocks.tsx](src/components/RenderBlocks.tsx))

```tsx
<div {...cslp(map.page_components)}>                     {/* the field */}
  {components.map((c, i) => (
    <div {...cslp(map[`page_components__${i}`])}>…</div>  {/* each block */}
  ))}
</div>
```

That field/child pair is what enables add, reorder and delete on individual
blocks. When the field is empty the container gets the SDK's exported
`VB_EmptyBlockParentClass`, otherwise the editor has nothing to hit.

**5. Declare the current page**

`setPageContext({ entryUid, contentTypeUid })` tells VB which entry the visible
page is, so navigation and "Start Editing" open the right one.

**6. Re-fetch on edit**

`onEntryChange(cb)` returns a **callback UID string**, not an unsubscribe
function — clean up with `unsubscribeOnEntryChange(uid)`.

---

## How preview reads actually work

This is the part that is easy to get wrong. **Application code does not build
Preview REST requests.** You configure the Stack once; the SDKs do the rest.

```
contentstack.Stack({ live_preview: { enable, preview_token, host } })
        │
        │  ContentstackLivePreview.init({ stackSdk: Stack, ssr: false })
        ▼
Live Preview SDK injects the hash INTO that Stack object
        │      configManager.ts -> syncToStackSdk()
        │      stackSdk.live_preview.live_preview = hash
        ▼
delivery SDK, on every query (contentstack.js ~L1120, L2075):
   hash present ->  host = live_preview.host        (rest-preview)
                    DELETE access_token header
                    SET preview_token + live_preview headers
                    drop `environment`, force network
   no hash      ->  CDN host + delivery token
```

So one `Stack.ContentType(x).Query().find()` is a **CDA read or a Preview REST
read depending on context** — decided by the SDK, not by you. That *is* what
consuming the Preview REST API looks like from a site.

### Release Preview and Timeline

Use the officially typed API — not hand-set headers:

```ts
Stack.livePreviewQuery({
  live_preview: ContentstackLivePreview.hash,
  content_type_uid: "page",
  release_id: "blt…",                    // Release Preview
  preview_timestamp: "2026-09-01T00:00:00.000Z",  // Timeline
});
```

Wrapped in [src/sdk/previewContext.ts](src/sdk/previewContext.ts) as
`applyPreviewContext()`. Keys are **omitted rather than blanked** when unused,
because the SDK tests `query.hasOwnProperty('release_id')` — passing `""` would
set an empty header instead of clearing it.

There is also `Stack.setLivePreviewTimelinePreviewForClient()`, which reads
`live_preview` / `release_id` / `preview_timestamp` straight off the iframe URL.
Real at runtime but missing from the package typings, so it is called guardedly
as `syncPreviewFromUrl()`.

The hash always comes from `ContentstackLivePreview.hash` — the documented
accessor — never from parsing the URL yourself.

### The tracker is not yours to call

`POST /v3/live-preview/tracker` is created by the **Contentstack app**, which
holds the user session. The Live Preview SDK contains **zero** references to it.
Site code must never call it — it would need a CMA authtoken in the browser.

`npm run preview:demo` does call it, because it runs in Node with a login and is
demonstrating the raw HTTP contract.

### GraphQL Preview — the one hand-built case

The `contentstack` JS delivery SDK is REST-only, so there is no SDK path for
GraphQL. [src/lib/previewGraphql.ts](src/lib/previewGraphql.ts) builds the
request itself, using the same auth triple the delivery SDK sets internally:

```
POST https://<instance->graphql-preview.<domain>/stacks/<apiKey>
  api_key, preview_token, live_preview: <hash>
  release_id | preview_timestamp
  x-cs-preview-enable-entry-draft, x-cs-variant-uid
```

```graphql
query { all_page { items { title url system { uid } } } }
query { page(uid: "blt…") { title } }
# references and files: <field>Connection { edges { node { … } } }
```

### Seeing it work

`/api-explorer` reads the same content three ways and **reports the host and
auth header the SDK actually chose**, so the CDA → Preview REST switch is
observable rather than asserted.

`npm run preview:demo` drives the raw HTTP from Node:

```bash
npm run preview:demo
npm run preview:demo -- --release <releaseUid>
npm run preview:demo -- --timestamp 2026-09-01T00:00:00.000Z
npm run preview:demo -- --draft
```

Draft preview additionally requires the auto-draft plan **and**
`stack.settings.entries.auto_draft_enabled`.

All hosts derive from one `CS_INSTANCE` via
[scripts/lib/hosts.mjs](scripts/lib/hosts.mjs) (`cdn` → `rest-preview` /
`graphql-preview`, `.io` → `.com`).

---

## Layout

```
scripts/
  bootstrap.mjs          10-step idempotent orchestrator
  preview-api-demo.mjs   CDA vs Preview REST vs GraphQL from Node
  lib/
    hosts.mjs            one CS_INSTANCE -> every host
    cma.mjs              CMA client (login, tokens, settings, CTs, entries)
    model.mjs            content type schemas
    seed.mjs             page + post content
    totp.mjs             RFC 6238, for 2FA login
src/
  sdk/entry.ts           delivery SDK + Live Preview init
  sdk/previewContext.ts  official preview/Release/Timeline wiring
  lib/previewGraphql.ts  GraphQL Preview client (no SDK exists for GraphQL)
  helper/index.ts        fetches + addEditableTags
  components/            Header, Footer, RenderBlocks, blocks/*
  pages/                 PageView, BlogPostView, ApiExplorer
```

## Scripts

| Command | Does |
|---|---|
| `npm run bootstrap` | Create/sync everything in Contentstack |
| `npm run bootstrap:skip-publish` | Same, leaves entries unpublished (draft testing) |
| `npm run preview:demo` | Compare the three read products from Node |
| `npm run dev` | Vite on :3000 |
| `npm run build` | Typecheck + production build |

## Notes

- `CS_SITE_URL` must match where the site actually serves — it becomes the
  environment base URL that Visual Builder frames.
- On a `csnonprod` instance those hosts must resolve from your browser
  (VPN/local). That is why deployment was deferred.
