// ABOUTME: SVG canvas component with pan/zoom viewport for rendering mind maps.
// ABOUTME: Renders all visible nodes and edges from Editor state.

import { useCallback, useRef, useState, useEffect } from "react";
import type { MindMapNode } from "@mindforge/core";
import { useEditor } from "../hooks/useEditor";
import { useAssetUrls } from "../hooks/useAssetUrls";
import { NodeView } from "./NodeView";
import { EdgeView } from "./EdgeView";
import { TextEditor } from "./TextEditor";
import { ReparentIndicator } from "./ReparentIndicator";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const DRAG_THRESHOLD = 4; // pixels before a pointerDown becomes a drag

export function MindMapCanvas() {
  const editor = useEditor();
  const svgRef = useRef<SVGSVGElement>(null);
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  // Node drag state
  const pendingNodeId = useRef<string | null>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const isDraggingNode = useRef(false);

  const camera = editor.getCamera();
  const allVisibleNodes = editor.getVisibleNodes();
  const selectedId = editor.getSelectedId();
  const isEditing = editor.isEditing();
  const isDragging = editor.isDragging();
  const reparentTargetId = editor.getReparentTarget();
  const rootIds = new Set(editor.getRoots().map((r) => r.id));
  const assetUrls = useAssetUrls();

  // Track viewport dimensions for culling and keyboard zoom-to-fit
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const updateSize = () => {
      if (svgRef.current) {
        const w = svgRef.current.clientWidth;
        const h = svgRef.current.clientHeight;
        setViewportSize({ width: w, height: h });
        editor.setViewportSize(w, h);
      }
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [editor]);

  // Viewport culling: only render nodes within the visible area (with padding)
  const CULL_PADDING = 200; // extra pixels beyond viewport to avoid pop-in
  const visibleNodes = viewportSize.width > 0
    ? allVisibleNodes.filter((node) => {
        const screenX = node.x * camera.zoom + camera.x;
        const screenY = node.y * camera.zoom + camera.y;
        const screenW = node.width * camera.zoom;
        const screenH = node.height * camera.zoom;
        return (
          screenX + screenW > -CULL_PADDING &&
          screenX < viewportSize.width + CULL_PADDING &&
          screenY + screenH > -CULL_PADDING &&
          screenY < viewportSize.height + CULL_PADDING
        );
      })
    : allVisibleNodes; // Render all until viewport size is known

  // Get the editing node for the TextEditor overlay
  const editingNode = isEditing && selectedId ? editor.getNode(selectedId) : null;

  // Build a map of all visible nodes (pre-cull) for edge lookups
  const allNodeMap = new Map<string, MindMapNode>();
  for (const node of allVisibleNodes) {
    allNodeMap.set(node.id, node);
  }

  // Collect edges: for each viewport node with a parent, draw the edge
  const edges: { parent: MindMapNode; child: MindMapNode }[] = [];
  for (const node of visibleNodes) {
    if (node.parentId !== null) {
      const parent = allNodeMap.get(node.parentId);
      if (parent) {
        edges.push({ parent, child: node });
      }
    }
  }

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const cam = editor.getCamera();

      if (e.ctrlKey || e.metaKey) {
        // Zoom: pinch-to-zoom or Cmd+scroll
        const zoomFactor = 1 - e.deltaY * 0.005;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * zoomFactor));

        // Zoom toward cursor position
        const svg = svgRef.current;
        if (svg) {
          const rect = svg.getBoundingClientRect();
          const cursorX = e.clientX - rect.left;
          const cursorY = e.clientY - rect.top;

          // World coordinates under cursor before zoom
          const worldX = (cursorX - cam.x) / cam.zoom;
          const worldY = (cursorY - cam.y) / cam.zoom;

          // New camera position to keep world point under cursor
          const newX = cursorX - worldX * newZoom;
          const newY = cursorY - worldY * newZoom;

          editor.setCamera(newX, newY, newZoom);
        }
      } else {
        // Pan
        editor.setCamera(cam.x - e.deltaX, cam.y - e.deltaY, cam.zoom);
      }
    },
    [editor],
  );

  /** Convert screen coordinates to world coordinates. */
  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const cam = editor.getCamera();
      return {
        x: (clientX - rect.left - cam.x) / cam.zoom,
        y: (clientY - rect.top - cam.y) / cam.zoom,
      };
    },
    [editor],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const target = e.target as SVGElement;
      const isCanvas = target.tagName === "svg" || target.classList.contains("canvas-bg");

      if (isCanvas) {
        // Canvas background: start panning
        isPanning.current = true;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        svgRef.current?.setPointerCapture(e.pointerId);
      } else {
        // Node element: record for potential drag
        const nodeGroup = target.closest("[data-node-id]") as SVGElement | null;
        if (nodeGroup) {
          pendingNodeId.current = nodeGroup.getAttribute("data-node-id");
          pointerStart.current = { x: e.clientX, y: e.clientY };
          isDraggingNode.current = false;
          svgRef.current?.setPointerCapture(e.pointerId);
        }
      }
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - lastPointer.current.x;
        const dy = e.clientY - lastPointer.current.y;
        lastPointer.current = { x: e.clientX, y: e.clientY };
        const cam = editor.getCamera();
        editor.setCamera(cam.x + dx, cam.y + dy, cam.zoom);
        return;
      }

      if (pendingNodeId.current !== null) {
        const dx = e.clientX - pointerStart.current.x;
        const dy = e.clientY - pointerStart.current.y;
        const dist = Math.hypot(dx, dy);

        if (!isDraggingNode.current && dist >= DRAG_THRESHOLD) {
          // Exceeded threshold: start drag
          isDraggingNode.current = true;
          const world = screenToWorld(pointerStart.current.x, pointerStart.current.y);
          editor.startDrag(pendingNodeId.current, world.x, world.y);
        }

        if (isDraggingNode.current) {
          const world = screenToWorld(e.clientX, e.clientY);
          editor.updateDrag(world.x, world.y);
        }
      }
    },
    [editor, screenToWorld],
  );

  const handlePointerUp = useCallback(
    (_e: React.PointerEvent) => {
      if (isPanning.current) {
        isPanning.current = false;
        return;
      }

      if (pendingNodeId.current !== null) {
        const nodeId = pendingNodeId.current;
        if (isDraggingNode.current) {
          // Was dragging: end drag
          editor.endDrag();
        } else {
          // Was a click (no drag threshold exceeded): select
          if (editor.isEditing()) {
            editor.exitEditMode();
          }
          if (editor.getSelectedId() !== nodeId || editor.isEditing()) {
            editor.select(nodeId);
          }
        }
        pendingNodeId.current = null;
        isDraggingNode.current = false;
      }
    },
    [editor],
  );

  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      editor.select(nodeId);
      editor.enterEditMode();
    },
    [editor],
  );

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // Double-click on canvas background: create new root
      const target = e.target as SVGElement;
      if (target.tagName !== "svg" && !target.classList.contains("canvas-bg")) {
        return;
      }
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const worldX = (e.clientX - rect.left - camera.x) / camera.zoom;
      const worldY = (e.clientY - rect.top - camera.y) / camera.zoom;
      editor.addRoot("", worldX, worldY);
    },
    [editor, camera],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Allow drop of image files
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const imageFile = files.find((f) => f.type.startsWith("image/"));
      if (!imageFile) return;

      const world = screenToWorld(e.clientX, e.clientY);

      // Find node under drop point
      const target = document.elementFromPoint(e.clientX, e.clientY) as SVGElement | null;
      const nodeGroup = target?.closest("[data-node-id]") as SVGElement | null;
      const targetNodeId = nodeGroup?.getAttribute("data-node-id") ?? null;

      // Read image dimensions and create blob URL
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const assetId = `a${Date.now()}`;
          const asset = {
            id: assetId,
            filename: imageFile.name,
            mimeType: imageFile.type,
            width: img.naturalWidth,
            height: img.naturalHeight,
          };

          // Scale display size to reasonable dimensions
          const maxDisplayWidth = 300;
          const scale = Math.min(1, maxDisplayWidth / img.naturalWidth);
          const displayWidth = Math.round(img.naturalWidth * scale);
          const displayHeight = Math.round(img.naturalHeight * scale);

          const blobUrl = URL.createObjectURL(imageFile);

          if (targetNodeId) {
            // Drop on node: attach image to that node
            editor.setNodeImage(targetNodeId, asset, displayWidth, displayHeight);
          } else {
            // Drop on canvas: create new root with image
            const rootId = editor.addRoot("", world.x, world.y);
            editor.exitEditMode();
            editor.setNodeImage(rootId, asset, displayWidth, displayHeight);
          }

          // Dispatch custom event so App can register the blob URL
          window.dispatchEvent(new CustomEvent("mindforge:asset-added", {
            detail: { assetId, blobUrl },
          }));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(imageFile);
    },
    [editor, screenToWorld],
  );

  return (
    <div
      style={{ position: "relative", width: "100%", height: "100%" }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <svg
        ref={svgRef}
        data-mindforge-canvas
        role="group"
        aria-label="Mind Map"
        style={{
          width: "100%",
          height: "100%",
          cursor: isPanning.current || isDragging ? "grabbing" : "default",
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleCanvasDoubleClick}
      >
        <rect className="canvas-bg" width="100%" height="100%" fill="#f9fafb" />
        <g transform={`translate(${camera.x}, ${camera.y}) scale(${camera.zoom})`}>
          {edges.map((edge) => (
            <EdgeView
              key={`${edge.parent.id}-${edge.child.id}`}
              parent={edge.parent}
              child={edge.child}
            />
          ))}
          {visibleNodes.map((node) => {
            const shouldAnimate = !isDragging;
            const depth = editor.getNodeDepth(node.id);
            const hasChildren = node.children.length > 0;
            return (
              <g
                key={node.id}
                data-node-id={node.id}
                role="treeitem"
                aria-level={depth + 1}
                aria-selected={node.id === selectedId}
                aria-expanded={hasChildren ? !node.collapsed : undefined}
                aria-label={node.text || "Empty node"}
                onDoubleClick={() => handleNodeDoubleClick(node.id)}
                style={{
                  cursor: isDragging ? "grabbing" : "pointer",
                  transform: `translate(${node.x}px, ${node.y}px)`,
                  transition: shouldAnimate ? "transform 200ms ease-out" : "none",
                }}
              >
                <NodeView
                  node={node}
                  isSelected={node.id === selectedId}
                  isRoot={rootIds.has(node.id)}
                  isReparentTarget={node.id === reparentTargetId}
                  imageUrl={node.image ? assetUrls.get(node.image.assetId) : undefined}
                />
              </g>
            );
          })}
          {reparentTargetId && isDragging && selectedId && (
            <ReparentIndicator
              draggedNode={editor.getNode(selectedId)}
              targetNode={editor.getNode(reparentTargetId)}
            />
          )}
        </g>
      </svg>
      {editingNode && (
        <TextEditor editor={editor} node={editingNode} camera={camera} />
      )}
    </div>
  );
}
