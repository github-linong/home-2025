/**
 * Canonical topic labels shared by blog tags, demo tags, and demo categories.
 * Old category names map onto the short tag vocabulary used in search.
 */
export const CATEGORY_TO_TAG: Record<string, string> = {
  前端实验: "实验",
  思否配套: "SegmentFault",
  "Bug 复现": "测试",
  "移动端/H5": "移动端",
  "Vue 示例": "Vue",
  "React 示例": "React",
  "图形/媒体": "图形",
  "文件/AI": "文件 IO",
  "表单/输入": "表单",
  "CSS 布局": "CSS",
  "PDF/文档": "PDF",
  "交互/事件": "交互",
  "网络/HTTP": "HTTP",
};

/** Optional aliases so near-duplicate tags collapse in search chips. */
export const TAG_ALIASES: Record<string, string> = {
  ...CATEGORY_TO_TAG,
  正则表达式: "正则",
};

export function canonicalizeTag(raw: string | undefined | null): string | null {
  const tag = String(raw ?? "").trim();
  if (!tag) return null;
  return TAG_ALIASES[tag] ?? tag;
}

export function canonicalizeLabels(labels: Iterable<string | undefined | null>): string[] {
  const out = new Set<string>();
  for (const label of labels) {
    const canonical = canonicalizeTag(label);
    if (canonical) out.add(canonical);
  }
  return [...out];
}
