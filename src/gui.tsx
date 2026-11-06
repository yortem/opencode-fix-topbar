import { Plugin, Style } from "@opencode/plugin/gui"

/** Locales whose text runs right to left, as Chromium orders a window's views. */
const RTL_LANGUAGES = new Set(["ar", "ckb", "dv", "fa", "he", "ku", "ps", "sd", "ug", "ur", "yi"])

/** The Markdown renderer's root, in chat messages and in the file preview. */
const MARKDOWN = '[data-component="markdown"]'

/** Parts of Markdown whose text is code or a diagram, so it must not choose the document's direction. */
const MARKDOWN_CODE = "pre, code, [data-component='markdown-code'], [data-component='markdown-mermaid']"

/** Right-to-left letters, by Unicode block: Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic. */
function isRtlLetter(code: number) {
  return (
    (code >= 0x0590 && code <= 0x05ff) || // Hebrew
    (code >= 0x0600 && code <= 0x06ff) || // Arabic
    (code >= 0x0700 && code <= 0x074f) || // Syriac
    (code >= 0x0750 && code <= 0x077f) || // Arabic Supplement
    (code >= 0x0780 && code <= 0x07bf) || // Thaana
    (code >= 0x07c0 && code <= 0x07ff) || // NKo
    (code >= 0x0800 && code <= 0x083f) || // Samaritan
    (code >= 0x0840 && code <= 0x085f) || // Mandaic
    (code >= 0x0860 && code <= 0x086f) || // Syriac Supplement
    (code >= 0x0870 && code <= 0x089f) || // Arabic Extended-B
    (code >= 0x08a0 && code <= 0x08ff) || // Arabic Extended-A
    (code >= 0xfb1d && code <= 0xfb4f) || // Hebrew presentation forms
    (code >= 0xfb50 && code <= 0xfdff) || // Arabic presentation forms A
    (code >= 0xfe70 && code <= 0xfeff) // Arabic presentation forms B
  )
}

/** Left-to-right letters, so a Hebrew document with English terms still counts as Hebrew. */
function isLtrLetter(code: number) {
  return (
    (code >= 0x0041 && code <= 0x005a) || // A-Z
    (code >= 0x0061 && code <= 0x007a) || // a-z
    (code >= 0x00c0 && code <= 0x02af) || // Latin-1 Supplement, Extended-A/B, IPA
    (code >= 0x0370 && code <= 0x058f) || // Greek, Cyrillic, Armenian
    (code >= 0x1e00 && code <= 0x1eff) // Latin Extended Additional
  )
}

/**
 * The app renders Markdown with `dir="auto"`, which takes the direction from the first strong
 * character. A Hebrew document that opens with a Latin name, such as `AGENTS.md` or
 * `seo-helper - הנחיות עבודה`, therefore lays out left to right: its headings, paragraphs and
 * list markers all sit on the wrong side.
 *
 * Choose the direction of the whole document from most of its text, ignoring code and diagrams,
 * so a Hebrew document stays right to left even when its first word is English.
 */
function markdownDirection(root: HTMLElement) {
  let rtl = 0
  let ltr = 0
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement

    if (!parent || parent.closest(MARKDOWN_CODE)) continue

    for (const char of node.nodeValue ?? "") {
      const code = char.codePointAt(0)!

      if (isRtlLetter(code)) rtl++
      else if (isLtrLetter(code)) ltr++
    }

    // A sample is enough to tell a Hebrew document from an English one.
    if (rtl + ltr >= 4000) break
  }

  return rtl > ltr ? "rtl" : "ltr"
}

/** Sets each Markdown root's direction as its content arrives, and keeps it in step while it streams. */
function fixMarkdownDirection() {
  if (typeof document === "undefined" || !document.documentElement) return

  const pending = new Set<HTMLElement>()
  let frame = 0

  const apply = (root: HTMLElement) => {
    if (!root.isConnected) return

    const direction = markdownDirection(root)

    if (root.getAttribute("dir") !== direction) root.setAttribute("dir", direction)
  }

  const schedule = (root: HTMLElement) => {
    pending.add(root)
    frame ||= requestAnimationFrame(() => {
      frame = 0
      for (const root of pending) apply(root)
      pending.clear()
    })
  }

  const closest = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement

    return (element?.closest(MARKDOWN) as HTMLElement | null) ?? null
  }

  const scan = (node: Node) => {
    if (!(node instanceof Element)) return

    if (node.matches(MARKDOWN)) schedule(node as HTMLElement)
    node.querySelectorAll(MARKDOWN).forEach((element) => schedule(element as HTMLElement))
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const root = closest(record.target)

      if (root) schedule(root)

      for (const node of record.addedNodes) {
        const added = closest(node)

        if (added) schedule(added)
        else scan(node)
      }
    }
  })

  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  document.querySelectorAll(MARKDOWN).forEach((element) => schedule(element as HTMLElement))

  return () => {
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
  }
}

