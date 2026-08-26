import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";

import Header from "./components/Header";
import Footer from "./components/Footer";
import PageView from "./pages/PageView";
import BlogPostView from "./pages/BlogPostView";
import ApiExplorer from "./pages/ApiExplorer";
import { getFooter, getHeader } from "./helper";
import { onEntryChange, unsubscribeOnEntryChange } from "./sdk/entry";
import type { FooterEntry, HeaderEntry } from "./types";

export default function App() {
  const [header, setHeader] = useState<HeaderEntry | null>(null);
  const [footer, setFooter] = useState<FooterEntry | null>(null);

  useEffect(() => {
    const fetchChrome = async () => {
      try {
        const [h, f] = await Promise.all([getHeader(), getFooter()]);
        setHeader(h);
        setFooter(f);
      } catch (err) {
        console.error("[App] header/footer fetch failed", err);
      }
    };

    fetchChrome();
    // Header and footer are editable too, so they re-fetch on entry change.
    const callbackUid = onEntryChange(fetchChrome);
    return () => unsubscribeOnEntryChange(callbackUid);
  }, []);

  return (
    <div className="site">
      <Header header={header} />
      <Routes>
        {/* Not content-driven: a live view of the three read APIs. */}
        <Route path="/api-explorer" element={<ApiExplorer />} />
        {/* Blog posts live under /blog/*, everything else resolves as a Page. */}
        <Route path="/blog/*" element={<BlogPostView />} />
        <Route path="*" element={<PageView />} />
      </Routes>
      <Footer footer={footer} />
    </div>
  );
}
