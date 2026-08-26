import { Link } from "react-router-dom";
import type { HeaderEntry } from "../types";
import { cslp } from "../utils/cslp";

export default function Header({ header }: { header: HeaderEntry | null }) {
  if (!header) return <header className="site-header" />;
  const t = (header.$ ?? {}) as Record<string, unknown>;

  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link to="/" className="brand">
          {header.logo?.url ? (
            <img
              {...cslp(t.logo)}
              className="brand__logo"
              src={header.logo.url}
              alt={header.brand_name || "Logo"}
            />
          ) : (
            <span className="brand__mark" aria-hidden="true" />
          )}
          <span className="brand__text">
            {header.brand_name && (
              <span {...cslp(t.brand_name)} className="brand__name">
                {header.brand_name}
              </span>
            )}
            {header.tagline && (
              <span {...cslp(t.tagline)} className="brand__tagline">
                {header.tagline}
              </span>
            )}
          </span>
        </Link>

        <nav {...cslp(t.navigation_links)} className="nav">
          {header.navigation_links?.map((link, i) => {
            const lt = (link.$ ?? {}) as Record<string, unknown>;
            return (
              <Link
                key={i}
                {...cslp(t[`navigation_links__${i}`])}
                className={`nav__link${link.emphasised ? " nav__link--em" : ""}`}
                to={link.target?.href || "/"}
              >
                <span {...cslp(lt.target)}>{link.target?.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
