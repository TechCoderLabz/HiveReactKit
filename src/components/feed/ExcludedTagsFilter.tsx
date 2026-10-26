/**
 * ExcludedTagsFilter — lets a user hide snaps carrying tags they dislike.
 *
 * - `normalizeTag` lower-cases and strips '#' and all whitespace, so
 *   "I grew" ≡ "igrew" and "#Scroll Life" ≡ "scrolllife".
 * - `getPostTags` collects `json_metadata.tags` (object or JSON string)
 *   plus inline `#hashtags` from the body.
 * - `filterPostsByExcludedTags` drops any post whose tags intersect the
 *   excluded set. The source array is never mutated, so the stored feed
 *   data is untouched — only what gets rendered changes.
 * - `useExcludedTags` is controlled (`value` + `onChange`) or falls back to
 *   localStorage (`hrk:snaps:excludedTags`).
 * - `<ExcludedTagsManager/>` is the chip + input UI.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EyeOff, Plus, X, ChevronDown } from 'lucide-react';
import type { Post } from '@/types/post';

export const EXCLUDED_TAGS_STORAGE_KEY = 'hrk:snaps:excludedTags';

export function normalizeTag(tag: string): string {
  return String(tag ?? '').toLowerCase().replace(/[#\s]+/g, '');
}

const HASHTAG_RE = /(?:^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_-]+)/gu;

export function getPostTags(post: Pick<Post, 'json_metadata' | 'body'> & { category?: string }): string[] {
  const out = new Set<string>();
  let meta: unknown = post?.json_metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch { meta = null; }
  }
  const tags = (meta as { tags?: unknown } | null)?.tags;
  if (Array.isArray(tags)) {
    for (const t of tags) if (typeof t === 'string') { const n = normalizeTag(t); if (n) out.add(n); }
  } else if (typeof tags === 'string') {
    const n = normalizeTag(tags); if (n) out.add(n);
  }
  if (typeof post?.body === 'string') {
    for (const m of post.body.matchAll(HASHTAG_RE)) { const n = normalizeTag(m[1]); if (n) out.add(n); }
  }
  return [...out];
}

export function filterPostsByExcludedTags<T extends Pick<Post, 'json_metadata' | 'body'>>(
  posts: T[],
  excludedTags: string[] | undefined | null,
): T[] {
  if (!excludedTags || excludedTags.length === 0) return posts;
  const ex = new Set(excludedTags.map(normalizeTag).filter(Boolean));
  if (ex.size === 0) return posts;
  return posts.filter((p) => !getPostTags(p).some((t) => ex.has(t)));
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) { const n = normalizeTag(t); if (n && !seen.has(n)) { seen.add(n); out.push(n); } }
  return out;
}

function readStored(key: string): string[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? dedupe(arr.filter((x) => typeof x === 'string')) : [];
  } catch { return []; }
}

export function useExcludedTags(
  value?: string[],
  onChange?: (tags: string[]) => void,
  storageKey: string = EXCLUDED_TAGS_STORAGE_KEY,
): [string[], (tags: string[]) => void] {
  const controlled = Array.isArray(value);
  const [internal, setInternal] = useState<string[]>(() => (controlled ? [] : readStored(storageKey)));
  useEffect(() => {
    if (controlled) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(internal)); } catch { /* ignore */ }
  }, [controlled, internal, storageKey]);
  const tags = useMemo(() => (controlled ? dedupe(value!) : internal), [controlled, value, internal]);
  const setTags = useCallback((next: string[]) => {
    const clean = dedupe(next);
    if (!controlled) setInternal(clean);
    onChange?.(clean);
  }, [controlled, onChange]);
  return [tags, setTags];
}

export interface ExcludedTagsManagerProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Start expanded (default: collapsed unless the list is empty). */
  defaultOpen?: boolean;
  /** Number of posts currently hidden by the filter, shown as a hint. */
  hiddenCount?: number;
}

export function ExcludedTagsManager({ tags, onChange, defaultOpen, hiddenCount }: ExcludedTagsManagerProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen ?? false);
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map(normalizeTag).filter(Boolean);
    if (parts.length) onChange([...tags, ...parts]);
    setDraft('');
  };
  return (
    <div className="rounded-xl border border-[var(--hrk-border-default)] bg-[var(--hrk-bg-surface)]" data-testid="excluded-tags-manager">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-[var(--hrk-text-primary)]"
      >
        <EyeOff className="h-4 w-4 text-[var(--hrk-text-tertiary)]" />
        <span>Muted tags</span>
        {tags.length > 0 && (
          <span className="rounded-full bg-[var(--hrk-bg-hover)] px-2 py-0.5 text-[11px] text-[var(--hrk-text-secondary)]">{tags.length}</span>
        )}
        {!!hiddenCount && hiddenCount > 0 && (
          <span className="text-[11px] text-[var(--hrk-text-tertiary)]">· {hiddenCount} hidden</span>
        )}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-[var(--hrk-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-[var(--hrk-border-default)]/60 px-3 py-2.5">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); add(); }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a tag to hide, e.g. music"
              aria-label="Tag to hide"
              className="min-w-0 flex-1 rounded-lg border border-[var(--hrk-border-default)] bg-[var(--hrk-bg-app)] px-3 py-1.5 text-sm text-[var(--hrk-text-primary)] placeholder:text-[var(--hrk-text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--hrk-brand)]"
            />
            <button
              type="submit"
              disabled={!normalizeTag(draft)}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--hrk-border-default)] bg-[var(--hrk-bg-hover)] px-3 py-1.5 text-xs font-semibold text-[var(--hrk-text-primary)] disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
          {tags.length === 0 ? (
            <p className="text-xs text-[var(--hrk-text-tertiary)]">No muted tags. Snaps with a muted tag are hidden from this feed.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border border-[var(--hrk-border-default)] bg-[var(--hrk-bg-hover)] px-2.5 py-1 text-xs text-[var(--hrk-text-primary)]">
                  #{t}
                  <button type="button" aria-label={`Unmute ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="text-[var(--hrk-text-tertiary)] hover:text-[var(--hrk-text-primary)]">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button type="button" onClick={() => onChange([])} className="ml-1 text-xs font-medium text-[var(--hrk-text-tertiary)] underline-offset-2 hover:underline">
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ExcludedTagsManager;
