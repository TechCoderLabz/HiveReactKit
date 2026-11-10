import type { ActiveVote } from '@/types/video';

export function isDownvote(vote: ActiveVote): boolean {
  const rshares = Number(vote.rshares ?? 0);
  if (Number.isFinite(rshares) && rshares < 0) return true;
  const percent = Number(vote.percent ?? 0);
  return Number.isFinite(percent) && percent < 0;
}

/**
 * Accounts whose upvote in the app is turned into a curation request
 * (`POST /curation/request`) and must never be broadcast as a direct
 * vote. A raw vote from one of these sessions would skip the curation
 * pipeline's safety checks and get blindly mirrored to every trail
 * account.
 *
 * Lookups are case-insensitive via `isRestrictedDirectVoter`.
 * `RESTRICTED_DIRECT_VOTE_ACCOUNTS` is the same list as a Set, kept as
 * the name existing call sites already import.
 */
export const CURATION_REQUEST_ONLY_ACCOUNTS = [
  'sagarkothari88',
  'hivesuite.app',
  'letusbuyhive',
] as const;

export const RESTRICTED_DIRECT_VOTE_ACCOUNTS = new Set<string>(CURATION_REQUEST_ONLY_ACCOUNTS);

/** True when `username` may never cast a direct vote — see
 *  `CURATION_REQUEST_ONLY_ACCOUNTS`. */
export function isRestrictedDirectVoter(username?: string | null): boolean {
  return !!username && RESTRICTED_DIRECT_VOTE_ACCOUNTS.has(username.toLowerCase());
}

/** The reply containers snap-like apps post into — a "snap" is really
 *  just a comment whose direct parent is one of these accounts. Anything
 *  else with a parent is a genuine comment/reply. */
const SNAP_CONTAINER_ACCOUNTS = new Set([
  'peak.snaps',
  'ecency.waves',
  'leothreads',
  'liketu.moments',
  'slothbuzz.hangs',
]);

/**
 * The REAL content type for a piece of content, independent of which
 * page/component happens to be displaying it. Needed because a single
 * "post details" view can render a genuine top-level post, a snap, or a
 * comment — all three are just `comment` ops on Hive, distinguished only
 * by `depth`/`parent_author`:
 *   - `depth === 0` → top-level post
 *   - parent is a known snap container → snap
 *   - otherwise → comment/reply
 */
export function getHiveContentType(
  depth: number | null | undefined,
  parentAuthor?: string | null,
): 'post' | 'snap' | 'comment' {
  if (!depth || depth <= 0) return 'post';
  if (parentAuthor && SNAP_CONTAINER_ACCOUNTS.has(parentAuthor.toLowerCase())) return 'snap';
  return 'comment';
}

/** True when the post has received at least one downvote / flag.
 *  Prefer `stats.flag_weight` when available — Hive's canonical
 *  signal — and fall back to scanning `active_votes` for negative
 *  rshares or percent. */
export function postHasDownvotes(
  votes?: ActiveVote[] | null,
  flagWeight?: number | null,
): boolean {
  if (typeof flagWeight === 'number' && Number.isFinite(flagWeight) && flagWeight > 0) {
    return true;
  }
  if (!votes?.length) return false;
  return votes.some(isDownvote);
}
