// ABOUTME: Root React component for MindForge.
// ABOUTME: Will host the SVG canvas and keyboard event handling.

import { VERSION } from "@mindforge/core";

export function App() {
  return (
    <div>
      <h1>MindForge</h1>
      <p>Version: {VERSION}</p>
    </div>
  );
}
