# 2026-11-26 — Hide the supporter tier pill in the post header

The post details header showed avatar, @name, "★ Platinum" pill, reputation, time-ago and community; on phones it overflowed and clipped the username. The `SupporterTierPill` line in `HiveDetailPost.tsx` is commented out (not deleted). The supporter avatar ring and tinted @name still show the tier; Inbox and profile pills are unchanged.
