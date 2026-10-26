/**
 * WindowedList — render-layer sliding window for infinite feeds (the web
 * analogue of UITableView cell reuse).
 *
 * The DATA array is never trimmed: every fetched item stays in `items`.
 * Only the DOM is capped — at most `windowSize` items (default
 * FEED_RENDER_WINDOW_SIZE = 50) are mounted at once. Items that scroll
 * far off the top are unmounted and replaced by a top spacer whose height
 * equals the sum of their last measured heights; items below the window
 * are replaced by a bottom spacer the same way. Because spacer height ==
 * real height, the scroll position does not jump when the window shifts.
 *
 * Heights are measured with a single shared ResizeObserver and cached by
 * item key, so re-mounting a dropped item (scrolling back up) restores it
 * from memory with no refetch. Scroll handling is passive + rAF-throttled
 * and the window only moves in steps of `shiftStep` items, which keeps
 * remount churn low on low-end devices.
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Default max number of feed items mounted in the DOM at once. */
export const FEED_RENDER_WINDOW_SIZE = 50;

export interface WindowedListProps<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Max mounted items. Defaults to FEED_RENDER_WINDOW_SIZE (50). */
  windowSize?: number;
  /** Vertical gap in px between items (replaces Tailwind `space-y-*`). */
  gap?: number;
  /** Height guess for never-measured items. */
  estimatedItemHeight?: number;
  /** Window moves in multiples of this many items. */
  shiftStep?: number;
  className?: string;
}

function findScrollAncestor(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el?.parentElement ?? null;
  while (cur && cur !== document.body && cur !== document.documentElement) {
    const oy = window.getComputedStyle(cur).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function WindowedList<T>({
  items,
  getKey,
  renderItem,
  windowSize = FEED_RENDER_WINDOW_SIZE,
  gap = 12,
  estimatedItemHeight = 400,
  shiftStep = 10,
  className,
}: WindowedListProps<T>) {
  const size = Math.max(1, windowSize);
  const step = Math.max(1, Math.min(shiftStep, Math.floor(size / 4) || 1));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const heightsRef = useRef<Map<string, number>>(new Map());
  const [start, setStart] = useState(0);
  const [measureTick, setMeasureTick] = useState(0);

  const keys = useMemo(() => items.map((it, i) => getKey(it, i)), [items, getKey]);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const heightOf = useCallback(
    (k: string) => heightsRef.current.get(k) ?? estimatedItemHeight + gap, // measured value already includes the gap padding
    [estimatedItemHeight, gap],
  );

  // One ResizeObserver for all mounted rows.
  const roRef = useRef<ResizeObserver | null>(null);
  const pendingTick = useRef(false);
  if (!roRef.current && typeof ResizeObserver !== 'undefined') {
    roRef.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        const k = (e.target as HTMLElement).dataset.wlKey;
        if (!k) continue;
        const h = (e.target as HTMLElement).offsetHeight;
        if (h > 0 && heightsRef.current.get(k) !== h) {
          heightsRef.current.set(k, h);
          changed = true;
        }
      }
      if (changed && !pendingTick.current) {
        pendingTick.current = true;
        requestAnimationFrame(() => { pendingTick.current = false; setMeasureTick((t) => t + 1); });
      }
    });
  }
  useEffect(() => () => roRef.current?.disconnect(), []);

  const rowRef = useCallback((node: HTMLDivElement | null) => {
    if (!node || !roRef.current) return;
    const k = node.dataset.wlKey;
    if (k && node.offsetHeight > 0) heightsRef.current.set(k, node.offsetHeight);
    roRef.current.observe(node);
  }, []);

  // Scroll → compute which item is at the viewport top, derive window start.
  const compute = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const ks = keysRef.current;
    if (ks.length <= size) { setStart((s) => (s === 0 ? s : 0)); return; }
    const root = findScrollAncestor(el);
    const listTop = el.getBoundingClientRect().top - (root ? root.getBoundingClientRect().top : 0);
    const offset = Math.max(0, -listTop); // px of list scrolled past the viewport top
    let acc = 0;
    let first = 0;
    while (first < ks.length && acc + heightOf(ks[first]) <= offset) { acc += heightOf(ks[first]); first++; }
    // Keep ~1/4 of the window above the viewport for smooth back-scroll.
    let next = first - Math.floor(size / 4);
    next = Math.floor(Math.max(0, next) / step) * step;
    next = Math.min(next, Math.max(0, ks.length - size));
    setStart((s) => (s === next ? s : next));
  }, [size, step, heightOf]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const root = findScrollAncestor(el);
    const target: HTMLElement | Window = root ?? window;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; compute(); });
    };
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [compute]);

  // Items list changed (new page appended, filter, feed switch) → re-evaluate.
  useLayoutEffect(() => { compute(); }, [keys, compute]);

  const clampedStart = Math.min(start, Math.max(0, keys.length - size));
  const end = Math.min(keys.length, clampedStart + size);

  const { topPad, bottomPad } = useMemo(() => {
    let t = 0;
    for (let i = 0; i < clampedStart; i++) t += heightOf(keys[i]);
    let b = 0;
    for (let i = end; i < keys.length; i++) b += heightOf(keys[i]);
    return { topPad: t, bottomPad: b };
    // measureTick: recompute spacer heights when rows are re-measured
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, clampedStart, end, heightOf, measureTick]);

  return (
    <div ref={containerRef} className={className} style={{ paddingTop: topPad, paddingBottom: bottomPad }}>
      {items.slice(clampedStart, end).map((item, i) => {
        const idx = clampedStart + i;
        const k = keys[idx];
        return (
          <Fragment key={k}>
            <div ref={rowRef} data-wl-key={k} style={{ paddingBottom: gap }}>
              {renderItem(item, idx)}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export default WindowedList;
