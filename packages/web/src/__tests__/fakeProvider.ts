// ABOUTME: A PersistenceProvider test double whose methods are no-ops unless overridden.
// ABOUTME: Shared by the web tests that exercise image attachment.

import { vi } from "vitest";
import type { PersistenceProvider } from "@limn/core";

export function fakeProvider(overrides: Partial<PersistenceProvider> = {}): PersistenceProvider {
  return {
    load: () => Promise.resolve(null),
    save: () => Promise.resolve(),
    saveAsset: vi.fn(() => Promise.resolve()),
    loadAsset: () => Promise.resolve(undefined),
    loadAssetUrls: () => Promise.resolve(new Map()),
    onExternalChange: () => () => {},
    dispose: () => {},
    ...overrides,
  };
}
