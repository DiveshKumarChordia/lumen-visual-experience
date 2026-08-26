/**
 * Minimal Markdown renderer for the `markdown` field type.
 *
 * Deliberately small and returns React elements rather than HTML, so no
 * `dangerouslySetInnerHTML` is involved. Covers what the seed content uses:
 * headings, unordered lists, `**bold**` and `` `code` ``.
 */
import type { ReactNode } from "react";

/** Splits on `**bold**` and `` `code` `` without a regex-replace into HTML. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let i = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));

    const token = match[0];
    if (token.startsWith("**")) {
      out.push(<strong key={`${keyPrefix}-b${i}`}>{token.slice(2, -2)}</strong>);
    } else {
      out.push(<code key={`${keyPrefix}-c${i}`}>{token.slice(1, -1)}</code>);
    }
    last = start + token.length;
    i += 1;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="md-list">
        {list.map((item, i) => (
          <li key={i}>{inline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();

    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    flushList();

    if (!line.trim()) return;

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const Tag = (`h${Math.min(level + 1, 6)}`) as "h2" | "h3" | "h4" | "h5" | "h6";
      blocks.push(<Tag key={`h-${i}`}>{inline(heading[2], `h-${i}`)}</Tag>);
      return;
    }

    blocks.push(<p key={`p-${i}`}>{inline(line, `p-${i}`)}</p>);
  });

  flushList();
  return <div className="md">{blocks}</div>;
}
