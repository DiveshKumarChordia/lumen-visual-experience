/**
 * Read-modify-write helpers for entries.
 *
 * The CMA is asymmetric: a GET expands `file` fields into full asset objects
 * and may expand references into whole entries, but a PUT expects
 *   file      -> the asset UID string
 *   reference -> [{ uid, _content_type_uid }]
 *
 * Sending back what you just read therefore fails with
 *   "page_components.0.hero.background_image": ["is not a valid upload."]
 *
 * `normalizeForWrite` collapses expanded values back to their writable form.
 */

/** Asset objects carry file metadata; references never do. */
function isAssetObject(v) {
  return (
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof v.uid === 'string' &&
    (typeof v.filename === 'string' ||
      typeof v.content_type === 'string' ||
      typeof v.file_size === 'string' ||
      typeof v.file_size === 'number')
  );
}

/** An expanded or shorthand reference. */
function isReferenceObject(v) {
  return (
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    typeof v.uid === 'string' &&
    typeof v._content_type_uid === 'string'
  );
}

/**
 * Keys the API returns but rejects (or silently ignores) on write. Dropping
 * them keeps nested group/block payloads acceptable.
 */
const READ_ONLY_KEYS = new Set([
  '_version',
  '_in_progress',
  '_metadata',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'publish_details',
  'ACL',
  'stackHeaders',
  'urlPath',
  '_owner',
  '_embedded_items',
]);

export function normalizeForWrite(value) {
  if (Array.isArray(value)) return value.map(normalizeForWrite);

  if (value && typeof value === 'object') {
    // Order matters: a reference also has `uid`, so test it before assets.
    if (isReferenceObject(value)) {
      return { uid: value.uid, _content_type_uid: value._content_type_uid };
    }
    if (isAssetObject(value)) return value.uid;

    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (READ_ONLY_KEYS.has(k)) continue;
      out[k] = normalizeForWrite(v);
    }
    return out;
  }

  return value;
}
