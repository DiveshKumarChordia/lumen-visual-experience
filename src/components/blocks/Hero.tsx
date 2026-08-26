import type { HeroBlock } from "../../types";
import { cslp } from "../../utils/cslp";

export default function Hero({ block }: { block: HeroBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  const bg = block.background_image?.url;
  const align = block.alignment === "left" ? "left" : "center";
  const height = block.height ?? "standard";

  return (
    <section
      className={`hero hero--${align} hero--${height}`}
      style={bg ? { backgroundImage: `url(${bg})` } : undefined}
    >
      <div className="wrap hero__inner">
        {block.heading && (
          <h1 {...cslp(t.heading)} className="hero__heading">
            {block.heading}
          </h1>
        )}
        {block.subheading && (
          <p {...cslp(t.subheading)} className="hero__sub">
            {block.subheading}
          </p>
        )}
        {/* `link` field: the value is { title, href }. */}
        {block.cta?.title && (
          <a
            {...cslp(t.cta)}
            className="btn btn--primary"
            href={block.cta.href || "#"}
          >
            {block.cta.title}
          </a>
        )}
      </div>
    </section>
  );
}
