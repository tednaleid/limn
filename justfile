# Limn development commands

# List available recipes
default:
    @just --list

# Install all dependencies
install:
    bun install

# Run all unit tests
test:
    bun run test

# Run tests with coverage
coverage:
    bun run test:coverage

# Run tests in watch mode
test-watch:
    bun run test:watch

# Run a specific test file (e.g., just test-file drag)
test-file name:
    bun run test -- --run 'packages/core/src/__tests__/{{name}}.test.ts'

# Run ESLint on all packages
lint:
    bun run lint

# Run the Obsidian-community-plugin lint rules (eslint-plugin-obsidianmd)
# against the bundled plugin source. Informational: shows scorecard-aligned
# findings locally. Not part of `just check` until Phase 2 of the scorecard
# cleanup lands (see docs/specs/obsidian-plugin-review.md).
lint-obsidian:
    bunx eslint --config eslint.obsidian.config.js packages/

# Start the Vite dev server (skips if already running on :5173)
serve:
    @if lsof -i :5173 -sTCP:LISTEN >/dev/null 2>&1; then \
        echo "Dev server already running on port 5173"; \
    else \
        bun run dev 2>&1 | tee /tmp/limn-dev.log; \
    fi

# Production build (Obsidian plugin — the primary artifact)
build:
    bun run build

# Build the web PWA (for GitHub Pages deploy)
build-web:
    bun run build:web

# Run tests, lint, type-check, and build Obsidian plugin (CI check)
check: coverage lint typecheck obsidian-build

# Install pre-commit hook that runs `just check`
install-hooks:
    echo '#!/bin/sh\njust check' > .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit

# Type-check with TypeScript (builds core declarations, checks web)
typecheck:
    bunx tsc -b

# Build the Obsidian plugin (production)
obsidian-build:
    cd packages/obsidian && bun run build

# Reproduce the Obsidian scorecard's failing automated checks locally, against
# the BUILT bundle (what the server-side scanner inspects), so we can iterate
# without pushing a release. See docs/specs/obsidian-plugin-review.md.
scorecard: obsidian-build
    #!/usr/bin/env bash
    set -uo pipefail
    bundle=packages/obsidian/dist/main.js
    echo "== Dependencies (scanner: DEPENDENCIES) =="
    bun audit || true
    echo
    scripts=$(grep -oE 'createElement\("script"\)' "$bundle" | wc -l | tr -d ' ')
    echo "== Code obfuscation: dynamic <script> creations in main.js =="
    echo "   createElement(\"script\") count = $scripts  (scanner Error when > 0)"
    if [ "$scripts" -gt 0 ]; then
      echo "   These are React DOM resource-preload internals (preinit/preloadModule),"
      echo "   not limn code; only removable by not bundling react-dom (e.g. Preact)."
    fi
    echo
    echo "== Build verification: reproducibility =="
    if grep -qE '"'"$(git rev-parse --short HEAD 2>/dev/null || echo __no_git__)"'"' "$bundle"; then
      echo "   WARNING: a live git sha is embedded; scanner's clean rebuild will not match"
    else
      echo "   no live git sha embedded -> deterministic, scanner rebuild should byte-match"
    fi

# Build the Obsidian plugin in dev/watch mode
obsidian-dev:
    cd packages/obsidian && bun run dev

# Remove any Limn plugin install from an Obsidian vault (current id + legacy ids)
obsidian-clean vault_path:
    rm -rf "{{vault_path}}/.obsidian/plugins/limn" "{{vault_path}}/.obsidian/plugins/obsidian-limn"
    @echo "Removed Limn plugin from {{vault_path}}/.obsidian/plugins/."

# Install plugin into an Obsidian vault via symlink (cleans any prior install first)
obsidian-install vault_path: (obsidian-clean vault_path)
    just obsidian-build
    mkdir -p "{{vault_path}}/.obsidian/plugins"
    ln -sfn "$(pwd)/packages/obsidian/dist" "{{vault_path}}/.obsidian/plugins/limn"
    @echo "Symlinked. Enable 'Limn' in Obsidian Settings -> Community plugins."

