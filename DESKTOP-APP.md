# Desktop App

Limn ships as a native macOS app built with Swift/SwiftUI wrapping a WKWebView.
The source lives in `packages/desktop/`.

## Development

```bash
just serve              # Start Vite dev server (port 5173)
just desktop-dev        # Build and launch in dev mode (loads from Vite)
just desktop-build      # Build Debug config, install to ~/Applications
just desktop-test       # Run XCTest unit tests
just desktop-release    # Build Release config with bundled web resources
```

The project uses XcodeGen. `project.yml` is the source of truth; the `.xcodeproj` is
generated and gitignored. All `desktop-*` recipes call `desktop-gen` automatically.

## Packaging and Distribution

The desktop app is distributed as a signed, notarized DMG via GitHub Releases.

### Prerequisites (one-time setup)

1. **Enroll in the Apple Developer Program** ($99/year) at https://developer.apple.com.

2. **Create a Developer ID Application certificate** in Xcode:
   Settings > Accounts > select your team > Manage Certificates > "+" > Developer ID Application.

3. **Note your Team ID** (10-character string). Find it in Xcode: Settings > Accounts,
   or at https://developer.apple.com/account under Membership Details.

4. **Update `packages/desktop/project.yml`**: replace `PLACEHOLDER` in the Release
   config's `DEVELOPMENT_TEAM` with your Team ID.

5. **Create an app-specific password** at https://appleid.apple.com:
   Sign In and Security > App-Specific Passwords.

6. **Store notarization credentials** in the macOS Keychain so the packaging script
   can submit without prompting:

   ```bash
   xcrun notarytool store-credentials "limn-notarize" \
     --apple-id YOUR_APPLE_ID \
     --team-id YOUR_TEAM_ID \
     --password YOUR_APP_SPECIFIC_PASSWORD
   ```

### Release workflow

```bash
just bump 1.0.0           # Bump version across all packages, commit, tag, push
just desktop-package       # Build Release .app, create DMG, sign, notarize, staple
just desktop-verify        # Confirm Gatekeeper accepts the DMG and .app
```

Then upload the DMG from `/tmp/limn-desktop-build/Limn-<version>.dmg` to the
GitHub Release that the tag created.

### What the packaging script does

`scripts/desktop-package.py` runs the following steps:

1. Expects a Release build at `/tmp/limn-desktop-build/Release/Limn.app`
   (produced by `just desktop-release`, which is a dependency of `desktop-package`).
2. Reads the version from the built `Info.plist`.
3. Creates a staging directory containing `Limn.app` and an `Applications` symlink.
4. Creates a compressed DMG via `hdiutil create`.
5. Signs the DMG with `codesign --sign "Developer ID Application"`.
6. Submits to Apple for notarization via `xcrun notarytool submit --wait`.
7. Staples the notarization ticket via `xcrun stapler staple`.

### Build signing configuration

Debug and Release use different signing strategies (configured in `project.yml`):

| Setting | Debug | Release |
|---------|-------|---------|
| CODE_SIGN_STYLE | Automatic | Manual |
| CODE_SIGN_IDENTITY | (default) | Developer ID Application |
| DEVELOPMENT_TEAM | (auto) | Set in project.yml |
| ARCHS | (default) | arm64 |

Hardened Runtime is enabled for both configurations. The JIT entitlement
(`com.apple.security.cs.allow-jit`) is required for WKWebView JavaScript execution.
Debug builds additionally have network client and unsigned executable entitlements
(via `Limn.debug.entitlements`).

### Build number

`CURRENT_PROJECT_VERSION` in `project.yml` is automatically incremented each time
`just bump` runs. Apple requires this number to increase monotonically across
submissions.

### Troubleshooting

- **"Apple cannot check it for malicious software"**: The DMG was not notarized.
  Run `just desktop-package` with valid credentials configured (see Prerequisites).

- **`codesign` fails with "no identity found"**: You need a Developer ID Application
  certificate. See step 2 above.

- **Notarization rejected**: Check the log URL in the output. Common causes are
  missing Hardened Runtime, unsigned frameworks, or disallowed entitlements.

- **`spctl` rejects the DMG**: The notarization ticket was not stapled.
  Run `xcrun stapler staple /tmp/limn-desktop-build/Limn-<version>.dmg`.
