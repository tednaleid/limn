// ABOUTME: Entry point for the Limn web application.
// ABOUTME: Resolves document routing before mounting the React app.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isDesktop } from "./persistence/desktop-bridge";
import { resolveDocId } from "./persistence/docRouting";
import "./index.css";

async function mount() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Root element not found");

  // Desktop mode uses Swift bridge for persistence; skip IndexedDB-based routing
  // which fails on file:// origins where IndexedDB is unavailable.
  const route = isDesktop()
    ? { docId: "desktop" }
    : await resolveDocId(window.location.hash);

  if (route.replaceHash) {
    history.replaceState(null, "", route.replaceHash);
  }

  createRoot(root).render(
    <StrictMode>
      <App docId={route.docId} initialData={route.initialData} />
    </StrictMode>,
  );
}

void mount();
