---
name: inspect
description: Inspect the running Limn desktop app via its debug HTTP server. Use this skill whenever you need to check what the app is rendering, verify DOM state, look for JS errors, capture screenshots, check node counts, or investigate any runtime behavior of the desktop app. Also use when debugging issues that require seeing what the WKWebView is actually displaying. Trigger on phrases like "check the app", "what does it look like", "is it rendering", "any JS errors", "screenshot the app", "how many nodes", or any ad-hoc investigation of the running desktop app.
allowed-tools: Bash(just desktop-*), Read, Write
---

# Inspect Running Desktop App

The Limn desktop app (Debug builds only) runs an HTTP server on `localhost:9876` for programmatic inspection. All interaction goes through `just` recipes -- never call curl directly.

## Prerequisites

The app must be running in debug mode (`just desktop-dev`). If commands return empty output or connection refused, the app is not running -- ask Ted to start it.

## Output directory

All inspection artifacts (screenshots, logs, scripts, notes) go in `.llm/inspect/`. This directory is gitignored.

## Commands

All commands below are `just` recipes. Run them from the project root.

### List open windows

```bash
just desktop-windows
```

Returns JSON array of open windows with index, filename, and URL. Run this first to see what's available.

### Evaluate JavaScript

```bash
just desktop-eval '<js-expression>'
just desktop-eval '<js-expression>' file=<filename>
```

Returns `{"result": <value>}` or `{"error": "..."}`. Use `file=` to target a specific window by filename.

### Capture screenshot

```bash
just desktop-screenshot
just desktop-screenshot file=<filename>
```

Saves PNG to `.llm/inspect/screenshot-<timestamp>.png`. After capturing, read the saved PNG file to visually verify rendering.

### Get editor state

```bash
just desktop-state
just desktop-state file=<filename>
```

Returns `{"nodeCount": N, "selectedId": "...", "filename": "...", "zoom": N}`.

## Saving results

When investigating an issue, save findings to `.llm/inspect/`:

- **Screenshots**: automatically saved there by `just desktop-screenshot`
- **Investigation logs**: save as `.llm/inspect/<topic>.md` with findings, commands run, and conclusions
- **Helper scripts**: save one-off inspection scripts to `.llm/inspect/` (not the project source tree)

## Investigation patterns

### Check for JS errors

```bash
just desktop-eval 'window.__lmnErrors || "none"'
```

### Verify file loaded correctly

```bash
just desktop-state file=test-a.limn
just desktop-eval 'document.querySelectorAll("[data-node-id]").length' file=test-a.limn
```

### Visual verification

```bash
just desktop-screenshot file=test-a.limn
```

Then read the saved PNG to see what the app is rendering.

### Multi-window comparison

```bash
just desktop-windows
just desktop-state file=test-a.limn
just desktop-state file=test-b.limn
```

### Inspect DOM structure

```bash
just desktop-eval 'document.querySelector("[data-node-id]")?.outerHTML'
just desktop-eval 'document.querySelector(".selected")?.textContent'
```

## Tips

- All commands except `desktop-windows` accept `file=<filename>` to target a window.
- If no `file=` is given, the first registered window is used.
- The debug server only exists in `#if DEBUG` builds -- it is not in Release.
- For complex JS, use single quotes around the whole expression in `just desktop-eval`.
- Run multiple independent queries in parallel for faster investigation.
