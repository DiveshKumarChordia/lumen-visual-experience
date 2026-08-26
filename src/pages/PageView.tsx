import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import RenderBlocks from "../components/RenderBlocks";
import FetchDiagnostics from "../components/FetchDiagnostics";
import { getPage } from "../helper";
import {
  onEntryChange,
  setPageContext,
  unsubscribeOnEntryChange,
} from "../sdk/entry";
import type { PageEntry } from "../types";

export default function PageView() {
  const { pathname } = useLocation();
  const [page, setPage] = useState<PageEntry | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPage = async () => {
      try {
        const entry = await getPage(pathname);
        if (cancelled) return;
        setError(null);
        setPage(entry);
        setState(entry ? "ready" : "missing");

        // Tell Visual Builder which entry this page is, so the page navigation
        // bar and quick form open the right one.
        if (entry) {
          setPageContext({ entryUid: entry.uid, contentTypeUid: "page" });
        }
      } catch (err) {
        if (cancelled) return;
        // Log the whole object: the SDK attaches status and the request URL.
        console.error("[PageView] fetch failed", err);
        const e = err as { error_message?: string; message?: string; status?: number };
        setError(
          [e.status ? `HTTP ${e.status}` : null, e.error_message || e.message || JSON.stringify(err)]
            .filter(Boolean)
            .join(" — "),
        );
        setState("missing");
      }
    };

    fetchPage();
    // Re-fetch whenever the editor changes content in Visual Builder.
    const callbackUid = onEntryChange(fetchPage);

    return () => {
      cancelled = true;
      unsubscribeOnEntryChange(callbackUid);
    };
  }, [pathname]);

  if (state === "loading") return <div className="wrap state">Loading…</div>;

  if (state === "missing") {
    return (
      <FetchDiagnostics contentTypeUid="page" lookupUrl={pathname} error={error} />
    );
  }

  return (
    <main>
      <RenderBlocks
        components={page?.page_components}
        cslpMap={page?.$ as Record<string, unknown>}
      />
    </main>
  );
}
