// ABOUTME: Context and hook for mapping asset IDs to browser-displayable URLs.
// ABOUTME: Manages blob URLs for images stored as sidecar assets.

import { createContext, useContext } from "react";

/** Maps asset IDs to displayable URLs (blob: or data: URLs). */
export type AssetUrlMap = Map<string, string>;

export const AssetUrlContext = createContext<AssetUrlMap>(new Map());

export function useAssetUrls(): AssetUrlMap {
  return useContext(AssetUrlContext);
}
