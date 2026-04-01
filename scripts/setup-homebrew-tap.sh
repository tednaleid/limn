#!/usr/bin/env bash
# ABOUTME: Creates the tednaleid/homebrew-limn tap repo on GitHub and seeds it
# ABOUTME: with an initial cask from the latest release.
set -euo pipefail

OWNER="tednaleid"
TAP_REPO="homebrew-limn"
MAIN_REPO="limn"

# -- Preflight checks --

if ! command -v gh &>/dev/null; then
    echo "Error: gh CLI is required. Install with: brew install gh"
    exit 1
fi

if ! gh auth status &>/dev/null; then
    echo "Error: not authenticated with gh. Run: gh auth login"
    exit 1
fi

# -- Get latest release version and compute SHA-256 for the DMG --

echo "Fetching latest release info..."
VERSION=$(gh release view --repo "${OWNER}/${MAIN_REPO}" --json tagName -q .tagName)

DMG_URL="https://github.com/${OWNER}/${MAIN_REPO}/releases/download/${VERSION}/Limn-${VERSION}.dmg"
echo "Downloading Limn-${VERSION}.dmg to compute SHA-256..."
SHA256=$(curl -sL "$DMG_URL" | shasum -a 256 | awk '{print $1}')
echo "  SHA-256: ${SHA256}"

# -- Create the tap repo --

if gh repo view "${OWNER}/${TAP_REPO}" &>/dev/null; then
    echo "Repo ${OWNER}/${TAP_REPO} already exists, skipping creation."
else
    echo "Creating ${OWNER}/${TAP_REPO}..."
    gh repo create "${OWNER}/${TAP_REPO}" --public \
        --description "Homebrew tap for Limn"
fi

# -- Clone, populate, and push --

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

gh repo clone "${OWNER}/${TAP_REPO}" "$WORKDIR"
cd "$WORKDIR"

mkdir -p Casks

cat > Casks/limn.rb << CASK
cask "limn" do
  version "${VERSION}"
  sha256 "${SHA256}"

  url "https://github.com/${OWNER}/${MAIN_REPO}/releases/download/#{version}/Limn-#{version}.dmg"
  name "Limn"
  desc "Keyboard-first, offline-capable mind map app"
  homepage "https://github.com/${OWNER}/${MAIN_REPO}"

  depends_on macos: ">= :sonoma"

  app "Limn.app"

  zap trash: [
    "~/Library/Preferences/com.tednaleid.Limn.plist",
  ]
end
CASK

cat > README.md << 'README'
# homebrew-limn

Homebrew tap for [Limn](https://github.com/tednaleid/limn).

## Install

```bash
brew install tednaleid/limn/limn
```

Or:

```bash
brew tap tednaleid/limn
brew install --cask limn
```

## Update

```bash
brew upgrade --cask limn
```
README

git add Casks/ README.md
git commit -m "Initial cask for Limn ${VERSION}"
git push

echo ""
echo "Tap repo created and populated at: https://github.com/${OWNER}/${TAP_REPO}"
echo ""
echo "-- Next step: create a fine-grained Personal Access Token --"
echo ""
echo "1. Go to: https://github.com/settings/personal-access-tokens/new"
echo "2. Token name: limn-homebrew-tap"
echo "3. Repository access: Only select repositories -> ${OWNER}/${TAP_REPO}"
echo "4. Permissions: Contents -> Read and write"
echo "5. Generate the token and copy it"
echo ""
echo "Then set it as a secret on the limn repo:"
echo ""
echo "  gh secret set HOMEBREW_TAP_TOKEN --repo ${OWNER}/${MAIN_REPO}"
echo ""
echo "(Paste the token when prompted.)"
