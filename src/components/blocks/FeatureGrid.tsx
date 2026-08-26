import type { FeatureGridBlock } from "../../types";
import { cslp } from "../../utils/cslp";

export default function FeatureGrid({ block }: { block: FeatureGridBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  const columns = Math.min(Math.max(block.columns || 3, 1), 4);

  return (
    <section className="features">
      <div className="wrap">
        {block.heading && (
          <h2 {...cslp(t.heading)} className="section-heading">
            {block.heading}
          </h2>
        )}
        {block.description && (
          <p {...cslp(t.description)} className="section-sub">
            {block.description}
          </p>
        )}
        {/* Group items are indexed like blocks: `features__<i>`. */}
        <div
          {...cslp(t.features)}
          className="features__grid"
          style={{ "--cols": columns } as React.CSSProperties}
        >
          {block.features?.map((feature, i) => {
            const ft = (feature.$ ?? {}) as Record<string, unknown>;
            return (
              <article key={i} {...cslp(t[`features__${i}`])} className="feature">
                {feature.icon && (
                  <span {...cslp(ft.icon)} className="feature__icon">
                    {feature.icon}
                  </span>
                )}
                {feature.title && (
                  <h3 {...cslp(ft.title)} className="feature__title">
                    {feature.title}
                  </h3>
                )}
                {feature.description && (
                  <p {...cslp(ft.description)} className="feature__desc">
                    {feature.description}
                  </p>
                )}
                {feature.learn_more?.title && (
                  <a
                    {...cslp(ft.learn_more)}
                    className="feature__link"
                    href={feature.learn_more.href || "#"}
                  >
                    {feature.learn_more.title} →
                  </a>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
