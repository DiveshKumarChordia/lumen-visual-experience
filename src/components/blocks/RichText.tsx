import type { RichTextBlock } from "../../types";
import { cslp } from "../../utils/cslp";

/** JSON RTE, converted to HTML by Utils.jsonToHTML in the data helper. */
export default function RichText({ block }: { block: RichTextBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  return (
    <section className="prose-block">
      <div className="wrap prose-block__inner">
        {block.heading && (
          <h2 {...cslp(t.heading)} className="section-heading">
            {block.heading}
          </h2>
        )}
        {block.body && (
          <div
            {...cslp(t.body)}
            className="prose-block__body rte"
            dangerouslySetInnerHTML={{ __html: block.body }}
          />
        )}
      </div>
    </section>
  );
}
