// ABOUTME: React context and hook for accessing the PersistenceProvider.
// ABOUTME: Follows the same pattern as EditorContext/useEditor.

import { createContext, useContext } from "react";
import type { PersistenceProvider } from "@limn/core";

export const PersistenceContext = createContext<PersistenceProvider | null>(null);

/** Get the PersistenceProvider from context. Throws if not provided. */
export function usePersistence(): PersistenceProvider {
  const provider = useContext(PersistenceContext);
  if (!provider) throw new Error("usePersistence must be used within PersistenceContext.Provider");
  return provider;
}
