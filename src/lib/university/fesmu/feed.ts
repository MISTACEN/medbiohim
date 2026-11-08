/**
 * Пресс-центр FESMU: новости, объявления, события — парсинг и кэш
 * (ЗАДАЧА A3: вынесено из монолита fesmu.ts).
 */
import {
  FEED_LABELS,
  FEED_SOURCES,
  SECTION_LABELS,
} from "../portals";
import type { Feed, FeedItem, FeedKind } from "../types";
import {
  CACHE_TTL_MS,
  MAX_FEED_ITEMS,
  PARSE_ERROR,
  attrValue,
  cleanText,
  decodeEntities,
  extractDateText,
  fesmuFetch,
} from "./_shared";
import { readThrough } from "./cache";
/**
 * Path segment of the parsed feed (contract §1.3): a news page must never
 * accept `/press-center/events/...`, so the section is part of the pattern.
 */
const FEED_SECTION_PATH: Record<FeedKind, string> = {
  news: "news",
  announcements: "announce",
  events: "events",
};

function feedItemPath(kind: FeedKind): RegExp {
  return new RegExp(`^/press-center/${FEED_SECTION_PATH[kind]}/([^/]+)/([^/?#]+)/?$`, "i");
}

/** Splits a list page into Bitrix cards; the last card stops at `</section>`. */
export function splitFeedBlocks(html: string): string[] {
  const marker = "iblock-list-item-wrap";
  const blocks: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = html.indexOf(marker, cursor);
    if (start === -1) break;
    let end = html.indexOf(marker, start + marker.length);
    if (end === -1) end = html.length;
    const sectionEnd = html.indexOf("</section>", start);
    if (sectionEnd !== -1 && sectionEnd < end) end = sectionEnd;
    blocks.push(html.slice(start, end));
    cursor = start + marker.length;
  }
  return blocks;
}

function feedTitle(block: string): string {
  const areaLabel = block.match(/area-label\s*=\s*"([^"]*)"/i);
  const fromArea = areaLabel ? cleanText(areaLabel[1]) : "";
  if (fromArea) return fromArea;
  for (const name of ["data-title", "title", "alt"]) {
    const value = attrValue(block, name);
    const text = value ? cleanText(value) : "";
    if (text) return text;
  }
  const anchorPattern = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(block)) !== null) {
    const text = cleanText(match[1]);
    if (text) return text;
  }
  return "";
}

/**
 * First href of the card that belongs to the feed being parsed (V-2):
 * returns the absolute URL plus the mapped section label, or null.
 */
function feedItemUrl(block: string, sourceUrl: string, kind: FeedKind): { url: string; section: string | null } | null {
  const pattern = feedItemPath(kind);
  const hrefPattern = /href\s*=\s*"([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(block)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("#")) continue;
    let resolved: URL;
    try {
      resolved = new URL(decodeEntities(href), sourceUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
    const sectionMatch = pattern.exec(resolved.pathname);
    if (!sectionMatch) continue;
    resolved.hash = "";
    const slug = sectionMatch[1];
    return { url: resolved.toString(), section: SECTION_LABELS[slug] ?? slug };
  }
  return null;
}

/** Parses one press-center list page; never throws. */
export function parseFeedItems(html: string, kind: FeedKind, sourceUrl: string): FeedItem[] {
  if (typeof html !== "string" || html.length === 0) return [];
  const items: FeedItem[] = [];
  const seen = new Set<string>();
  for (const block of splitFeedBlocks(html)) {
    const title = feedTitle(block);
    if (!title) continue;
    const target = feedItemUrl(block, sourceUrl, kind);
    if (!target || seen.has(target.url)) continue;
    seen.add(target.url);
    const date = extractDateText(block);
    items.push({
      title,
      url: target.url,
      date: date ? date.display : null,
      date_iso: date ? date.iso : null,
      section: target.section,
      source: sourceUrl,
      kind,
    });
    if (items.length >= MAX_FEED_ITEMS) break;
  }
  return items;
}

export async function fetchFeed(kind: FeedKind, options: { force?: boolean } = {}): Promise<Feed> {
  const source = FEED_SOURCES[kind];
  const label = FEED_LABELS[kind];
  const result = await readThrough<FeedItem[]>(
    `feed:${kind}`,
    CACHE_TTL_MS,
    async () => {
      const response = await fesmuFetch(source);
      if (!response.ok) return { value: null, error: response.error ?? `HTTP ${response.status}` };
      const items = parseFeedItems(response.body, kind, source);
      if (items.length === 0) return { value: null, error: PARSE_ERROR };
      return { value: items, error: null };
    },
    options.force === true,
  );
  return {
    source,
    label,
    items: result.value ?? [],
    error: result.error,
    cached: result.cached,
    stale: result.stale,
    fetched_at: result.fetched_at,
  };
}

/* ------------------------------------------------------------------ *
 * Documents: faculty pages and the schedule index (contract §1.4)
 * ------------------------------------------------------------------ */

