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
 * - `<ExcludedTagsPanel/>` is the chip + input UI; `<MutedTagsButton/>` is a
 *   compact icon button (with count badge) that opens the panel in a popover
 *   (bottom sheet on narrow screens). `<ExcludedTagsManager/>` is the older
 *   collapsible card wrapper, kept for compatibility.
 * - Uncontrolled hook instances stay in sync with each other (same tab) via a
 *   window event, so a header button and the feed share one list.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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

const SYNC_EVENT = 'hrk:excludedTags:change';
const HIDDEN_EVENT = 'hrk:excludedTags:hidden';
let lastHiddenCount = 0;

function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Feed side: report how many posts the filter currently hides. */
export function publishExcludedHiddenCount(count: number): void {
  if (count === lastHiddenCount) return;
  lastHiddenCount = count;
  try { window.dispatchEvent(new CustomEvent(HIDDEN_EVENT, { detail: count })); } catch { /* ignore */ }
}

/** Button side: read the hidden count the feed last reported. */
export function useExcludedHiddenCount(): number {
  const [n, setN] = useState(lastHiddenCount);
  useEffect(() => {
    const h = (e: Event) => setN(Number((e as CustomEvent<number>).detail) || 0);
    window.addEventListener(HIDDEN_EVENT, h);
    setN(lastHiddenCount);
    return () => window.removeEventListener(HIDDEN_EVENT, h);
  }, []);
  return n;
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
  useEffect(() => {
    if (controlled || typeof window === 'undefined') return;
    const sync = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; tags: string[] }>).detail;
      if (d && d.key === storageKey) setInternal((cur) => (sameTags(cur, d.tags) ? cur : d.tags));
    };
    const onStorage = (e: StorageEvent) => { if (e.key === storageKey) setInternal(readStored(storageKey)); };
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(SYNC_EVENT, sync); window.removeEventListener('storage', onStorage); };
  }, [controlled, storageKey]);
  const tags = useMemo(() => (controlled ? dedupe(value!) : internal), [controlled, value, internal]);
  const setTags = useCallback((next: string[]) => {
    const clean = dedupe(next);
    if (!controlled) {
      setInternal(clean);
      try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: storageKey, tags: clean } })); } catch { /* ignore */ }
    }
    onChange?.(clean);
  }, [controlled, onChange, storageKey]);
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

export interface ExcludedTagsPanelProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  hiddenCount?: number;
  /** Focus the input on mount (used by the popover). */
  autoFocus?: boolean;
}

/** Input + Add, removable chips, Clear all, hidden count. */
export function ExcludedTagsPanel({ tags, onChange, hiddenCount, autoFocus }: ExcludedTagsPanelProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map(normalizeTag).filter(Boolean);
    if (parts.length) onChange([...tags, ...parts]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input
          value={draft}
          autoFocus={autoFocus}
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
              <button type="button" aria-label={`Unmute ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="rounded text-[var(--hrk-text-tertiary)] hover:text-[var(--hrk-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--hrk-brand)]">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChange([])} className="ml-1 text-xs font-medium text-[var(--hrk-text-tertiary)] underline-offset-2 hover:underline">
            Clear all
          </button>
        </div>
      )}
      {!!hiddenCount && hiddenCount > 0 && (
        <p className="text-[11px] text-[var(--hrk-text-tertiary)]">{hiddenCount} {hiddenCount === 1 ? 'snap' : 'snaps'} hidden in this feed</p>
      )}
    </div>
  );
}

export interface MutedTagsButtonProps {
  /** Controlled list; omit to use the shared localStorage list. */
  tags?: string[];
  onChange?: (tags: string[]) => void;
  /** Hidden-post count; omit to use the count the feed reports. */
  hiddenCount?: number;
  /** Extra classes for the trigger button (match host toolbar styling). */
  className?: string;
}

/**
 * Compact "Muted tags" icon button with a count badge. Opens the panel in a
 * popover anchored to the button (bottom sheet below 640px). Closes on
 * outside click or Esc; focus returns to the button.
 */
export function MutedTagsButton({ tags: tagsProp, onChange, hiddenCount: hiddenProp, className }: MutedTagsButtonProps) {
  const [tags, setTags] = useExcludedTags(tagsProp, onChange);
  const reported = useExcludedHiddenCount();
  const hiddenCount = hiddenProp ?? reported;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const label = tags.length > 0 ? `Muted tags (${tags.length})` : 'Muted tags';
  return (
    <div ref={wrapRef} className="relative shrink-0" data-testid="muted-tags-button">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        title="Muted tags"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        className={className ?? 'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--hrk-border-default)] bg-[var(--hrk-bg-surface)] text-[var(--hrk-text-primary)] hover:bg-[var(--hrk-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--hrk-brand)]'}
      >
        <EyeOff className="h-3.5 w-3.5" />
        {tags.length > 0 && (
          <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#e31337] px-1 text-[10px] font-bold leading-none text-white">
            {tags.length > 99 ? '99+' : tags.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" aria-hidden="true" onClick={() => close(false)} />
          <div
            id={dialogId}
            role="dialog"
            aria-label="Muted tags"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl border border-[var(--hrk-border-default)] bg-[var(--hrk-bg-surface)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-left shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 sm:rounded-xl sm:p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <EyeOff className="h-4 w-4 text-[var(--hrk-text-tertiary)]" />
              <span className="text-sm font-semibold text-[var(--hrk-text-primary)]">Muted tags</span>
              <button type="button" onClick={() => close()} aria-label="Close muted tags" className="ml-auto rounded p-1 text-[var(--hrk-text-tertiary)] hover:text-[var(--hrk-text-primary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--hrk-brand)]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ExcludedTagsPanel tags={tags} onChange={setTags} hiddenCount={hiddenCount} autoFocus />
          </div>
        </>
      )}
    </div>
  );
}

/** Collapsible card wrapper around the panel (legacy; no longer used by SnapsFeedView). */
export function ExcludedTagsManager({ tags, onChange, defaultOpen, hiddenCount }: ExcludedTagsManagerProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen ?? false);
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
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-[var(--hrk-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-[var(--hrk-border-default)]/60 px-3 py-2.5">
          <ExcludedTagsPanel tags={tags} onChange={onChange} hiddenCount={hiddenCount} />
        </div>
      )}
    </div>
  );
}

export default ExcludedTagsManager;
