import { Plugin, Style } from "@opencode/plugin/gui"

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
})
