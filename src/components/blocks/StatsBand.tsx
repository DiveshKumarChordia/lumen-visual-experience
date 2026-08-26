import type { StatsBandBlock } from "../../types";
import { cslp } from "../../utils/cslp";

export default function StatsBand({ block }: { block: StatsBandBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  return (
    <section className="stats">
      <div className="wrap">
        {block.heading && (
          <h2 {...cslp(t.heading)} className="section-heading section-heading--sm">
            {block.heading}
          </h2>
        )}
        <div {...cslp(t.stats)} className="stats__row">
          {block.stats?.map((stat, i) => {
            const st = (stat.$ ?? {}) as Record<string, unknown>;
            return (
              <div key={i} {...cslp(t[`stats__${i}`])} className="stat">
                {stat.value && (
                  <div {...cslp(st.value)} className="stat__value">
                    {stat.value}
                  </div>
                )}
                {stat.label && (
                  <div {...cslp(st.label)} className="stat__label">
                    {stat.label}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
