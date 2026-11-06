# opencode-fix-topbar

Fixes three right-to-left problems in OpenCode Desktop on Windows: window buttons drawn over the titlebar, the
built-in browser painting over the session column, and Hebrew Markdown files laid out left to right.

| Before | After |
| --- | --- |
| ![Before](before.jpg) | ![After](after.jpg) |
| The close button covers the menu | The menu is clear and clickable |

## The window buttons

On RTL Windows, the window buttons (minimize, maximize, close) are on the left. The app expects them on the right, so
its menu buttons are drawn under them and can't be clicked.

The plugin moves the titlebar over by the width of those window buttons.

```css
header[data-slot="titlebar-v2"] {
  margin-left: env(titlebar-area-x, 0px);
}
```

## The browser pane

On the same systems, the built-in browser opens over the conversation instead of inside the side panel: its page
starts at the window's left edge and covers the chat column.

Chromium lays the window's native views out right to left when the app runs in an RTL locale, and it mirrors the `x`
of every `setBounds` call inside the window: `x` becomes `width - x - width`. The app measures its embeds from the
DOM, where `getBoundingClientRect()` is always left to right, so each `WebContentsView` lands reversed. On a 1920
wide window a pane at `x = 616`, `width = 1296` is painted at `1920 - 616 - 1296 = 8`.

The plugin's `main` entry mirrors `x` again on the way into Electron, so views land where their box is. It also does
this for the rounded-corner views around them, and for windows opened later.

## Markdown files

Markdown is rendered with `dir="auto"`, which picks a direction from the first strong character. A Hebrew document
that starts with an English word — a title such as `seo-helper - הנחיות עבודה`, or a filename used as the first
heading — therefore lays out left to right: headings, paragraphs and list markers all sit on the wrong side.

The plugin watches Markdown as it renders, ignores code and diagrams, and chooses the direction from most of the
document's text. Hebrew documents become right to left even when they open with an English name; English documents
stay left to right. It applies to the file preview and to chat messages alike.

## Install

1. Put this folder anywhere on your computer.
2. Add its path to the `plugins` list in your global `opencode.jsonc`
   (`~/.config/opencode/opencode.jsonc`):

   ```jsonc
   {
     "plugins": ["C:/path/to/opencode-fix-topbar"]
   }
   ```

3. Restart OpenCode Desktop.
4. If it doesn't show up, check **Settings → Extensions → Plugins**.

The built plugin is included in `dist/`, so no build step is needed.

## Change the code

```bash
npm install
npm run dev   # rebuilds and reloads the plugin on every save
```

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `inset` | `env(titlebar-area-x)` | Pins the titlebar offset in pixels. `0` turns the offset off. |
| `mirrorEmbeds` | on for RTL locales | Set `false` to leave native view bounds alone. |
| `markdownDirection` | on | Set `false` to leave Markdown's own `dir="auto"` alone. |

```jsonc
{
  "plugins": [
    {
      "package": "C:/path/to/opencode-fix-topbar",
      "options": { "inset": 138, "mirrorEmbeds": false, "markdownDirection": false }
    }
  ]
}
```

## Notes

- Windows only. macOS already handles its own window buttons and window layout.
- The browser fix patches Electron's `View.setBounds` in the main process, which is a workaround for a Chromium
  behaviour rather than a supported API. It only patches when the app's locale is right to left, and it restores the
  original method when the plugin unloads. Drop it once OpenCode places embeds itself.
- Unofficial plugin. Not affiliated with or endorsed by OpenCode.
- MIT licensed.
