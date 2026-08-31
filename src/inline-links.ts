export interface InlineLink {
  link: string;
  label: string;
  path: string | null;
  title: string;
}

export interface InlineLinkCacheEntry {
  link: string;
  displayText?: string | null;
}

export interface InlineLinkTarget {
  path: string;
  title: string;
}

export type InlineLinkResolver = (link: string) => InlineLinkTarget | null;

export function extractInlineLinks(
  entries: InlineLinkCacheEntry[],
  resolve: InlineLinkResolver,
): InlineLink[] {
  const result: InlineLink[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const link = entry.link.trim();
    if (!link || seen.has(link)) continue;
    seen.add(link);
    const target = resolve(link);
    const label = entry.displayText?.trim() || target?.title || link;
    result.push({
      link,
      label,
      path: target?.path ?? null,
      title: target?.title ?? link,
    });
  }
  return result;
}

export function scanInlineLinks(
  entries: InlineLinkCacheEntry[],
  sourcePath: string,
  resolve: (link: string, sourcePath: string) => InlineLinkTarget | null,
): InlineLink[] {
  return extractInlineLinks(entries, (link) => resolve(link, sourcePath));
}

export function hasInlineLinks(links: InlineLink[]): boolean {
  return links.length > 0;
}

export function linkIndicatorLabel(title: string, links: InlineLink[]): string {
  return `显示 ${title} 的正文双链（${links.length}）`;
}

export function linkIndicatorState(open: boolean): "is-lit" | "is-unlit" {
  return open ? "is-lit" : "is-unlit";
}
