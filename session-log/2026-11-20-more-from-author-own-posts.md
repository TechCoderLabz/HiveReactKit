# 2026-11-20 — "More from author" lists only the author's own posts

## Root cause

`HiveDetailPost` used one list (`recommendedPosts`) for two jobs:

- prev/next navigation and the "n/N" pager, and
- the "More from author" panel.

When a post was opened from a feed, `recommendedPosts = contextPosts`, which is that feed: snaps and replies by many authors. Their titles render as `RE: <parent title>`. Because the authors differed, `isAllSameAuthor` was false and the panel heading fell back to "More trending posts". In the narrow layout that heading sat inside the "More from author" collapsible, so it was a section inside a section. Without `contextPosts` the list came from `getUserBlogs` (sort `blog`), which also includes reblogs by other authors.

## What changed (`src/components/HiveDetailPost.tsx`)

- `navPosts`: `contextPosts` when present, else the author's posts. Drives only prev/next, the pager and the context passed on prev/next clicks.
- `authorPosts`: always `userService.getUserPosts(author, 12)` (sort `posts`), filtered to the author's own top-level posts (`depth === 0 || !parent_author`), without the current permlink. Drives the side panel, the bottom carousel and the stacked collapsible.
- Headings: standalone panels (wide side panel, bottom carousel, legacy grid side panel) show one heading, `More from @author`. Inside the narrow-layout "More from author" collapsible, only the bare list renders (no inner card, no inner heading). The "More trending posts" fallback and `isAllSameAuthor` are gone.
- The panel (and the FAB shortcut, now labelled "More from author") is hidden when the author has no other top-level posts.
- Clicking an author post passes the author's list as context, so prev/next on the next page walks that author's posts.

## Testing

- Kit: `tsc -p tsconfig.build.json --noEmit` clean; `npm run build` passes; ESLint on the file reports the same pre-existing findings as `main` (none new).
- HiveSuite (`vite build`) passes against this branch via `HIVE_KIT_DIR`.
- In the app (vite dev, headless Chrome): snap opened from Snaps shows only the author's top-level posts, no `RE:` items, no "More trending posts" (mobile collapsible, desktop bottom, desktop right panel). Prev/next walks the Snaps feed across authors (2/25 → 3/25 → 2/25). With `get_account_posts` sort `posts` mocked empty for the author, the panel and the FAB shortcut are hidden.
- Screenshots: `docs/pr-screenshots/fix-more-from-author-own-posts/`.

No version bump in this PR (other kit PRs are in flight in parallel; bump when releasing).
