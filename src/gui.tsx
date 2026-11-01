import { Plugin, Style } from "@opencode/plugin/gui"

/** Locales whose text runs right to left, as Chromium orders a window's views. */
const RTL_LANGUAGES = new Set(["ar", "ckb", "dv", "fa", "he", "ku", "ps", "sd", "ug", "ur", "yi"])

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
  },
  main(ctx) {
    mirrorEmbedBounds(ctx)
  },
})
