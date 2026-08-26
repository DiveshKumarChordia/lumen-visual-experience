import type { FaqBlock } from "../../types";
import { cslp } from "../../utils/cslp";

export default function Faq({ block }: { block: FaqBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  return (
    <section className="faq">
      <div className="wrap faq__inner">
        {block.heading && (
          <h2 {...cslp(t.heading)} className="section-heading">
            {block.heading}
          </h2>
        )}
        <div {...cslp(t.items)} className="faq__list">
          {block.items?.map((item, i) => {
            const it = (item.$ ?? {}) as Record<string, unknown>;
            return (
              <details key={i} {...cslp(t[`items__${i}`])} className="faq__item">
                <summary {...cslp(it.question)} className="faq__q">
                  {item.question}
                </summary>
                {item.answer && (
                  <p {...cslp(it.answer)} className="faq__a">
                    {item.answer}
                  </p>
                )}
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
