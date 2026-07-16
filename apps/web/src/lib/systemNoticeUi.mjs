import { readStorageKeyForScope, NOTICE_SCOPE } from "./systemNotices.mjs";

export const NOTICE_CHANGE_EVENT = "system-notice:change";

export function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatNoticeDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function levelToAlertClass(level) {
  if (level === "warning") return "alert-warning";
  if (level === "critical") return "alert-error";
  return "alert-info";
}

export function readNoticesFromDom() {
  const node = document.getElementById("system-notice-data");
  if (!node?.textContent) return [];
  try {
    const parsed = JSON.parse(node.textContent);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function readSeenSet() {
  const key = readStorageKeyForScope(NOTICE_SCOPE.PUBLIC);
  if (!key) return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v) => typeof v === "string" && v.trim().length > 0));
  } catch {
    return new Set();
  }
}

export function writeSeenSet(seen) {
  const key = readStorageKeyForScope(NOTICE_SCOPE.PUBLIC);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(Array.from(seen)));
}

export function getUnreadNotices(notices, seen = readSeenSet()) {
  return notices.filter((notice) => !seen.has(notice.id));
}

/** Banner only promotes the newest notice; older ones stay in the sidebar inbox. */
export function getBannerNotice(notices, seen = readSeenSet()) {
  if (!Array.isArray(notices) || notices.length === 0) return null;
  const newest = notices[0];
  if (!newest || seen.has(newest.id)) return null;
  return newest;
}

export function markNoticeRead(id) {
  if (!id) return;
  const seen = readSeenSet();
  if (seen.has(id)) return;
  seen.add(id);
  writeSeenSet(seen);
  document.dispatchEvent(new CustomEvent(NOTICE_CHANGE_EVENT));
}

export function renderNoticeListItem(notice, seen) {
  const unread = !seen.has(notice.id);
  const date = formatNoticeDay(notice.pubDate);
  return `<li>
    <a href="${escapeHtml(notice.url)}" class="block rounded-lg border border-base-300/70 px-3 py-2.5 no-underline transition-colors hover:bg-base-200/60 ${unread ? "bg-base-200/40" : ""}" data-notice-item-id="${escapeHtml(notice.id)}">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            ${unread ? '<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>' : ""}
            <div class="truncate text-sm font-medium">${escapeHtml(notice.title)}</div>
          </div>
          <div class="mt-0.5 line-clamp-2 text-xs opacity-70">${escapeHtml(notice.message)}</div>
        </div>
        ${unread ? '<span class="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] leading-none text-primary">未读</span>' : ""}
      </div>
      ${date ? `<time class="mt-1 block text-[11px] leading-normal opacity-45">${date}</time>` : ""}
    </a>
  </li>`;
}
