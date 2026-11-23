/**
 * ClickToLoadEmbed — lightweight facade for iframe embeds in feed cards.
 *
 * Shows a thumbnail (or a small branded card) until the viewer taps it,
 * then mounts the real player exactly once. When the player later scrolls
 * far out of view (EMBED_UNMOUNT_ROOT_MARGIN) it is unmounted back to the
 * facade, so long feed sessions do not accumulate cross-origin renderers.
 *
 * The player is rendered by `renderPlayer()` only while active and is never
 * re-pointed at a new URL: callers must give each attachment its own React
 * `key`, so changing attachment mounts a fresh element instead of mutating
 * an existing iframe's `src` (a `src` change on a live iframe adds a
 * browser history entry, which breaks the in-app Back button).
 */
import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { EMBED_UNMOUNT_ROOT_MARGIN, nextEmbedActiveState } from '@/utils/embedFacade';

export interface ClickToLoadEmbedProps {
  /** Provider name shown on the facade ("YouTube", "3Speak", …). */
  label: string;
  /** Optional secondary line (video/track title, author). */
  title?: string | null;
  /** Thumbnail URL (already proxied). Falls back to the branded card on error. */
  thumbnail?: string | null;
  /** Icon for the card variant. */
  icon?: ReactNode;
  /** Button text; defaults to "Play". */
  actionLabel?: string;
  /** `video`: full-tile thumbnail with a play button. `card`: compact centred card. */
  variant?: 'video' | 'card';
  /** Original URL, offered as a plain "Open" link on the facade. */
  sourceUrl?: string;
  /** Renders the real player; called only after the viewer tapped. */
  renderPlayer: () => ReactNode;
  /** Class for the wrapper that holds the active player. */
  playerClassName?: string;
}

export const ClickToLoadEmbed: FC<ClickToLoadEmbedProps> = ({
  label,
  title,
  thumbnail,
  icon,
  actionLabel = 'Play',
  variant = 'video',
  sourceUrl,
  renderPlayer,
  playerClassName = 'flex h-full w-full items-center justify-center',
}) => {
  const [active, setActive] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const playerRef = useRef<HTMLDivElement | null>(null);

  // Drop the player once it is far outside the viewport.
  useEffect(() => {
    if (!active) return;
    const node = playerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setActive((prev) => nextEmbedActiveState(prev, entry.isIntersecting));
      },
      { rootMargin: EMBED_UNMOUNT_ROOT_MARGIN },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [active]);

  if (active) {
    return (
      <div ref={playerRef} className={playerClassName} onClick={(e) => e.stopPropagation()}>
        {renderPlayer()}
      </div>
    );
  }

  const start = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(true);
  };
  const showThumb = Boolean(thumbnail) && !thumbFailed;

  if (variant === 'video') {
    return (
      <button
        type="button"
        onClick={start}
        className="group relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
        aria-label={`${actionLabel} ${label}${title ? `: ${title}` : ''}`}
        data-embed-facade={label}
      >
        {showThumb ? (
          <img
            src={thumbnail as string}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1f2329] to-black" />
        )}
        <span className="absolute inset-0 bg-black/30 transition group-hover:bg-black/20" />
        <span className="absolute flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg transition group-hover:scale-105">
          <Play className="ml-1 h-6 w-6 fill-current" />
        </span>
        <span className="absolute bottom-2 left-2 right-16 flex min-w-0 items-center gap-1.5 text-left text-xs text-white drop-shadow">
          <span className="shrink-0 rounded bg-black/60 px-1.5 py-0.5 font-semibold">{label}</span>
          {title && <span className="truncate">{title}</span>}
        </span>
      </button>
    );
  }

  return (
    <div
      className="flex h-full w-full items-center justify-center bg-[#1a1d21] p-4"
      onClick={(e) => e.stopPropagation()}
      data-embed-facade={label}
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-[var(--hrk-border-default)] bg-[#15181b] p-3 shadow-lg">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/40 text-[var(--hrk-brand)]">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--hrk-text-primary,#fff)]">{label}</div>
          {title && <div className="truncate text-xs text-[var(--hrk-text-tertiary)]">{title}</div>}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--hrk-brand)] underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={start}
          className="shrink-0 rounded-full bg-[var(--hrk-brand)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
};