type Bounds = { x: number; y: number; width: number; height: number }

/**
 * On a right-to-left locale Chromium mirrors the x of every native view it puts
 * in a window: `setBounds({ x })` draws the view at `width - x - width`.
 *
 * OpenCode measures its embeds from the DOM, where `getBoundingClientRect()`
 * is always left to right, so a mirrored window draws each `WebContentsView`
 * reversed. The built-in browser's box starts at x=616 in a 1920 wide window,
 * so its page is painted at 1920 - 616 - 1296 = 8 and covers the session
 * column. Only the main process can reach those views, so the fix lives in
 * `main`: mirror the x again on the way into Electron.
 */
function mirrorEmbedBounds(ctx: any) {
  const electron: any = require("electron")
  const locale = String(electron.app.getLocale?.() ?? "")
  const language = locale.toLowerCase().split("-")[0]

  if (!RTL_LANGUAGES.has(language)) return
  // Escape hatch, as for `inset`: set `options.mirrorEmbeds: false` in opencode.jsonc.
  if (ctx.options?.mirrorEmbeds === false) return

  ctx.log.write("info", "mirroring embed bounds for the window's right-to-left layout", { locale })

  // A view knows neither its window nor the window's layout direction.
  const owner = (view: any) => {
    for (const window of ctx.windows.list()) {
      if (window.isDestroyed()) continue
      if (window.contentView === view) continue
      if (window.contentView.children.includes(view)) return window
    }
  }

  const mirror = (view: any, bounds: Bounds): Bounds => {
    const window = owner(view)

    if (!window) return bounds
    const [width] = window.getContentSize()
    const x = width - bounds.x - bounds.width

    return x === bounds.x ? bounds : { ...bounds, x }
  }

  const patched: Array<{ prototype: any; setBounds: (bounds: Bounds) => void }> = []

  // `WebContentsView` and the `View`s around it (corner masks, cover views) are
  // all placed with the same API, so mirror at the base class where it is declared.
  for (const constructor of [electron.View, electron.WebContentsView]) {
    const prototype = constructor?.prototype

    if (!prototype || !Object.prototype.hasOwnProperty.call(prototype, "setBounds")) continue
    if (patched.some((entry) => entry.prototype === prototype)) continue

    const setBounds = prototype.setBounds

    prototype.setBounds = function (bounds: Bounds) {
      return setBounds.call(this, mirror(this, bounds))
    }
    patched.push({ prototype, setBounds })
  }

  ctx.onCleanup(() => {
    for (const entry of patched) entry.prototype.setBounds = entry.setBounds
  })

  // Views placed before the plugin loaded (a reload, rather than a restart) keep
  // their mirrored bounds until the app lays them out again; place them once now.
  const place = () => {
    for (const window of ctx.windows.list()) {
      if (window.isDestroyed()) continue

      for (const view of window.contentView.children) {
        const bounds = view.getBounds()

        if (bounds.width > 0 && bounds.height > 0) view.setBounds(bounds)
      }
    }
  }

  place()
  ctx.windows.on("open", place)
}

/**
 * The desktop window is frameless and uses Electron's `titleBarOverlay`, so
 * Windows draws the native minimize/maximize/close buttons itself.
 *
 * Windows mirrors the window frame for right-to-left system locales, which puts
 * those buttons on the physical left. OpenCode's titlebar is always laid out
 * left-to-right and the app only reserves room on the right
 * (`width: 100vw - 138px; margin-right: auto`), so its first ~138px - the app
 * menu, Home and Search - render underneath the caption buttons and cannot be
 * clicked.
 *
 * `env(titlebar-area-x)` is the left edge of the area that is *not* covered by
 * the caption buttons. Electron mirrors that rect for RTL, so it is 0 on a
 * normal install and the caption strip width on an RTL one. Offsetting the
 * titlebar by it moves the whole row clear of the native buttons, in both
 * writing directions and at any zoom level.
 */
export default Plugin.define({
  os: ["windows"],
  setup(ctx) {
    // Escape hatch for a future Electron that reports the overlay differently:
    // set `options.inset` in opencode.jsonc to pin the offset in pixels.
    const forced = Number(ctx.options.inset)
    const inset = Number.isFinite(forced) ? `${forced}px` : "env(titlebar-area-x, 0px)"

    ctx.add(
      Style,
      `header[data-slot="titlebar-v2"] {
  margin-left: ${inset} !important;
}`,
    )

    // `options.markdownDirection: false` leaves Markdown's own `dir="auto"` alone.
    if (ctx.options.markdownDirection === false) return

    ctx.add(
      Style,
      `[data-component="markdown"] {
  text-align: start;
}

[data-component="markdown"] :is(pre, [data-component="markdown-code"]) {
  text-align: left;
}`,
    )

    return fixMarkdownDirection()
  },
  main(ctx) {
    mirrorEmbedBounds(ctx)
  },
})
