# 2026-11-23 — HiveSuite watermark on uploaded images (task 08a)

**What:** composer image uploads can carry a small, low-opacity HiveSuite mark in the bottom-right corner. The host app picks the mode:
- `forced`: always added, no switch (popup shows "Watermark is added on the free plan").
- `default-on`: added by default; "HiveSuite watermark" switch in the crop/blur popup turns it off per image.
- `off` (default): unchanged behaviour.

**How:**
- `src/utils/watermark.ts`: pure placement maths (`computeWatermarkRect`: ~14% of width clamped to 64–280 px, ≤40% of width, 2% margin, no mark when the shorter edge < 200 px) and mode rules. Tests: `npx tsx src/utils/watermark.test.ts`.
- `src/utils/watermarkAsset.ts`: 341×88 PNG (logo + "HiveSuite") inlined as a data URL, loaded with a dynamic import (own chunk in `dist/`).
- `src/utils/imageProcessor.ts`: `watermark` option on `prepareImageForUpload` and `cropImage`; drawn last (after crop/blur/resize) at 40% opacity with a soft shadow. Forces a canvas pass for small files when a mark is needed. GIFs are left untouched (animation kept, no mark).
- `src/utils/imageEdit.ts`: per-image edits are stored relative to the original (`composeImageEdit`), so the image can be re-rendered when the switch changes. This also fixes re-cropping an already-cropped image (the second crop used to be applied to the original's coordinates). Tests: `npx tsx src/utils/imageEdit.test.ts`.
- `ImageUploader`: `watermark` prop; renders each image in one canvas pass from the original; the crop popup shows the image without the mark; re-checks the mode at upload time so a `forced` host never uploads an unmarked image.
- `ImageCropperModal`: `watermarkMode`, `watermarkEnabled`, `onWatermarkChange`.
- `ImageWatermarkProvider` / `useImageWatermarkMode`: app-wide default, so comment composers rendered deep inside HiveDetailPost / comment lists / modals pick up the mode without threading a prop through every component. Explicit `watermark` props win.
- `ParentPostComposer`, `PostComposer`/`AddCommentInput`, `MemePicker`: `watermark` prop (falls back to the provider).

**Not changed:** `DecentMemesPicker` (partner widget output), `VideoUploader`/`AudioUploader`.

**Verified:** unit tests; `tsc -p tsconfig.build.json --noEmit`; `vite build --mode lib`; eslint (no new problems vs main); dev harness in Chromium for forced / default-on (switch off, on again) / off / provider, light + dark + portrait + 150 px images. Screenshots: `docs/pr-screenshots/feat-image-watermark/`.
