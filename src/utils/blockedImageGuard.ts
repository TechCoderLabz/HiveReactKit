/**
 * Runtime safety net for blocked image hosts (see `blockedImageHosts.ts`).
 *
 * Data-level filters cover post bodies and the image helpers, but images can
 * reach the DOM from many components. This guard intercepts the places a
 * browser starts an image request and swaps blocked URLs for the placeholder
 * before the request is made:
 *
 * - `setAttribute('src' | 'srcset' | 'poster' | 'href', …)` on image-like
 *   elements (React sets these attributes this way);
 * - the `src` / `srcset` / `poster` property setters (`new Image().src = …`);
 * - `style.backgroundImage`, `style.background` and `style.setProperty`;
 * - a MutationObserver for markup inserted with `innerHTML`.
 *
 * Call `installBlockedImageGuard()` once, as early as possible (before React
 * renders). Calling it again is a no-op.
 */
import {
  BLOCKED_IMAGE_PLACEHOLDER,
  filterBlockedCssUrls,
  filterBlockedSrcset,
  isBlockedImageUrl,
} from './blockedImageHosts'

let installed = false

const URL_ATTRS = new Set(['src', 'data-src', 'poster'])
const SRCSET_ATTRS = new Set(['srcset', 'data-srcset'])
const SVG_HREF_ATTRS = new Set(['href', 'xlink:href'])
const CSS_IMAGE_PROPS = new Set(['background', 'background-image', 'backgroundimage', 'list-style-image', 'border-image', 'content'])

function isImageLike(el: Element): boolean {
  const tag = el.localName
  return tag === 'img' || tag === 'source' || tag === 'video' || tag === 'input' || tag === 'image'
}

/** Filtered attribute value, or `null` when the value is fine as is. */
export function filterImageAttribute(el: Element, name: string, value: string): string | null {
  const attr = name.toLowerCase()
  if (attr === 'style') {
    const next = filterBlockedCssUrls(value)
    return next === value ? null : next
  }
  if (!isImageLike(el)) return null
  if (URL_ATTRS.has(attr) || (el.localName === 'image' && SVG_HREF_ATTRS.has(attr))) {
    return isBlockedImageUrl(value) ? BLOCKED_IMAGE_PLACEHOLDER : null
  }
  if (SRCSET_ATTRS.has(attr)) {
    const next = filterBlockedSrcset(value)
    return next === value ? null : next
  }
  return null
}

/** The object in `start`'s prototype chain that owns `prop`'s accessor. */
function findAccessorOwner(start: object | null | undefined, prop: string): object | undefined {
  for (let o = start; o; o = Object.getPrototypeOf(o)) {
    if (Object.getOwnPropertyDescriptor(o, prop)) return o
  }
  return undefined
}

function patchSetter(start: object | undefined, prop: string, filter: (v: string) => string): void {
  const proto = findAccessorOwner(start, prop)
  if (!proto) return
  const desc = Object.getOwnPropertyDescriptor(proto, prop)
  if (!desc || !desc.set || !desc.configurable) return
  const originalSet = desc.set
  Object.defineProperty(proto, prop, {
    ...desc,
    set(this: unknown, value: unknown) {
      originalSet.call(this, typeof value === 'string' ? filter(value) : value)
    },
  })
}

function sanitizeElement(el: Element): void {
  for (const attr of ['src', 'data-src', 'poster', 'srcset', 'data-srcset', 'href', 'xlink:href', 'style']) {
    const value = el.getAttribute(attr)
    if (value == null) continue
    const next = filterImageAttribute(el, attr, value)
    if (next !== null) el.setAttribute(attr, next)
  }
}

function sanitizeTree(node: Node): void {
  if (node.nodeType !== 1) return
  const el = node as Element
  sanitizeElement(el)
  el.querySelectorAll('img,source,video,input,image,[style]').forEach(sanitizeElement)
}

export function installBlockedImageGuard(): void {
  if (installed || typeof window === 'undefined' || typeof Element === 'undefined') return
  installed = true

  const originalSetAttribute = Element.prototype.setAttribute
  Element.prototype.setAttribute = function setAttribute(this: Element, name: string, value: string) {
    const next = typeof value === 'string' ? filterImageAttribute(this, name, value) : null
    return originalSetAttribute.call(this, name, next ?? value)
  }
  const originalSetAttributeNS = Element.prototype.setAttributeNS
  Element.prototype.setAttributeNS = function setAttributeNS(
    this: Element,
    ns: string | null,
    name: string,
    value: string,
  ) {
    const next = typeof value === 'string' ? filterImageAttribute(this, name, value) : null
    return originalSetAttributeNS.call(this, ns, name, next ?? value)
  }

  const url = (v: string) => (isBlockedImageUrl(v) ? BLOCKED_IMAGE_PLACEHOLDER : v)
  patchSetter(window.HTMLImageElement?.prototype, 'src', url)
  patchSetter(window.HTMLImageElement?.prototype, 'srcset', (v) => filterBlockedSrcset(v))
  patchSetter(window.HTMLSourceElement?.prototype, 'src', url)
  patchSetter(window.HTMLSourceElement?.prototype, 'srcset', (v) => filterBlockedSrcset(v))
  patchSetter(window.HTMLVideoElement?.prototype, 'poster', url)

  // Style accessors live on CSSStyleDeclaration.prototype in Chrome/Safari and
  // on a subclass prototype elsewhere (Firefox CSS2Properties, jsdom), so
  // start the lookup from a real style object.
  const sampleStyle = document.createElement('div').style
  for (const prop of ['backgroundImage', 'background', 'listStyleImage', 'borderImage']) {
    patchSetter(sampleStyle, prop, (v) => filterBlockedCssUrls(v))
  }
  const styleProto = findAccessorOwner(sampleStyle, 'setProperty') as CSSStyleDeclaration | undefined
  if (styleProto) {
    const originalSetProperty = styleProto.setProperty
    styleProto.setProperty = function setProperty(this: CSSStyleDeclaration, prop: string, value: string | null, priority?: string) {
      const next = typeof value === 'string' && CSS_IMAGE_PROPS.has(prop.toLowerCase()) ? filterBlockedCssUrls(value) : value
      return originalSetProperty.call(this, prop, next, priority)
    }
  }

  if (typeof MutationObserver !== 'undefined' && document.documentElement) {
    sanitizeTree(document.documentElement)
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach(sanitizeTree)
        else if (r.type === 'attributes' && r.target.nodeType === 1) sanitizeElement(r.target as Element)
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'poster', 'style', 'href', 'data-src', 'data-srcset'],
    })
  }
}
