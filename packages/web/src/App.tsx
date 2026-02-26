// ABOUTME: Root React component for MindForge.
// ABOUTME: Hosts the SVG canvas with a demo mind map.

import { useMemo } from "react";
import { Editor } from "@mindforge/core";
import type { MindMapFileFormat } from "@mindforge/core";
import { EditorContext } from "./hooks/useEditor";
import { MindMapCanvas } from "./components/MindMapCanvas";
import { useKeyboardHandler } from "./input/useKeyboardHandler";

const DEMO_MAP: MindMapFileFormat = {
  version: 1,
  meta: { id: "demo", theme: "default" },
  camera: { x: 400, y: 300, zoom: 1 },
  roots: [
    {
      id: "root",
      text: "MindForge",
      x: 0,
      y: 0,
      width: 100,
      height: 32,
      children: [
        {
          id: "c1",
          text: "Core Engine",
          x: 250,
          y: -78,
          width: 100,
          height: 32,
          children: [
            { id: "gc1", text: "Store", x: 500, y: -104, width: 100, height: 32, children: [] },
            { id: "gc2", text: "Layout", x: 500, y: -52, width: 100, height: 32, children: [] },
          ],
        },
        {
          id: "c2",
          text: "Web App",
          x: 250,
          y: 0,
          width: 100,
          height: 32,
          children: [
            { id: "gc3", text: "SVG Renderer", x: 500, y: -26, width: 100, height: 32, children: [] },
            { id: "gc4", text: "Keyboard Input", x: 500, y: 26, width: 100, height: 32, children: [] },
          ],
        },
        {
          id: "c3",
          text: "Persistence",
          x: 250,
          y: 78,
          width: 100,
          height: 32,
          children: [],
        },
      ],
    },
  ],
  assets: [],
};

export function App() {
  const editor = useMemo(() => {
    const e = new Editor();
    e.loadJSON(DEMO_MAP);
    return e;
  }, []);

  useKeyboardHandler(editor);

  return (
    <EditorContext.Provider value={editor}>
      <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
        <MindMapCanvas />
      </div>
    </EditorContext.Provider>
  );
}
