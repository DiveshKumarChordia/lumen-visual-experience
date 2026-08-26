import { Link } from "react-router-dom";
import type { FooterEntry } from "../types";
import { cslp } from "../utils/cslp";

export default function Footer({ footer }: { footer: FooterEntry | null }) {
  if (!footer) return <footer className="site-footer" />;
  const t = (footer.$ ?? {}) as Record<string, unknown>;

  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <div className="site-footer__brand">
          {footer.tagline && (
            <p {...cslp(t.tagline)} className="site-footer__tagline">
              {footer.tagline}
            </p>
          )}
          {footer.copyright && (
            <p {...cslp(t.copyright)} className="site-footer__copy">
              {footer.copyright}
            </p>
          )}
        </div>

        <div {...cslp(t.link_columns)} className="site-footer__cols">
          {footer.link_columns?.map((col, i) => {
            const ct = (col.$ ?? {}) as Record<string, unknown>;
            return (
              <div
                key={i}
                {...cslp(t[`link_columns__${i}`])}
                className="site-footer__col"
              >
                {col.heading && (
                  <h4 {...cslp(ct.heading)} className="site-footer__col-heading">
                    {col.heading}
                  </h4>
                )}
                <div {...cslp(ct.links)}>
                  {col.links?.map((link, j) => (
                    <Link
                      key={j}
                      {...cslp(ct[`links__${j}`])}
                      className="site-footer__link"
                      to={link.target?.href || "/"}
                    >
                      {link.target?.title}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
