import type { ImageTextBlock } from "../../types";
import { cslp } from "../../utils/cslp";

/** HTML RTE — the value is already an HTML string. */
export default function ImageText({ block }: { block: ImageTextBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  return (
    <section className="split">
      <div
        className={`wrap split__inner${block.image_on_right ? " split__inner--reverse" : ""}`}
      >
        <div className="split__text">
          {block.heading && (
            <h2 {...cslp(t.heading)} className="section-heading">
              {block.heading}
            </h2>
          )}
          {block.body && (
            <div
              {...cslp(t.body)}
              className="split__body rte"
              dangerouslySetInnerHTML={{ __html: block.body }}
            />
          )}
        </div>
        <div {...cslp(t.image)} className="split__media">
          {block.image?.url ? (
            <img src={block.image.url} alt={block.image.title || ""} />
          ) : (
            <div className="split__placeholder" aria-hidden="true" />
          )}
        </div>
      </div>
    </section>
  );
}
