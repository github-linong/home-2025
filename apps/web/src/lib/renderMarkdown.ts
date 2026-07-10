import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Render Q&A sidecar markdown to HTML (headings, lists, code, inline code, links). */
export function renderMarkdown(md: string) {
  if (!md?.trim()) return "";
  return marked.parse(md, { async: false }) as string;
}
