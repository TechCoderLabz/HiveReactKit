import { useMemo, useState } from "react";
import { ThumbsUp, X, Loader2 } from "lucide-react";

/** One account the user can vote from (multi-account vote picker). */
export interface VoteAccountOption {
  username: string;
  /** This account already voted on the post — shown disabled. */
  alreadyVoted?: boolean;
}

export function VoteSlider({
  author,
  defaultValue = 100,
  step = 1,
  onUpvote,
  onCancel,
  awaitingWalletApproval = false,
  walletApprovalLabel = 'Open Keychain App & Approve',
  voteAccounts,
  defaultSelectedAccounts,
}: {
  author: string;
  permlink: string;
  defaultValue?: number;
  /** Slider precision. Use 0.25, 0.5, or 1 (default 1). */
  step?: number;
  /** `accounts` is only passed when the multi-account picker is shown
   *  (more than one entry in `voteAccounts`). */
  onUpvote: (percent: number, accounts?: string[]) => Promise<unknown> | void; // allow async
  onCancel: () => void;
  /** Set true when the logged-in user is on a wallet provider
   *  (Keychain, HiveAuth, PeakVault). While the broadcast is in
   *  flight the slider surfaces a blinking "Open Keychain App &
   *  Approve" hint so the user knows to switch apps to authorize. */
  awaitingWalletApproval?: boolean;
  /** Override for the wallet-approval hint text. */
  walletApprovalLabel?: string;
  /** Logged-in Hive accounts the user can vote from. With 2+ entries the
   *  slider shows an "All accounts" / per-account picker; with 0–1 it
   *  behaves exactly like the single-account slider. */
  voteAccounts?: VoteAccountOption[];
  /** Accounts pre-checked when the picker opens (default: the first
   *  account that hasn't voted yet). */
  defaultSelectedAccounts?: string[];
}) {
  const multi = (voteAccounts?.length ?? 0) > 1;
  const eligible = useMemo(
    () => (voteAccounts ?? []).filter((a) => !a.alreadyVoted).map((a) => a.username),
    [voteAccounts],
  );
  const [selected, setSelected] = useState<string[]>(() => {
    const wanted = (defaultSelectedAccounts ?? []).filter((u) => eligible.includes(u));
    return wanted.length > 0 ? wanted : eligible.slice(0, 1);
  });
  const allSelected = eligible.length > 0 && eligible.every((u) => selected.includes(u));
  const toggleAccount = (username: string) =>
    setSelected((prev) => (prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]));
  const toggleAll = () => setSelected(allSelected ? [] : eligible);
  // Slider's lower bound matches the configured step — 0.25 → 0.25%,
  // 0.5 → 0.5%, 1 → 1%. Was hardcoded to 1, which trapped fractional-
  // step users above 1% once they dragged up past it.
  const minPercent = step;
  const [percent, setPercent] = useState(Math.max(defaultValue, minPercent));
  const [loading, setLoading] = useState(false);
  const stops = [minPercent, ...Array.from({ length: 10 }, (_, i) => (i + 1) * 10)];
  const decimals = step >= 1 ? 0 : step >= 0.5 ? 1 : 2;

  const handleVoteClick = async () => {
    if (percent === 0 || loading) return;
    if (multi && selected.length === 0) return;
    setLoading(true);
    try {
      // Keep the picker's display order (not click order) for the broadcast sequence.
      const accounts = multi ? (voteAccounts ?? []).map((a) => a.username).filter((u) => selected.includes(u)) : undefined;
      await onUpvote(percent, accounts); // wait until API resolves
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 sm:items-center">
      <div className="bg-[var(--hrk-bg-surface-raised)] border border-[var(--hrk-border-default)] rounded-t-[16px] sm:rounded-[16px] w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-[var(--hrk-shadow-lg)] flex flex-col">
        {/* Header */}
        <h2 className="text-center text-base sm:text-lg font-semibold text-[var(--hrk-text-primary)] mb-2">
          Vote for @{author}
        </h2>

        {/* Wallet-approval hint — only visible while the broadcast
            is in flight on a wallet provider. */}
        {loading && awaitingWalletApproval && (
          <p className="mb-4 text-center text-xs sm:text-sm font-medium text-amber-400 animate-pulse">
            {walletApprovalLabel}
          </p>
        )}
        {!(loading && awaitingWalletApproval) && <div className="mb-4" />}

        {/* Slider Section */}
        <div className="relative w-full flex flex-col items-center mb-6">
          {/* Floating bubble with percent */}
          <div
            className="absolute -top-8 left-0"
            style={{ left: `${percent}%`, transform: "translateX(-50%)" }}
          >
            <div className="bg-[var(--hrk-brand)] text-white text-xs sm:text-sm px-2 py-1 rounded-lg shadow">
              {percent.toFixed(decimals)}%
            </div>
            <div className="mx-auto w-2 h-2 bg-[var(--hrk-brand)] rotate-45 -mt-1"></div>
          </div>

          {/* Slider — left side filled with the app's theme color */}
          <input
            type="range"
            min={minPercent}
            max={100}
            step={step}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[var(--hrk-brand)] [&::-webkit-slider-runnable-track]:rounded-lg [&::-webkit-slider-runnable-track]:h-2 [&::-moz-range-track]:rounded-lg [&::-moz-range-track]:h-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--hrk-brand)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:-mt-1.5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--hrk-brand)] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-progress]:bg-[var(--hrk-brand)] [&::-moz-range-progress]:rounded-lg"
            style={{
              background: `linear-gradient(to right, var(--hrk-brand) ${percent}%, var(--hrk-border-default) ${percent}%)`,
            }}
          />

          {/* Stop Labels */}
          <div className="flex justify-between w-full mt-3 ml-2 text-[10px] sm:text-xs text-[var(--hrk-text-tertiary)]">
            {stops.map((stop) => (
              <button
                type="button"
                key={stop}
                onClick={() => setPercent(stop)}
                className={`focus:outline-none px-1 rounded transition
    ${
      percent === stop
        ? "text-[var(--hrk-brand)] font-bold"
        : "hover:text-[var(--hrk-brand-hover)] hover:bg-[var(--hrk-bg-surface-raised)]"
    }`}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {stop}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-account picker — only when 2+ Hive accounts are logged in. */}
        {multi && (
          <div className="mb-5" data-testid="vote-account-picker">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--hrk-text-secondary)]">Vote from</span>
              <span className="text-xs text-[var(--hrk-text-tertiary)]">
                {selected.length} of {voteAccounts!.length} selected
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--hrk-border-default)] divide-y divide-[var(--hrk-border-default)]">
              <label className={`flex items-center gap-3 px-3 py-2 ${eligible.length === 0 ? 'opacity-50' : 'cursor-pointer hover:bg-[var(--hrk-bg-hover)]'}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--hrk-brand)]"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = !allSelected && selected.length > 0; }}
                  disabled={eligible.length === 0 || loading}
                  onChange={toggleAll}
                  aria-label="All accounts"
                />
                <span className="text-sm font-medium text-[var(--hrk-text-primary)]">All accounts</span>
                <span className="ml-auto text-xs tabular-nums text-[var(--hrk-text-tertiary)]">{eligible.length}</span>
              </label>
              {voteAccounts!.map((a) => (
                <label
                  key={a.username}
                  className={`flex items-center gap-3 px-3 py-2 ${a.alreadyVoted ? 'opacity-50' : 'cursor-pointer hover:bg-[var(--hrk-bg-hover)]'}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--hrk-brand)]"
                    checked={!a.alreadyVoted && selected.includes(a.username)}
                    disabled={a.alreadyVoted || loading}
                    onChange={() => toggleAccount(a.username)}
                    aria-label={`Vote from @${a.username}`}
                  />
                  <img
                    src={`https://images.hive.blog/u/${a.username}/avatar/small`}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded-full bg-[var(--hrk-bg-hover)] object-cover"
                    loading="lazy"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--hrk-text-primary)]">@{a.username}</span>
                  {a.alreadyVoted && (
                    <span className="shrink-0 text-[11px] text-[var(--hrk-text-tertiary)]">already voted</span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleVoteClick}
            disabled={percent === 0 || loading || (multi && selected.length === 0)}
            className={`flex-1 flex items-center justify-center rounded-full font-semibold transition
              text-sm sm:text-base px-3 py-2 sm:px-4 sm:py-3 shadow
              ${
                percent === 0 || loading || (multi && selected.length === 0)
                  ? "bg-[var(--hrk-bg-surface-raised)] text-[var(--hrk-text-tertiary)] cursor-not-allowed"
                  : "bg-[var(--hrk-brand)] hover:bg-[var(--hrk-brand-hover)] text-white"
              }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 mr-1 animate-spin" />
                Voting...
              </>
            ) : (
              <>
                <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
                {multi && selected.length > 1 ? `Vote ×${selected.length}` : 'Vote'}
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            disabled={loading} // prevent cancel during vote
            className="flex-1 flex items-center justify-center rounded-full font-semibold text-sm sm:text-base px-3 py-2 sm:px-4 sm:py-3 shadow
              bg-[var(--hrk-bg-surface-raised)] hover:bg-[var(--hrk-bg-hover)] text-white
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 mr-1" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
