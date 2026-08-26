import type { CtaBannerBlock } from "../../types";
import { cslp } from "../../utils/cslp";

export default function CtaBanner({ block }: { block: CtaBannerBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  const tone = block.tone ?? "dark";

  return (
    <section className={`cta cta--${tone}`}>
      <div className="wrap cta__inner">
        {block.heading && (
          <h2 {...cslp(t.heading)} className="cta__heading">
            {block.heading}
          </h2>
        )}
        {block.body && (
          <p {...cslp(t.body)} className="cta__body">
            {block.body}
          </p>
        )}
        {block.button?.title && (
          <a
            {...cslp(t.button)}
            className={`btn ${tone === "light" ? "btn--primary" : "btn--light"}`}
            href={block.button.href || "#"}
          >
            {block.button.title}
          </a>
        )}
      </div>
    </section>
  );
}
