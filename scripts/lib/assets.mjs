/**
 * Asset definitions.
 *
 * Images are generated as SVG in-process rather than downloaded, so the
 * bootstrap stays reproducible and needs no external image host. Each asset has
 * a stable `key`; entries reference it as `__ASSET__:<key>` and the bootstrap
 * swaps in the real uid after upload.
 *
 * A `file` field's entry value is the asset UID string
 * (visual-builder/tests/data/entries/markAsTitle/entry.ts -> `file: assetUid`).
 */

const INK = '#12151c';
const ACCENT = '#2f5bea';

/** Deterministic hue per seed, so a given name always gets the same colour. */
function hueFor(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${body}</svg>`;

function logo() {
  return svg(
    160,
    40,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="#7aa2ff"/>
     </linearGradient></defs>
     <rect x="2" y="7" width="26" height="26" rx="7" fill="url(#g)"/>
     <circle cx="15" cy="20" r="6" fill="#fff" opacity="0.9"/>
     <circle cx="15" cy="20" r="2.5" fill="${ACCENT}"/>
     <text x="38" y="26" font-family="Inter,system-ui,sans-serif" font-size="19"
           font-weight="650" fill="${INK}" letter-spacing="-0.5">Lumen</text>`,
  );
}

/** Initials avatar. */
function avatar(name) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const hue = hueFor(name);
  return svg(
    160,
    160,
    `<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="hsl(${hue} 62% 58%)"/>
       <stop offset="1" stop-color="hsl(${(hue + 40) % 360} 66% 44%)"/>
     </linearGradient></defs>
     <rect width="160" height="160" rx="80" fill="url(#a)"/>
     <text x="80" y="80" font-family="Inter,system-ui,sans-serif" font-size="60"
           font-weight="600" fill="#fff" text-anchor="middle"
           dominant-baseline="central" opacity="0.95">${initials}</text>`,
  );
}

/** Abstract editorial image — soft mesh plus a faint grid. */
function abstract(seed, w = 1200, h = 720) {
  const hue = hueFor(seed);
  const h2 = (hue + 45) % 360;
  return svg(
    w,
    h,
    `<defs>
       <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="hsl(${hue} 45% 94%)"/>
         <stop offset="1" stop-color="hsl(${h2} 40% 86%)"/>
       </linearGradient>
       <radialGradient id="b1" cx="28%" cy="26%" r="52%">
         <stop offset="0" stop-color="hsl(${hue} 72% 62%)" stop-opacity="0.55"/>
         <stop offset="1" stop-color="hsl(${hue} 72% 62%)" stop-opacity="0"/>
       </radialGradient>
       <radialGradient id="b2" cx="74%" cy="68%" r="48%">
         <stop offset="0" stop-color="hsl(${h2} 78% 56%)" stop-opacity="0.5"/>
         <stop offset="1" stop-color="hsl(${h2} 78% 56%)" stop-opacity="0"/>
       </radialGradient>
       <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
         <path d="M48 0H0V48" fill="none" stroke="${INK}" stroke-opacity="0.05" stroke-width="1"/>
       </pattern>
     </defs>
     <rect width="${w}" height="${h}" fill="url(#bg)"/>
     <rect width="${w}" height="${h}" fill="url(#b1)"/>
     <rect width="${w}" height="${h}" fill="url(#b2)"/>
     <rect width="${w}" height="${h}" fill="url(#grid)"/>
     <g fill="none" stroke="${INK}" stroke-opacity="0.16" stroke-width="2">
       <circle cx="${w * 0.24}" cy="${h * 0.3}" r="${h * 0.17}"/>
       <circle cx="${w * 0.72}" cy="${h * 0.64}" r="${h * 0.12}"/>
     </g>`,
  );
}

/** Social share card with a title. */
function ogCard(title) {
  return svg(
    1200,
    630,
    `<defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="1">
       <stop offset="0" stop-color="#12151c"/><stop offset="1" stop-color="#1d2a54"/>
     </linearGradient></defs>
     <rect width="1200" height="630" fill="url(#o)"/>
     <rect x="80" y="86" width="30" height="30" rx="8" fill="${ACCENT}"/>
     <text x="126" y="110" font-family="Inter,system-ui,sans-serif" font-size="23"
           font-weight="600" fill="#fff">Lumen</text>
     <text x="80" y="330" font-family="Inter,system-ui,sans-serif" font-size="66"
           font-weight="680" fill="#fff" letter-spacing="-2">${title}</text>
     <text x="80" y="404" font-family="Inter,system-ui,sans-serif" font-size="27"
           fill="#93a3c8">Observability without the noise</text>`,
  );
}

/**
 * Every asset the seed content references. `key` is the stable handle used in
 * `__ASSET__:<key>` placeholders.
 */
export const ASSETS = [
  { key: 'logo', title: 'Lumen Logo', filename: 'lumen-logo.svg', svg: logo() },

  { key: 'avatar-dara', title: 'Dara Whitfield', filename: 'avatar-dara.svg', svg: avatar('Dara Whitfield') },
  { key: 'avatar-iman', title: 'Iman Rasheed', filename: 'avatar-iman.svg', svg: avatar('Iman Rasheed') },
  { key: 'avatar-priya', title: 'Priya Venkataraman', filename: 'avatar-priya.svg', svg: avatar('Priya Venkataraman') },
  { key: 'avatar-sana', title: 'Sana Iqbal', filename: 'avatar-sana.svg', svg: avatar('Sana Iqbal') },

  { key: 'hero-home', title: 'Home Hero Background', filename: 'hero-home.svg', svg: abstract('home hero', 1600, 900) },
  { key: 'split-delete', title: 'Start By Deleting', filename: 'split-delete.svg', svg: abstract('start by deleting') },

  { key: 'post-signal', title: 'Signal Over Noise', filename: 'post-signal.svg', svg: abstract('signal over noise') },
  { key: 'post-coldpath', title: 'The Cost of a Cold Path', filename: 'post-coldpath.svg', svg: abstract('cold path') },
  { key: 'post-instrumentation', title: 'Instrumentation Is a Product Decision', filename: 'post-instrumentation.svg', svg: abstract('instrumentation') },
  { key: 'post-alerts', title: 'Alerts That Earn Their Interruption', filename: 'post-alerts.svg', svg: abstract('alerts earn it') },

  { key: 'og-home', title: 'OG — Home', filename: 'og-home.svg', svg: ogCard('Understand your system') },
  { key: 'og-platform', title: 'OG — Platform', filename: 'og-platform.svg', svg: ogCard('One pipeline, three guarantees') },
  { key: 'og-pricing', title: 'OG — Pricing', filename: 'og-pricing.svg', svg: ogCard('Priced per person') },
];

/** `__ASSET__:<key>` — replaced with the real uid once uploaded. */
export const ASSET_REF = (key) => `__ASSET__:${key}`;

/** Walk any structure and swap asset placeholders for uids. */
export function resolveAssetRefs(value, uidByKey) {
  if (typeof value === 'string') {
    const m = value.match(/^__ASSET__:(.+)$/);
    if (!m) return value;
    // Unresolved placeholders become null so the CMA still accepts the entry.
    return uidByKey.get(m[1]) ?? null;
  }
  if (Array.isArray(value)) return value.map((v) => resolveAssetRefs(v, uidByKey));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveAssetRefs(v, uidByKey);
    return out;
  }
  return value;
}
