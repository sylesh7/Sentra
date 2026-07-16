import * as cheerio from "cheerio";
import type { PageContent } from "./types.js";

const HIDDEN_STYLE_PATTERN = /display\s*:\s*none|visibility\s*:\s*hidden/i;

/**
 * Real HTML parsing (cheerio, a real DOM parser -- not regex scraping) into the same
 * structured PageContent shape the quarantine reader and quorum already consume. This
 * is the piece that lets getTrust() accept arbitrary real-world HTML from an external
 * caller instead of only hand-authored fixture objects.
 *
 * Extraction rules mirror the exact Zscaler Campaign 1/2 technique this project
 * defends against:
 *   - JSON-LD: <script type="application/ld+json"> contents, verbatim.
 *   - Open Graph: <meta property="og:*"> tags.
 *   - CSS-hidden: elements with inline display:none / visibility:hidden, or a bare
 *     `hidden` attribute -- kept as their RAW outer HTML (matching the existing
 *     hand-authored fixtures' convention) so the quarantine reader can see it was
 *     hidden markup, not just recover the bare text.
 *   - Visible text: everything else, after removing script/style tags and the
 *     hidden elements above -- this is deliberately what's LEFT, not a separate scan,
 *     so a field can never end up counted as both "visible" and "hidden".
 *
 * Non-HTML input (plain text, JSON) is not an error: cheerio wraps it in a synthetic
 * <html><body>, so it degrades to "everything is visible_text", which is the correct,
 * safe behavior for such content.
 */
export function parseHtmlToPageContent(url: string, html: string): PageContent {
  const $ = cheerio.load(html);

  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).html();
    if (text?.trim()) jsonLd.push(text.trim());
  });

  const openGraphTags: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const property = $(el).attr("property");
    const content = $(el).attr("content");
    if (property && content) openGraphTags[property] = content;
  });

  const hiddenCssContent: string[] = [];
  $("[style], [hidden]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    const isHidden = $(el).attr("hidden") !== undefined || HIDDEN_STYLE_PATTERN.test(style);
    if (isHidden && $(el).text().trim()) {
      hiddenCssContent.push($.html(el));
    }
  });

  // Strip script/style and the hidden elements just captured before reading visible
  // text, so nothing is double-counted as both hidden and visible.
  $("script, style").remove();
  $("[style], [hidden]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    if ($(el).attr("hidden") !== undefined || HIDDEN_STYLE_PATTERN.test(style)) {
      $(el).remove();
    }
  });

  const bodyText = $("body").text();
  const visibleText = (bodyText || $.root().text()).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

  return { url, visibleText, jsonLd, openGraphTags, hiddenCssContent };
}
