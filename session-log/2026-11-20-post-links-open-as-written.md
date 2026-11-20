# 2026-11-20 — Post links open as written

`HiveDetailPost` body click handler no longer reroutes absolute links to other Hive frontends (peakd, ecency, travelfeed, …) or worldmappin.com into the app. They open as written in a new tab. Rerouting broke authors' referral and profile links. Root-relative links (the `/@user` hrefs built for @mentions) and hivesuite.app URLs still navigate in-app. The worldmappin redirect block is commented out, not deleted.

Screenshots: `docs/pr-screenshots/fix-post-links-open-as-written/`. Front-end counterpart: hivesuite.app branch `fix/post-links-open-as-written`.
