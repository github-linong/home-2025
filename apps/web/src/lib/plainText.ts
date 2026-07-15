/** Strip Markdown so card/search excerpts show readable plain text. */
export function toPlainText(input: string, maxLen = 180): string {
  let s = String(input || "");
  if (!s) return "";

  // Fenced code (closed or truncated mid-excerpt) → drop
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/```[\s\S]*$/g, " ");
  s = s.replace(/(?:^|\n)( {4,}|\t).+(?=\n|$)/g, " ");
  // Images / links (closed or truncated mid-excerpt)
  s = s.replace(/!\[[^\]]*]\([^)]*\)?/g, " ");
  s = s.replace(/\[([^\]]+)]\([^)]*\)?/g, "$1");
  // Inline code → keep inner text; drop dangling backticks
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/`+/g, "");
  // Headings (line-start or mid-string like "### 解答思路" in one-line excerpts)
  s = s.replace(/(^|\s)#{1,6}\s+/g, "$1");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  s = s.replace(/^\s*[-*+]\s+/gm, "");
  s = s.replace(/^\s*\d+\.\s+/gm, "");
  // Emphasis / strikethrough markers
  s = s.replace(/(\*\*|__|~~|\*|_)/g, "");
  // HTML tags (rare in descriptions)
  s = s.replace(/<\/?[^>]+>/g, " ");
  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  if (maxLen > 0 && s.length > maxLen) {
    const clipped = s.slice(0, maxLen);
    const cut = clipped.replace(/\s+\S*$/, "").trimEnd();
    s = `${cut || clipped.trimEnd()}…`;
  }
  return s;
}
