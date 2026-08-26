import { MISSING_CONFIG } from "../config";

/**
 * Shown instead of the site when .env.local has not been generated yet, so the
 * failure is actionable rather than a blank page.
 */
export default function SetupNotice() {
  return (
    <main className="setup">
      <div className="setup__card">
        <h1 className="setup__title">Not configured yet</h1>
        <p className="setup__body">
          The site has no Contentstack credentials, so there is nothing to fetch.
          Generate them by bootstrapping the stack:
        </p>
        <pre className="setup__code">
          cp .env.example .env{"\n"}
          {"# fill in CS_INSTANCE, CS_USER_EMAIL, CS_USER_PASSWORD"}
          {"\n"}npm run bootstrap{"\n"}npm run dev
        </pre>
        <p className="setup__body">
          Missing from <code>.env.local</code>:
        </p>
        <ul className="setup__list">
          {MISSING_CONFIG.map((key) => (
            <li key={key}>
              <code>{key}</code>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
