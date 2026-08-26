/**
 * Field builders.
 *
 * One builder per Visual-Builder-editable field type. The authoritative list is
 * the SDK's own resolver:
 *   live-preview-sdk/src/visualBuilder/utils/getFieldType.ts
 *   live-preview-sdk/src/visualBuilder/utils/types/index.types.ts (FieldDataType)
 *
 * Shapes are copied from the VB e2e fixtures
 * (visual-builder/tests/data/content-types/allFieldsSingle.ts and friends), not
 * invented — several types are distinguished only by `field_metadata` flags:
 *
 *   text + multiline:true        -> MULTILINE
 *   text + allow_rich_text:true  -> HTML_RTE
 *   text + markdown:true         -> MARKDOWN_RTE
 *   text + enum{}                -> SELECT
 *   text + uid "url" + _default  -> URL
 *   text (none of the above)     -> SINGLELINE
 *   json + allow_json_rte:true   -> JSON_RTE
 */

const common = ({ mandatory = false, multiple = false, unique = false } = {}) => ({
  mandatory,
  multiple,
  non_localizable: false,
  unique,
});

/** Reserved uid `title`, flagged `_default` so it is the entry display name. */
export const title = (display_name = 'Title') => ({
  data_type: 'text',
  display_name,
  uid: 'title',
  field_metadata: { _default: true, version: 3 },
  ...common({ mandatory: true, unique: true }),
});

/**
 * Reserved uid `url` with `_default`. This pair is what makes the field resolve
 * as FieldDataType.URL, and what makes the content type a "page".
 */
export const url = (display_name = 'URL') => ({
  data_type: 'text',
  display_name,
  uid: 'url',
  field_metadata: { _default: true, version: 3 },
  ...common(),
});

export const singleline = (uid, display_name, opts = {}) => ({
  data_type: 'text',
  display_name,
  uid,
  field_metadata: { description: '', default_value: '', version: 3 },
  format: '',
  error_messages: { format: '' },
  ...common(opts),
});

export const multiline = (uid, display_name, opts = {}) => ({
  data_type: 'text',
  display_name,
  uid,
  field_metadata: { description: '', default_value: '', multiline: true, version: 3 },
  format: '',
  error_messages: { format: '' },
  ...common(opts),
});

/** Rich text stored as HTML. */
export const htmlRte = (uid, display_name, opts = {}) => ({
  data_type: 'text',
  display_name,
  uid,
  field_metadata: {
    allow_rich_text: true,
    description: '',
    multiline: false,
    rich_text_type: 'advanced',
    options: [],
    version: 3,
  },
  ...common(opts),
});

export const markdown = (uid, display_name, opts = {}) => ({
  data_type: 'text',
  display_name,
  uid,
  field_metadata: { description: '', markdown: true, version: 3 },
  ...common(opts),
});

/** Dropdown. `choices` is a list of plain strings. */
export const select = (uid, display_name, choices, opts = {}) => ({
  data_type: 'text',
  display_name,
  display_type: 'dropdown',
  enum: {
    advanced: false,
    choices: choices.map((value) => ({ value })),
  },
  uid,
  field_metadata: { description: '', default_value: choices[0] ?? '', version: 3 },
  ...common(opts),
});

/** Supercharged (JSON) RTE — rendered via Utils.jsonToHTML on the client. */
export const jsonRte = (uid, display_name, opts = {}) => ({
  data_type: 'json',
  display_name,
  uid,
  field_metadata: {
    allow_json_rte: true,
    embed_entry: false,
    description: '',
    default_value: '',
    multiline: false,
    rich_text_type: 'advanced',
    options: [],
  },
  format: '',
  error_messages: { format: '' },
  reference_to: ['sys_assets'],
  ...common(opts),
});

export const number = (uid, display_name, opts = {}) => ({
  data_type: 'number',
  display_name,
  uid,
  field_metadata: { description: '', default_value: '' },
  ...common(opts),
});

export const boolean = (uid, display_name, opts = {}) => ({
  data_type: 'boolean',
  display_name,
  uid,
  field_metadata: { description: '', default_value: false },
  ...common(opts),
});

export const isodate = (uid, display_name, opts = {}) => ({
  data_type: 'isodate',
  display_name,
  uid,
  startDate: null,
  endDate: null,
  field_metadata: { description: '', default_value: {} },
  ...common(opts),
});

/** Asset picker. Entry value is the asset object; `url` is what you render. */
export const file = (uid, display_name, opts = {}) => ({
  data_type: 'file',
  display_name,
  uid,
  extensions: [],
  field_metadata: { description: '', rich_text_type: 'standard' },
  ...common(opts),
});

/** Title + href pair. Entry value is `{ title, href }` — NOT `{ title, url }`. */
export const link = (uid, display_name, opts = {}) => ({
  data_type: 'link',
  display_name,
  uid,
  field_metadata: { description: '', default_value: { title: '', url: '' } },
  ...common(opts),
});

/** Entry value is `[{ uid, _content_type_uid }]`. */
export const reference = (uid, display_name, to, opts = {}) => ({
  data_type: 'reference',
  display_name,
  uid,
  reference_to: to,
  field_metadata: { ref_multiple: opts.refMultiple ?? true, ref_multiple_content_types: true },
  ...common({ ...opts, multiple: false }),
});

export const group = (uid, display_name, schema, opts = {}) => ({
  data_type: 'group',
  display_name,
  uid,
  schema,
  field_metadata: { description: '', instruction: '' },
  ...common({ multiple: true, ...opts }),
});

export const blocks = (uid, display_name, blockDefs) => ({
  data_type: 'blocks',
  display_name,
  uid,
  blocks: blockDefs,
  field_metadata: { instruction: '', description: '' },
  ...common({ multiple: true }),
});

/** Reusable schema defined once as a global field, referenced by uid. */
export const globalField = (uid, display_name, referenceTo, opts = {}) => ({
  data_type: 'global_field',
  display_name,
  uid,
  reference_to: referenceTo,
  field_metadata: { description: '' },
  ...common(opts),
});

/**
 * Taxonomy field. Three constraints worth knowing:
 *  1. The uid is RESERVED as `taxonomies`.
 *  2. It is a ROOT-only field — it appears in `IContentTypeRootBlocks` but not
 *     `IContentTypeCommonBlocks`, so it cannot go inside a group or a block.
 *  3. The CMA validates `taxonomy_uid` on save, so the taxonomy must already
 *     exist before a content type carrying this field is created.
 *
 * Entry value is `[{ taxonomy_uid, term_uid }]`.
 *
 * Note the key is `taxonomies` — the SDK's own type spells it `taxanomies`,
 * which is a typo in the type definition; every fixture and the API use
 * `taxonomies`.
 */
export const taxonomy = (taxonomies, display_name = 'Taxonomies') => ({
  data_type: 'taxonomy',
  display_name,
  uid: 'taxonomies',
  taxonomies: taxonomies.map((t) => ({
    taxonomy_uid: t.uid,
    max_terms: t.maxTerms ?? 5,
    mandatory: false,
    multiple: true,
    non_localizable: false,
  })),
  field_metadata: { description: '', default_value: '' },
  format: '',
  error_messages: { format: '' },
  // The CMA rejects this field unless it is multiple:
  //   "The 'taxonomies' field should be multiple."
  ...common({ multiple: true }),
});