# Run obsidian package tests
obsidian-test:
    bun run test -- --run 'packages/obsidian/'

# Build release assets for GitHub Release (main.js, manifest.json, styles.css)
release: obsidian-build
    mkdir -p release
    cp packages/obsidian/dist/main.js release/
    cp packages/obsidian/dist/manifest.json release/
    cp packages/obsidian/dist/styles.css release/
    @echo "Release assets copied to release/"

# Bump version across all packages, commit, tag, and push
bump version="":
    bun run scripts/bump-version.ts {{version}}

# Delete a GitHub release and re-tag to re-trigger release workflow.
# Preserves the annotated tag message (release notes).
# Usage: just retag 0.9.9
retag version:
    #!/usr/bin/env bash
    set -euo pipefail
    tag="{{version}}"
    # Save existing tag annotation before deleting
    notes=$(git tag -l --format='%(contents)' "$tag" 2>/dev/null || echo "$tag")
    notes_file=$(mktemp)
    trap 'rm -f "$notes_file"' EXIT
    echo "$notes" > "$notes_file"
    gh release delete "$tag" --yes || true
    git push origin ":refs/tags/$tag" || true
    git tag -d "$tag" || true
    git tag -a "$tag" -F "$notes_file"
    git push && git push --tags

# Remove build artifacts and caches
clean:
    rm -rf coverage/ release/ dist/ packages/web/dist/ packages/obsidian/dist/

# Auto-fix lint issues
fmt:
    bun run lint -- --fix

# Clean and reinstall node_modules (fixes esbuild EPIPE errors after bun add)
clean-install:
    rm -rf node_modules packages/core/node_modules packages/web/node_modules
    bun install

# Build output lives outside the project tree to avoid iCloud/file-provider
# resource forks that break codesign.
desktop_build_dir := "/tmp/limn-desktop-build"

# Generate Xcode project from project.yml (run after modifying project.yml)
desktop-gen:
    cd packages/desktop && xcodegen generate

# Build the desktop app (Debug) and install to ~/Applications for Finder file association
desktop-build: desktop-gen
    cd packages/desktop && xcodebuild -project Limn.xcodeproj -scheme Limn -configuration Debug build SYMROOT={{desktop_build_dir}}
    rm -rf ~/Applications/Limn.app
    cp -R {{desktop_build_dir}}/Debug/Limn.app ~/Applications/Limn.app
    /System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister -f -R -trusted ~/Applications/Limn.app

# Build and run the desktop app in dev mode (loads from Vite dev server)
desktop-dev: desktop-build
    @echo "Launching Limn in dev mode (loading from localhost:5173)..."
    @echo "Make sure 'just serve' is running in another terminal."
    LIMN_DEV_URL="http://localhost:5173/limn/" ~/Applications/Limn.app/Contents/MacOS/Limn

# Open a .limn file in the running desktop app (sends via Apple Events)
desktop-open file:
    @open -a {{desktop_build_dir}}/Debug/Limn.app '{{file}}'

# Build the desktop app (Release) with bundled web resources
desktop-release: desktop-gen
    cd packages/web && bunx vite build --config vite.config.desktop.ts
    # WKWebView file:// URLs cannot load ES modules or pass CORS checks
    sed -i '' -e 's/ crossorigin//g' -e 's/ type="module"//g' -e 's/<script /<script defer /g' packages/web/dist-desktop/index.html
    cd packages/desktop && xcodebuild -project Limn.xcodeproj -scheme Limn -configuration Release build SYMROOT={{desktop_build_dir}}
    rm -rf {{desktop_build_dir}}/Release/Limn.app/Contents/Resources/web
    cp -r packages/web/dist-desktop/ {{desktop_build_dir}}/Release/Limn.app/Contents/Resources/web/
    rm -rf packages/web/dist-desktop

# Build Release app and install to ~/Applications for daily use
desktop-release-install: desktop-release
    rm -rf ~/Applications/Limn.app
    cp -R {{desktop_build_dir}}/Release/Limn.app ~/Applications/Limn.app
    /System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister -f -R -trusted ~/Applications/Limn.app
    @echo "Installed to ~/Applications/Limn.app"

