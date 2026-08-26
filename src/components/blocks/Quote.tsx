import type { QuoteBlock } from "../../types";
import { cslp } from "../../utils/cslp";

export default function Quote({ block }: { block: QuoteBlock }) {
  const t = (block.$ ?? {}) as Record<string, unknown>;
  return (
    <section className="pull-quote">
      <figure className="wrap pull-quote__inner">
        {block.quote && (
          <blockquote {...cslp(t.quote)} className="pull-quote__text">
            {block.quote}
          </blockquote>
        )}
        <figcaption className="pull-quote__by">
          {block.avatar?.url && (
            <img
              {...cslp(t.avatar)}
              className="pull-quote__avatar"
              src={block.avatar.url}
              alt={block.attribution || ""}
            />
          )}
          <span>
            {block.attribution && (
              <strong {...cslp(t.attribution)}>{block.attribution}</strong>
            )}
            {block.role && (
              <span {...cslp(t.role)} className="pull-quote__role">
                {block.role}
              </span>
            )}
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
