import type { MarkdownBlock } from "../../types";
import { cslp } from "../../utils/cslp";
import { Markdown } from "../../utils/markdown";

/** The `markdown` field type — rendered to React elements, not HTML. */
export default function MarkdownSection({ block }: { block: MarkdownBlock }) {
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
          <div {...cslp(t.body)} className="prose-block__body">
            <Markdown source={block.body} />
          </div>
        )}
      </div>
    </section>
  );
}
