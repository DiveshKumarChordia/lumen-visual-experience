/**
 * Content Management API client.
 *
 * Endpoint shapes verified against the Visual Experience repos rather than
 * guessed:
 *   POST /v3/user-session                                     -> authtoken
 *   POST /v3/stacks/delivery_tokens?create_with_preview_token=true
 *        -> { token: { token, preview_token } }
 *        (release-preview-client/e2e/utils/ApiActions.ts,
 *         preview-rest-api/e2e/playwright/setup/*)
 *   POST /v3/stacks/settings  { stack_settings: { live_preview: {...} } }
 *        live_preview keys per visual-builder/src/types/stores/auth.ts
 */
import { log } from './logger.mjs';
import { generateTotp } from './totp.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class CmaError extends Error {
  constructor(message, { status, body, url } = {}) {
    super(message);
    this.name = 'CmaError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/** Pull the human-readable message out of a CMA error envelope. */
function errorMessage(body, res) {
  if (!body || typeof body !== 'object') return `${res.status} ${res.statusText}`;
  if (typeof body.error_message === 'string') {
    const detail = body.errors
      ? ` ${JSON.stringify(body.errors)}`
      : '';
    return `${body.error_message}${detail}`;
  }
  if (body.errors) return JSON.stringify(body.errors);
  return `${res.status} ${res.statusText}`;
}

export class Cma {
  /**
   * @param {object} opts
   * @param {string} opts.cmaBase   e.g. https://api.contentstack.io/v3
   * @param {string} [opts.apiKey]  stack api key (set once known)
   * @param {string} [opts.branch]
   */
  constructor({ cmaBase, apiKey = '', branch = '', authtoken = '' }) {
    this.cmaBase = cmaBase.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.branch = branch;
    this.authtoken = authtoken;
    this.orgUid = '';
  }

  headers(extra = {}) {
    const h = { ...JSON_HEADERS, ...extra };
    if (this.authtoken) h.authtoken = this.authtoken;
    if (this.apiKey) h.api_key = this.apiKey;
    if (this.branch) h.branch = this.branch;
    return h;
  }

  /**
   * Single request entry point. Retries 429 and 5xx with backoff, because the
   * bootstrap makes many writes in sequence and CMA rate-limits per org.
   */
  async request(method, path, { body, headers = {}, retries = 4, allow = [] } = {}) {
    const url = path.startsWith('http') ? path : `${this.cmaBase}${path}`;

    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(url, {
        method,
        headers: this.headers(headers),
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const text = await res.text();
      let parsed;
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }

      if (res.ok) return parsed;
      // Caller opted to handle this status itself (e.g. 422 duplicate).
      if (allow.includes(res.status)) return { __status: res.status, ...parsed };

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < retries) {
        const waitMs = res.status === 429
          ? 2000 * (attempt + 1)
          : 500 * 2 ** attempt;
        log.warn(`${method} ${path} -> ${res.status}, retrying in ${waitMs}ms`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      throw new CmaError(errorMessage(parsed, res), { status: res.status, body: parsed, url });
    }
  }

  get(p, o) { return this.request('GET', p, o); }
  post(p, body, o) { return this.request('POST', p, { ...o, body }); }
  put(p, body, o) { return this.request('PUT', p, { ...o, body }); }
  delete(p, o) { return this.request('DELETE', p, o); }

  // ---------------------------------------------------------------- auth

  /**
   * Log in and store the authtoken. Handles the 2FA challenge: when the account
   * has TOTP enabled the first call returns 294 / an error asking for a
   * `tfa_token`, so we resend with a generated code.
   */
  async login({ email, password, totpSecret = '', tfaToken = '' }) {
    const attemptLogin = async (tfaToken) => {
      const body = { user: { email, password } };
      if (tfaToken) body.user.tfa_token = tfaToken;
      // authtoken/api_key must not be sent on login
      const res = await fetch(`${this.cmaBase}/user-session`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed;
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
      return { res, parsed };
    };

    let { res, parsed } = await attemptLogin();

    const needsTfa =
      !res.ok &&
      (res.status === 294 ||
        /tfa|two.?factor|authy|security code/i.test(JSON.stringify(parsed)));

    if (needsTfa) {
      // A verification code is 6-8 digits. A base32 secret pasted into this
      // field would otherwise be submitted verbatim and burn a login attempt,
      // and repeated failures lock the account for 5 minutes.
      const looksLikeCode = /^\d{6,8}$/.test(String(tfaToken).trim());

      if (tfaToken && !looksLikeCode) {
        if (totpSecret) {
          log.warn(
            `CS_USER_TFA_TOKEN is not a 6-digit code (got ${String(tfaToken).trim().length} chars) — ignoring it and generating from CS_USER_TOTP_SECRET instead.`,
          );
        } else {
          throw new CmaError(
            `CS_USER_TFA_TOKEN must be the 6-digit code from your authenticator, but got ${String(tfaToken).trim().length} characters. ` +
              'If that value is the base32 secret, put it in CS_USER_TOTP_SECRET instead.',
            { status: res.status, body: parsed },
          );
        }
      }

      if (tfaToken && looksLikeCode) {
        // A code typed straight from the authenticator app. Single use, and it
        // expires on the next 30s boundary.
        log.info('2FA challenge received, using supplied CS_USER_TFA_TOKEN');
        ({ res, parsed } = await attemptLogin(String(tfaToken).trim()));
      } else if (totpSecret) {
        log.info('2FA challenge received, generating TOTP from secret');
        ({ res, parsed } = await attemptLogin(generateTotp(totpSecret)));

        // A TOTP code is single-use. Back-to-back runs land inside the same 30s
        // window and get "The current Totp has already been Used", so wait for
        // the next window and generate a fresh one rather than failing the run.
        for (let retry = 0; retry < 2; retry += 1) {
          if (res.ok) break;
          if (!/totp has already been used/i.test(JSON.stringify(parsed))) break;

          const STEP_MS = 30_000;
          const waitMs = STEP_MS - (Date.now() % STEP_MS) + 1000;
          log.warn(
            `TOTP already used — waiting ${Math.ceil(waitMs / 1000)}s for the next code`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          ({ res, parsed } = await attemptLogin(generateTotp(totpSecret)));
        }
      } else {
        throw new CmaError(
          'Account requires 2FA. Either set CS_USER_TFA_TOKEN to the current ' +
            '6-digit code from your authenticator, or CS_USER_TOTP_SECRET to the ' +
            'base32 secret so codes can be generated automatically.',
          { status: res.status, body: parsed },
        );
      }
    }

    if (!res.ok) {
      const msg = errorMessage(parsed, res);
      if (/temporarily locked/i.test(msg)) {
        throw new CmaError(
          `${msg} Further attempts during the lockout extend it — wait it out before retrying.`,
          { status: res.status, body: parsed },
        );
      }
      throw new CmaError(msg, { status: res.status, body: parsed });
    }

    this.authtoken = parsed?.user?.authtoken || '';
    if (!this.authtoken) throw new CmaError('Login succeeded but no authtoken returned', { body: parsed });

    this.user = parsed.user;
    return parsed.user;
  }

  async logout() {
    if (!this.authtoken) return;
    try {
      // api_key must not be scoped on logout
      await fetch(`${this.cmaBase}/user-session`, {
        method: 'DELETE',
        headers: { ...JSON_HEADERS, authtoken: this.authtoken },
      });
    } catch { /* best effort */ }
  }

  // ------------------------------------------------------------ org / stack

  async organizations() {
    const body = await this.get('/user?include_orgs_roles=true');
    return body?.user?.organizations ?? [];
  }

  /** Stacks visible to the logged-in user, optionally scoped to an org. */
  async stacks({ orgUid = '' } = {}) {
    const headers = orgUid ? { organization_uid: orgUid } : {};
    // api_key must be absent to list all stacks
    const saved = this.apiKey;
    this.apiKey = '';
    try {
      const body = await this.get('/stacks?include_count=true', { headers });
      return body?.stacks ?? [];
    } finally {
      this.apiKey = saved;
    }
  }

  /** Full stack document including `settings` (needs api_key scoping). */
  async stack() {
    const body = await this.get('/stacks?include_branches=true');
    return body?.stack ?? null;
  }

  async createStack({ name, description = '', masterLocale = 'en-us', orgUid }) {
    const saved = this.apiKey;
    this.apiKey = '';
    try {
      const body = await this.post(
        '/stacks',
        { stack: { name, description, master_locale: masterLocale } },
        { headers: { organization_uid: orgUid } },
      );
      return body?.stack ?? null;
    } finally {
      this.apiKey = saved;
    }
  }

  /**
   * POST /v3/stacks/settings merges into stack.settings.
   * Shape per visual-builder/src/types/stores/auth.ts.
   */
  async updateStackSettings(stackSettings) {
    const body = await this.post('/stacks/settings', { stack_settings: stackSettings });
    return body?.stack_settings ?? null;
  }

  // ------------------------------------------------------------ environments

  async environments() {
    const body = await this.get('/environments?include_count=true');
    return body?.environments ?? [];
  }

  async createEnvironment({ name, urls }) {
    const body = await this.post('/environments', { environment: { name, urls } });
    return body?.environment ?? null;
  }

  async updateEnvironment(name, { urls }) {
    const body = await this.put(`/environments/${encodeURIComponent(name)}`, {
      environment: { name, urls },
    });
    return body?.environment ?? null;
  }

  // ------------------------------------------------------------------ tokens

  async deliveryTokens() {
    const body = await this.get('/stacks/delivery_tokens?include_count=true');
    return body?.tokens ?? [];
  }

  /**
   * Creates a delivery token AND its paired preview token in one call.
   * `?create_with_preview_token=true` is what makes `preview_token` appear on
   * the response — without it Live Preview / Visual Builder cannot read drafts.
   */
  async createDeliveryToken({ name, description = '', environments, scopeAll = true }) {
    const scope = [
      { module: 'environment', environments, acl: { read: true } },
    ];
    if (scopeAll) {
      scope.push({ module: 'branch', branches: [this.branch || 'main'], acl: { read: true } });
    }
    const body = await this.post(
      '/stacks/delivery_tokens?create_with_preview_token=true',
      { token: { name, description, scope } },
    );
    return body?.token ?? null;
  }

  /**
   * Mint a preview token for an EXISTING delivery token.
   * POST /v3/stacks/delivery_tokens/:uid/preview_token -> 201
   *   { notice: 'Preview token created successfully.', token: { preview_token } }
   * Returns 422 when one already exists.
   */
  async createPreviewTokenFor(deliveryTokenUid) {
    const body = await this.post(
      `/stacks/delivery_tokens/${encodeURIComponent(deliveryTokenUid)}/preview_token`,
      undefined,
      { allow: [422] },
    );
    if (body.__status === 422) {
      // error_code 600 = the feature is not in the stack's plan, which no amount
      // of retrying will fix. Distinguish it from "one already exists".
      const planGated = body?.error_code === 600 || /not included in your plan/i.test(body?.error_message ?? '');
      return { conflict: true, planGated, previewToken: null };
    }
    return { conflict: false, planGated: false, previewToken: body?.token?.preview_token ?? null };
  }

  async deletePreviewTokenFor(deliveryTokenUid) {
    return this.delete(
      `/stacks/delivery_tokens/${encodeURIComponent(deliveryTokenUid)}/preview_token`,
      { allow: [404, 422] },
    );
  }

  // -------------------------------------------------------------- taxonomies

  async taxonomies() {
    const body = await this.get('/taxonomies?include_count=true', { allow: [404] });
    return body?.taxonomies ?? [];
  }

  async createTaxonomy({ uid, name, description = '' }) {
    const body = await this.post('/taxonomies', {
      taxonomy: { uid, name, description },
    });
    return body?.taxonomy ?? null;
  }

  async terms(taxonomyUid) {
    const body = await this.get(
      `/taxonomies/${taxonomyUid}/terms?include_count=true`,
      { allow: [404] },
    );
    return body?.terms ?? [];
  }

  /** `parent_uid: null` makes a root term. */
  async createTerm(taxonomyUid, { uid, name, parent_uid = null, order }) {
    const term = { uid, name, parent_uid };
    if (order !== undefined) term.order = String(order);
    const body = await this.post(`/taxonomies/${taxonomyUid}/terms`, { term });
    return body?.term ?? null;
  }

  // ------------------------------------------------------------ global fields

  async globalFields() {
    const body = await this.get('/global_fields?include_count=true');
    return body?.global_fields ?? [];
  }

  async createGlobalField(globalField) {
    const body = await this.post('/global_fields', { global_field: globalField });
    return body?.global_field ?? null;
  }

  async updateGlobalField(uid, globalField) {
    const body = await this.put(`/global_fields/${uid}`, { global_field: globalField });
    return body?.global_field ?? null;
  }

  // ----------------------------------------------------------- content types

  async contentTypes() {
    const body = await this.get('/content_types?include_count=true&include_global_field_schema=true');
    return body?.content_types ?? [];
  }

  async createContentType(contentType) {
    const body = await this.post('/content_types', { content_type: contentType });
    return body?.content_type ?? null;
  }

  async updateContentType(uid, contentType) {
    const body = await this.put(`/content_types/${uid}`, { content_type: contentType });
    return body?.content_type ?? null;
  }

  // ----------------------------------------------------------------- entries

  async entries(contentTypeUid, { query, locale = 'en-us' } = {}) {
    const params = new URLSearchParams({ locale, include_count: 'true' });
    if (query) params.set('query', JSON.stringify(query));
    const body = await this.get(`/content_types/${contentTypeUid}/entries?${params}`);
    return body?.entries ?? [];
  }

  async createEntry(contentTypeUid, entry, { locale = 'en-us' } = {}) {
    const body = await this.post(
      `/content_types/${contentTypeUid}/entries?locale=${encodeURIComponent(locale)}`,
      { entry },
    );
    return body?.entry ?? null;
  }

  async updateEntry(contentTypeUid, entryUid, entry, { locale = 'en-us' } = {}) {
    const body = await this.put(
      `/content_types/${contentTypeUid}/entries/${entryUid}?locale=${encodeURIComponent(locale)}`,
      { entry },
    );
    return body?.entry ?? null;
  }

  /**
   * Publish an entry, optionally at a future time and/or a specific version.
   *
   * `scheduled_at` is what places the change on the Release timeline, so a
   * `preview_timestamp` read can resolve to it
   * (preview-rest-api/e2e/.../release-preview.api.spec.ts).
   */
  async publishEntry(
    contentTypeUid,
    entryUid,
    { environments, locales = ['en-us'], version, scheduledAt, locale },
  ) {
    const entry = { environments, locales };
    const body = { entry };
    if (version !== undefined) body.version = version;
    if (scheduledAt) body.scheduled_at = scheduledAt;
    if (locale) body.locale = locale;

    return this.post(
      `/content_types/${contentTypeUid}/entries/${entryUid}/publish`,
      body,
    );
  }

  // -------------------------------------------------------------- releases

  /** Release APIs require the `release_version: 2.0` header. */
  releaseHeaders() {
    return { release_version: '2.0' };
  }

  async releases() {
    const body = await this.get('/releases?include_count=true', {
      headers: this.releaseHeaders(),
      allow: [404],
    });
    return body?.releases ?? [];
  }

  async createRelease({ name, description = '' }) {
    const body = await this.post(
      '/releases',
      { release: { name, description } },
      { headers: this.releaseHeaders() },
    );
    return body?.release ?? null;
  }

  /** `items` entries look like { uid, version, locale, content_type_uid, action }. */
  async addReleaseItems(releaseUid, items) {
    return this.post(
      `/releases/${encodeURIComponent(releaseUid)}/items`,
      { items },
      { headers: this.releaseHeaders() },
    );
  }

  async getEntry(contentTypeUid, entryUid, { locale = 'en-us' } = {}) {
    const body = await this.get(
      `/content_types/${contentTypeUid}/entries/${entryUid}?locale=${encodeURIComponent(locale)}`,
    );
    return body?.entry ?? null;
  }

  // ------------------------------------------------------------------ assets

  async assets({ limit = 100 } = {}) {
    const body = await this.get(`/assets?include_count=true&limit=${limit}`);
    return body?.assets ?? [];
  }

  /**
   * Upload an in-memory buffer as a stack asset.
   * POST /v3/assets (multipart) — `asset[upload]` carries the file.
   * Content-Type must be omitted so fetch sets the multipart boundary.
   */
  async uploadAsset({ buffer, filename, contentType, title, description = '' }) {
    const form = new FormData();
    form.append('asset[upload]', new Blob([buffer], { type: contentType }), filename);
    form.append('asset[title]', title);
    if (description) form.append('asset[description]', description);

    const headers = this.headers();
    delete headers['Content-Type'];

    const res = await fetch(`${this.cmaBase}/assets`, { method: 'POST', headers, body: form });
    const text = await res.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    if (!res.ok) throw new CmaError(errorMessage(parsed, res), { status: res.status, body: parsed });
    return parsed?.asset ?? null;
  }

  /** Upload a remote image as a stack asset (multipart). */
  async uploadAssetFromUrl({ url, title, description = '' }) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new CmaError(`Failed to download asset ${url}: ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

    const form = new FormData();
    form.append('asset[upload]', new Blob([buf], { type: contentType }), `${title}.${ext}`);
    form.append('asset[title]', title);
    form.append('asset[description]', description);

    // Let fetch set the multipart boundary — do not send Content-Type.
    const headers = this.headers();
    delete headers['Content-Type'];

    const res = await fetch(`${this.cmaBase}/assets`, { method: 'POST', headers, body: form });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    if (!res.ok) throw new CmaError(errorMessage(parsed, res), { status: res.status, body: parsed });
    return parsed?.asset ?? null;
  }

  async publishAsset(assetUid, { environments, locales = ['en-us'] }) {
    return this.post(`/assets/${assetUid}/publish`, { asset: { environments, locales } });
  }
}