# Run desktop unit tests
desktop-test: desktop-gen
    cd packages/desktop && xcodebuild -project Limn.xcodeproj -scheme Limn -configuration Debug test SYMROOT={{desktop_build_dir}}

# Quit the running desktop app gracefully (triggers applicationWillTerminate for session save)
desktop-stop:
    @osascript -e 'tell application "Limn" to quit' 2>/dev/null || echo "Limn is not running"

# Force-kill the running desktop app (no cleanup, session not saved)
desktop-kill:
    @pkill -f 'Limn.app/Contents/MacOS/Limn' 2>/dev/null || echo "Limn is not running"

# Generate macOS app icon sizes from a 1024x1024 source PNG
desktop-icon source:
    scripts/generate-app-icon.py {{source}}

# Nuke the macOS icon cache. Run after changing app icons if Stage Manager
# or Finder still shows the old icon. Pass --force to actually delete.
desktop-nuke-icon-cache force="":
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Commands to clear macOS icon caches:"
    echo "  sudo rm -rf /Library/Caches/com.apple.iconservices.store"
    echo "  sudo find /private/var/folders/ -name com.apple.dock.iconcache or com.apple.iconservices -exec rm -rf"
    echo "  killall Dock Finder"
    echo
    if [ "{{force}}" = "--force" ]; then
        echo "Clearing caches (requires sudo)..."
        sudo rm -rf /Library/Caches/com.apple.iconservices.store
        sudo find /private/var/folders/ \( -name com.apple.dock.iconcache -or -name com.apple.iconservices \) -exec rm -rf {} \; 2>/dev/null || true
        killall Dock; killall Finder
        echo "Done. Dock and Finder restarted."
    else
        echo "Dry run. To execute, run:"
        echo "  just desktop-nuke-icon-cache --force"
    fi

# Package the desktop app into a signed, notarized DMG
desktop-package: desktop-release
    scripts/desktop-package.py

# Verify the built DMG passes Gatekeeper
desktop-verify:
    spctl -a -t open --context context:primary-signature {{desktop_build_dir}}/Limn-*.dmg
    codesign -dvv {{desktop_build_dir}}/Release/Limn.app

# Clean desktop build artifacts (including Xcode DerivedData cache and dev UserDefaults)
desktop-clean:
    rm -rf {{desktop_build_dir}} packages/desktop/Limn.xcodeproj ~/Applications/Limn.app
    rm -rf ~/Library/Developer/Xcode/DerivedData/Limn-*
    defaults delete com.tednaleid.Limn 2>/dev/null || true

# Reset desktop app preferences (session bookmarks, user defaults)
desktop-reset:
    @defaults delete com.tednaleid.Limn 2>/dev/null && echo "Cleared com.tednaleid.Limn defaults" || echo "No defaults to clear"

# -- Desktop inspection (debug server on localhost:9876) --

# List all open windows in the running desktop app
desktop-inspect-windows:
    @curl -sf localhost:9876/windows | jq .

# Evaluate JS in the running desktop app's WKWebView
# Pass filename as second arg to target a specific window: just desktop-inspect-eval '...' test-b.limn
desktop-inspect-eval js file="":
    @curl -sf -X POST 'localhost:9876/eval{{ if file != "" { "?file=" + file } else { "" } }}' -d '{{js}}' | jq .

# Capture a screenshot of the running desktop app (timestamped by default)
desktop-inspect-screenshot file="" path=(".llm/inspect/screenshot-" + `date +%Y%m%d-%H%M%S` + ".png"):
    @mkdir -p .llm/inspect && curl -sf 'localhost:9876/screenshot{{ if file != "" { "?file=" + file } else { "" } }}' -o '{{path}}' && echo '{{path}}'

# Get editor state (node count, filename, selection) from the running desktop app
desktop-inspect-state file="":
    @curl -sf 'localhost:9876/state{{ if file != "" { "?file=" + file } else { "" } }}' | jq .

# Get the current document as JSON from the running desktop app
desktop-inspect-json file="":
    @just desktop-inspect-eval 'JSON.stringify(window.limn.toJSON())' '{{ if file != "" { file } else { "" } }}' | jq -r '.result' | jq .
