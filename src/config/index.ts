/**
 * Reads the values written by scripts/bootstrap.mjs into .env.local.
 *
 * Deliberately does NOT throw on missing values: this module is imported at
 * startup, so throwing here would blank the page. `isConfigured` lets main.tsx
 * render an actionable setup notice instead.
 */
const env = import.meta.env;

const config = {
  API_KEY: env.VITE_CONTENTSTACK_API_KEY ?? "",
  DELIVERY_TOKEN: env.VITE_CONTENTSTACK_DELIVERY_TOKEN ?? "",
  PREVIEW_TOKEN: env.VITE_CONTENTSTACK_PREVIEW_TOKEN ?? "",
  ENVIRONMENT: env.VITE_CONTENTSTACK_ENVIRONMENT ?? "",
  BRANCH: env.VITE_CONTENTSTACK_BRANCH || "main",
  LOCALE: env.VITE_CONTENTSTACK_LOCALE || "en-us",

  /** CDN host, e.g. cdn.contentstack.io — the delivery SDK wants host, not URL. */
  API_HOST: env.VITE_CONTENTSTACK_API_HOST || "cdn.contentstack.io",
  /** Contentstack app origin, e.g. https://app.contentstack.com */
  APP_HOST: env.VITE_CONTENTSTACK_APP_HOST || "https://app.contentstack.com",
  /** rest-preview host; derived from API_HOST when absent. */
  PREVIEW_HOST: env.VITE_CONTENTSTACK_PREVIEW_HOST || "",
  /** graphql-preview host; derived from API_HOST when absent. */
  GRAPHQL_PREVIEW_HOST: env.VITE_CONTENTSTACK_GRAPHQL_PREVIEW_HOST || "",
};

/** The three values without which nothing can be fetched. */
export const MISSING_CONFIG: string[] = (
  [
    ["VITE_CONTENTSTACK_API_KEY", config.API_KEY],
    ["VITE_CONTENTSTACK_DELIVERY_TOKEN", config.DELIVERY_TOKEN],
    ["VITE_CONTENTSTACK_ENVIRONMENT", config.ENVIRONMENT],
  ] as const
)
  .filter(([, v]) => !v)
  .map(([k]) => k);

export const isConfigured = MISSING_CONFIG.length === 0;

export default config;
