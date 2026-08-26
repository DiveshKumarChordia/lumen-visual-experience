/**
 * Host derivation.
 *
 * Contentstack instances follow a consistent subdomain scheme, so the whole
 * toolchain is driven by ONE value: CS_INSTANCE.
 *
 *   prod NA   -> CS_INSTANCE=na      app.contentstack.com   / api.contentstack.io   / cdn.contentstack.io
 *   prod EU   -> CS_INSTANCE=eu      eu-app.contentstack.com / eu-api.contentstack.com / eu-cdn.contentstack.com
 *   non-prod  -> CS_INSTANCE=dev22   dev22-app.csnonprod.com / dev22-api.csnonprod.com / dev22-cdn.csnonprod.com
 *
 * Any host can still be overridden individually (CS_API_HOST, CS_CDN_HOST, ...)
 * for instances that do not follow the scheme.
 *
 * The rest-preview host is derived by the same cdn->rest-preview substitution the
 * Visual Builder CSR reference app uses:
 *   visual-builder/test-resources/csr/src/sdk/entry.ts
 *     config.API_HOST.replace("cdn", "rest-preview").replace(".io", ".com")
 */

const PROD = {
  na: { app: 'app.contentstack.com', api: 'api.contentstack.io', cdn: 'cdn.contentstack.io' },
  eu: { app: 'eu-app.contentstack.com', api: 'eu-api.contentstack.com', cdn: 'eu-cdn.contentstack.com' },
  azure_na: { app: 'azure-na-app.contentstack.com', api: 'azure-na-api.contentstack.com', cdn: 'azure-na-cdn.contentstack.com' },
  azure_eu: { app: 'azure-eu-app.contentstack.com', api: 'azure-eu-api.contentstack.com', cdn: 'azure-eu-cdn.contentstack.com' },
  gcp_na: { app: 'gcp-na-app.contentstack.com', api: 'gcp-na-api.contentstack.com', cdn: 'gcp-na-cdn.contentstack.com' },
  gcp_eu: { app: 'gcp-eu-app.contentstack.com', api: 'gcp-eu-api.contentstack.com', cdn: 'gcp-eu-cdn.contentstack.com' },
};

/** Non-prod instances (dev11, dev22, stag, ...) all live under csnonprod.com. */
function nonProdHosts(instance) {
  return {
    app: `${instance}-app.csnonprod.com`,
    api: `${instance}-api.csnonprod.com`,
    cdn: `${instance}-cdn.csnonprod.com`,
  };
}

/**
 * cdn host -> rest-preview host.
 * Mirrors the CSR reference app exactly so preview reads hit the same service
 * Visual Builder expects.
 */
export function previewHostFromCdn(cdnHost) {
  return cdnHost.replace('cdn', 'rest-preview').replace('.io', '.com');
}

/**
 * cdn host -> graphql-preview host, the same substitution one step over.
 *   cdn.contentstack.io        -> graphql-preview.contentstack.com
 *   dev22-cdn.csnonprod.com    -> dev22-graphql-preview.csnonprod.com
 * (matches GRAPH_PREVIEW_URL in preview-api/backend/graphql/e2e/playwright/.env.example)
 */
export function graphqlPreviewHostFromCdn(cdnHost) {
  return cdnHost.replace('cdn', 'graphql-preview').replace('.io', '.com');
}

function stripScheme(value) {
  return String(value || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
}

export function resolveHosts(env = process.env) {
  const instance = (env.CS_INSTANCE || 'na').trim().toLowerCase();

  const base = PROD[instance] || nonProdHosts(instance);

  // Individual overrides win, for instances that break the naming scheme.
  const app = stripScheme(env.CS_APP_HOST) || base.app;
  const api = stripScheme(env.CS_API_HOST) || base.api;
  const cdn = stripScheme(env.CS_CDN_HOST) || base.cdn;
  const preview = stripScheme(env.CS_PREVIEW_HOST) || previewHostFromCdn(cdn);
  const gqlPreview =
    stripScheme(env.CS_GRAPHQL_PREVIEW_HOST) || graphqlPreviewHostFromCdn(cdn);

  return {
    instance,
    isProd: Boolean(PROD[instance]),
    appHost: app,
    apiHost: api,
    cdnHost: cdn,
    previewHost: preview,
    graphqlPreviewHost: gqlPreview,
    appUrl: `https://${app}`,
    // CMA calls are always versioned /v3
    cmaBase: `https://${api}/v3`,
    cdnBase: `https://${cdn}/v3`,
    previewUrl: `https://${preview}`,
    /** GraphQL preview requests POST to `<graphqlPreviewUrl>/<apiKey>`. */
    graphqlPreviewUrl: `https://${gqlPreview}/stacks`,
  };
}
