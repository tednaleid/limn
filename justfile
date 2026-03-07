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

# Start the Vite dev server (skips if already running on :5173)
serve:
    @if lsof -i :5173 -sTCP:LISTEN >/dev/null 2>&1; then \
        echo "Dev server already running on port 5173"; \
    else \
        bun run dev 2>&1 | tee /tmp/limn-dev.log; \
    fi

# Production build
build:
    bun run build

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

# Build the Obsidian plugin in dev/watch mode
obsidian-dev:
    cd packages/obsidian && bun run dev

# Install plugin into an Obsidian vault via symlink
obsidian-install vault_path:
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
desktop-dev: desktop-gen
    cd packages/desktop && xcodebuild -project Limn.xcodeproj -scheme Limn -configuration Debug build SYMROOT={{desktop_build_dir}}
    @echo "Launching Limn in dev mode (loading from localhost:5173)..."
    @echo "Make sure 'just serve' is running in another terminal."
    LIMN_DEV_URL="http://localhost:5173/limn/" {{desktop_build_dir}}/Debug/Limn.app/Contents/MacOS/Limn

# Build the desktop app (Release) with bundled web resources
desktop-release: build desktop-gen
    mkdir -p packages/desktop/Limn/Resources
    cp -r packages/web/dist/ packages/desktop/Limn/Resources/web/
    cd packages/desktop && xcodebuild -project Limn.xcodeproj -scheme Limn -configuration Release build SYMROOT={{desktop_build_dir}}
    rm -rf packages/desktop/Limn/Resources

# Run desktop unit tests
desktop-test: desktop-gen
    cd packages/desktop && xcodebuild -project Limn.xcodeproj -scheme Limn -configuration Debug test SYMROOT={{desktop_build_dir}}

# Quit the running desktop app
desktop-stop:
    @osascript -e 'tell application "Limn" to quit' 2>/dev/null || pkill -f 'Limn.app/Contents/MacOS/Limn' 2>/dev/null || echo "Limn is not running"

# Clean desktop build artifacts
desktop-clean:
    rm -rf {{desktop_build_dir}} packages/desktop/Limn.xcodeproj ~/Applications/Limn.app

# -- Desktop inspection (debug server on localhost:9876) --

# List all open windows in the running desktop app
desktop-inspect-windows:
    @curl -sf localhost:9876/windows | jq .

# Evaluate JS in the running desktop app's WKWebView
# Use file= to target a specific window: just desktop-inspect-eval '...' file=test-b.limn
desktop-inspect-eval js file="":
    @curl -sf -X POST 'localhost:9876/eval{{ if file != "" { "?file=" + file } else { "" } }}' -d '{{js}}' | jq .

# Capture a screenshot of the running desktop app (timestamped by default)
desktop-inspect-screenshot file="" path=(".llm/inspect/screenshot-" + `date +%Y%m%d-%H%M%S` + ".png"):
    @mkdir -p .llm/inspect && curl -sf 'localhost:9876/screenshot{{ if file != "" { "?file=" + file } else { "" } }}' -o '{{path}}' && echo "Saved to {{path}}"

# Get editor state (node count, filename, selection) from the running desktop app
desktop-inspect-state file="":
    @curl -sf 'localhost:9876/state{{ if file != "" { "?file=" + file } else { "" } }}' | jq .

# Get the current document as JSON from the running desktop app
desktop-inspect-json file="":
    @just desktop-inspect-eval 'JSON.stringify(window.limn.toJSON())' {{ if file != "" { "file=" + file } else { "" } }} | jq -r '.result' | jq .
