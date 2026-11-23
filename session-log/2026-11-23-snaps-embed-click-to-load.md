# 2026-11-23 — Snaps feed: click-to-load embeds

`AttachmentStrip` (feed-card media strip) no longer mounts cross-origin iframes when a card renders. YouTube, 3Speak, Odysee, Spotify, X/Twitter and 3Speak audio tiles show a facade (proxied YouTube thumbnail via images.hive.blog, or a small branded card); the real player is created only on tap (with autoplay where the provider supports it) and is unmounted back to the facade once it scrolls ~1500 px out of view (IntersectionObserver).

- New: `src/components/feed/ClickToLoadEmbed.tsx`, `src/utils/embedFacade.ts` (+ `embedFacade.test.ts`, run `npx tsx src/utils/embedFacade.test.ts`).
- Each tile has a per-attachment React key, so prev/next never re-points a live iframe's `src` (a `src` change on a mounted iframe adds a history entry; see hivesuite.app task 04).
- `disableIframePreviews` still renders only the plain link.
- Not done: `content-visibility` on feed cards (risk to feed scroll restoration; left for a separate change).
