# Testing

## Philosophy

Red/green TDD -- write failing tests first, then make them pass. Testing is a first-class citizen.

## JS/TS Tests (vitest)

```bash
just test             # Run all unit tests
just test-file drag   # Run a specific test file (matches by name)
just test-watch       # Run tests in watch mode
just coverage         # Run tests with coverage report
just check            # Full CI check: tests + lint + typecheck + obsidian build
```

Tests live alongside source in `packages/core/src/__tests__/` and `packages/web/src/__tests__/`.

## Swift Unit Tests (XCTest)

```bash
just desktop-test     # Build and run all desktop unit tests
```

Tests live in `packages/desktop/LimnTests/`. Test testable logic (URL handling, data parsing, coordinator registry) without requiring a running app. Use `@testable import Limn` for internal access.

## Debug Server (ad-hoc inspection)

Debug builds include a lightweight HTTP server on `localhost:9876` for programmatic inspection of the running app. Only compiled in `#if DEBUG` -- never ships in Release.

### Architecture

```mermaid
graph LR
    CLI["just desktop-eval / screenshot / state"]
    CLI -->|curl localhost:9876| DS["DebugServer (NWListener)"]
    DS -->|MainActor| WV["WKWebView"]
    WV -->|evaluateJavaScript| JS["Limn Web App"]
    DS -->|takeSnapshot| PNG["PNG screenshot"]
    WV -.->|result| DS
    DS -.->|JSON response| CLI
```

### Commands

```bash
just desktop-windows                                        # List all open windows
just desktop-eval 'document.querySelectorAll("[data-node-id]").length'  # Eval JS in first window
just desktop-eval 'document.title' file=test-b.limn         # Eval JS in specific window
just desktop-screenshot                                     # Screenshot first window (timestamped)
just desktop-screenshot file=test-b.limn                    # Screenshot specific window
just desktop-state                                          # Node count, filename, selection
just desktop-state file=test-a.limn                         # State for specific window
```

Screenshots save to `.llm/desktop-scratch/` (gitignored).

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/windows` | GET | List all open windows with index, filename, URL |
| `/eval` | POST | Evaluate JS in WKWebView, body = JS code |
| `/screenshot` | GET | Capture WKWebView as PNG |
| `/state` | GET | Shortcut for node count, selection, filename, zoom |

All endpoints except `/windows` accept `?file=<filename>` to target a specific window. Defaults to the first registered window.

## When to Use What

- **Unit tests** (`just test`, `just desktop-test`): Logic, data transformations, state management. Always prefer these.
- **Debug server** (`just desktop-eval`, etc.): Ad-hoc inspection during development. Verify rendering, check for JS errors, capture screenshots for visual review.
