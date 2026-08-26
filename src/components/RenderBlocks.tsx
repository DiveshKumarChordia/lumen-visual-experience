/**
 * Modular blocks renderer.
 *
 * Two conventions matter for Visual Builder, both taken from
 * visual-builder/test-resources/csr/src/components/render-components.tsx:
 *
 *  1. The container carries the FIELD's tag (`$.page_components`) and each child
 *     carries the INDEXED tag (`$["page_components__<i>"]`). Visual Builder uses
 *     the pair to offer add / reorder / delete on individual blocks.
 *
 *  2. When the field is empty the container needs
 *     `visual-builder__empty-block-parent`, otherwise the editor has nothing to
 *     hit and shows no "add block" affordance on a blank page.
 */
import { VB_EmptyBlockParentClass } from "@contentstack/live-preview-utils";
import type { PageComponent } from "../types";
import { cslp, type CslpMap } from "../utils/cslp";

import Hero from "./blocks/Hero";
import RichText from "./blocks/RichText";
import MarkdownSection from "./blocks/MarkdownSection";
import FeatureGrid from "./blocks/FeatureGrid";
import StatsBand from "./blocks/StatsBand";
import ImageText from "./blocks/ImageText";
import LatestPosts from "./blocks/LatestPosts";
import Faq from "./blocks/Faq";
import Quote from "./blocks/Quote";
import CtaBanner from "./blocks/CtaBanner";

const FIELD_UID = "page_components";

function Block({ component }: { component: PageComponent }) {
  if (component.hero) return <Hero block={component.hero} />;
  if (component.rich_text) return <RichText block={component.rich_text} />;
  if (component.markdown_section)
    return <MarkdownSection block={component.markdown_section} />;
  if (component.feature_grid) return <FeatureGrid block={component.feature_grid} />;
  if (component.stats_band) return <StatsBand block={component.stats_band} />;
  if (component.image_text) return <ImageText block={component.image_text} />;
  if (component.latest_posts) return <LatestPosts block={component.latest_posts} />;
  if (component.faq) return <Faq block={component.faq} />;
  if (component.quote) return <Quote block={component.quote} />;
  if (component.cta_banner) return <CtaBanner block={component.cta_banner} />;
  return null;
}

export default function RenderBlocks({
  components,
  cslpMap,
}: {
  components?: PageComponent[];
  cslpMap?: CslpMap;
}) {
  const map = (cslpMap ?? {}) as Record<string, unknown>;
  const hasBlocks = Boolean(components?.length);

  return (
    <div
      {...cslp(map[FIELD_UID])}
      className={
        hasBlocks ? "blocks" : `blocks ${VB_EmptyBlockParentClass}`
      }
    >
      {components?.map((component, index) => (
        <div
          key={`${FIELD_UID}-${index}`}
          {...cslp(map[`${FIELD_UID}__${index}`])}
          className="block"
        >
          <Block component={component} />
        </div>
      ))}
    </div>
  );
}
