import { createContext, useContext, useMemo, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

export type SupporterTier = 'silver' | 'gold' | 'platinum';
export type SupporterTierMap = Record<string, SupporterTier>;

/*
 * Static ring/badge (Tailwind) + a shared pulse animation (plain CSS in
 * build.css: `.hrk-tier-ring` / `.hrk-tier-badge` + `.hrk-tier--{tier}`).
 * Pulse period: silver 5s, gold 2.5s, platinum 1s. Under
 * `prefers-reduced-motion: reduce` the animation is off and the static
 * Tailwind ring/border below is what shows.
 */
const TIER_RING: Record<SupporterTier, string> = {
  silver:   'ring-1 ring-slate-400 hrk-tier-ring hrk-tier--silver',
  gold:     'ring-2 ring-amber-400 hrk-tier-ring hrk-tier--gold',
  platinum: 'ring-[3px] ring-violet-400 hrk-tier-ring hrk-tier--platinum',
};

const TIER_BADGE: Record<SupporterTier, string> = {
  silver:   'bg-slate-400/15 text-slate-300 border border-slate-400/40 hrk-tier-badge hrk-tier--silver',
  gold:     'bg-amber-400/15 text-amber-300 border border-amber-400/40 hrk-tier-badge hrk-tier--gold',
  platinum: 'bg-violet-400/15 text-violet-200 border border-violet-400/40 hrk-tier-badge hrk-tier--platinum',
};

/** Pulse period per tier (ms) — mirrors `--hrk-tier-period` in build.css. */
export const SUPPORTER_PULSE_PERIOD_MS: Record<SupporterTier, number> = {
  silver: 5000,
  gold: 2500,
  platinum: 1000,
};

/** Called when a supporter pill is tapped. Omit it to keep pills non-interactive. */
export type SupporterTierPressHandler = (tier: SupporterTier) => void;

interface SupporterTierContextValue {
  tierMap: SupporterTierMap;
  onTierPress?: SupporterTierPressHandler;
}

const SupporterTierContext = createContext<SupporterTierContextValue>({ tierMap: {} });

export function SupporterTierProvider({
  tierMap,
  onTierPress,
  children,
}: {
  tierMap: SupporterTierMap;
  /** Optional: makes every SupporterTierPill a button that calls this. Leave undefined for plain badges. */
  onTierPress?: SupporterTierPressHandler;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ tierMap, onTierPress }), [tierMap, onTierPress]);
  return (
    <SupporterTierContext.Provider value={value}>
      {children}
    </SupporterTierContext.Provider>
  );
}

/** Use in list components to avoid per-item hook calls inside map(). */
export function useSupporterTierMap(): SupporterTierMap {
  return useContext(SupporterTierContext).tierMap;
}

/** Use in single-author components (SnapsFeedCard, CommentTile, etc.). */
export function useSupporterTier(username: string): SupporterTier | undefined {
  return useContext(SupporterTierContext).tierMap[username];
}

/** Returns the ring className for avatar border, or the fallback if no tier. */
export function getSupporterRing(tier: SupporterTier | undefined, fallback = ''): string {
  return tier ? TIER_RING[tier] : fallback;
}

/** Returns the badge className for username highlight, or '' if no tier. */
export function getSupporterBadge(tier: SupporterTier | undefined): string {
  return tier ? TIER_BADGE[tier] : '';
}

const TIER_LABEL: Record<SupporterTier, string> = {
  silver: 'Silver supporter',
  gold: 'Gold supporter',
  platinum: 'Platinum supporter',
};

const TIER_SHORT_LABEL: Record<SupporterTier, string> = {
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
};

/**
 * Small "★ Gold" pill shown next to a name (profile header, post header, inbox rows).
 * Always one line and never shrinks. The visible text is just the tier name at every
 * breakpoint; the full "Gold supporter" stays in title / aria-label for accessibility.
 */
export function SupporterTierPill({ tier, className = '' }: { tier: SupporterTier | undefined; className?: string }) {
  const { onTierPress } = useContext(SupporterTierContext);
  if (!tier) return null;
  const base = `inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none sm:text-[11px] ${TIER_BADGE[tier]} ${className}`;
  const content = (
    <>
      <span aria-hidden>★</span>
      <span aria-hidden>{TIER_SHORT_LABEL[tier]}</span>
    </>
  );
  if (!onTierPress) {
    return (
      <span data-supporter-tier={tier} className={base} title={TIER_LABEL[tier]} aria-label={TIER_LABEL[tier]}>
        {content}
      </span>
    );
  }
  // span[role=button] (not <button>) so it is valid inside row buttons/links.
  const press = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onTierPress(tier);
  };
  return (
    <span
      data-supporter-tier={tier}
      role="button"
      tabIndex={0}
      className={`${base} cursor-pointer hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60`}
      title={TIER_LABEL[tier]}
      aria-label={TIER_LABEL[tier]}
      aria-haspopup="dialog"
      onClick={press}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') press(e);
      }}
    >
      {content}
    </span>
  );
}
