/**
 * `@snapie/renderer` with blocked image hosts stripped from its output.
 *
 * Every component that renders a Hive body (posts, snaps, comments, previews)
 * uses this instead of importing `@snapie/renderer` directly, and the package
 * re-exports these under the same names, so apps that call the kit's
 * `createHiveRenderer` / `renderHiveMarkdown` are covered too.
 */
import { createHiveRenderer as createBaseHiveRenderer, type HiveRendererOptions } from '@snapie/renderer'
import { isBlockedImageUrl, stripBlockedImagesFromHtml } from './blockedImageHosts'

export type { HiveRendererOptions }

export function createHiveRenderer(options?: HiveRendererOptions): (markdown: string) => string {
  // The content renderer rejects data: URIs from imageProxyFn and swaps in a
  // relative "brokenimg.jpg", so blocked URLs pass through the proxy function
  // untouched and are replaced after rendering instead.
  const proxy = options?.imageProxyFn
  const render = createBaseHiveRenderer(
    proxy ? { ...options, imageProxyFn: (url: string) => (isBlockedImageUrl(url) ? url : proxy(url)) } : options,
  )
  return (markdown: string) => stripBlockedImagesFromHtml(render(markdown))
}

export const renderHiveMarkdown = createHiveRenderer()
