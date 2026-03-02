// ABOUTME: Hamburger menu component for file operations and settings.
// ABOUTME: Renders a fixed-position menu button in the upper-left corner.

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor } from "../hooks/useEditor";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { THEME_REGISTRY, getThemesByMode } from "@limn/core";
import type { ThemeKey } from "@limn/core";
import { resolveSystemMode } from "../theme/themes";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

/** Normalize "default" to "system" for display. */
function normalizeTheme(theme: string): string {
  return theme === "default" ? "system" : theme;
}

export type MenuItemDef = { label: string; shortcut?: string; onClick: () => void } | null;

export interface HamburgerMenuProps {
  items?: MenuItemDef[];
  showTheme?: boolean;
  keystrokeOverlay?: boolean;
}

export function HamburgerMenu({ items, showTheme = true, keystrokeOverlay }: HamburgerMenuProps) {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentTheme = normalizeTheme(editor.getTheme());

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape (capture phase, before canvas handler)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, close]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };
    // Defer to avoid closing immediately from the open click
    requestAnimationFrame(() => {
      window.addEventListener("pointerdown", handleClick);
    });
    return () => window.removeEventListener("pointerdown", handleClick);
  }, [open, close]);

  // Listen for ? key trigger from useKeyboardHandler
  useEffect(() => {
    const handleShowShortcuts = () => setShowShortcuts(true);
    window.addEventListener("limn:show-shortcuts", handleShowShortcuts);
    return () => window.removeEventListener("limn:show-shortcuts", handleShowShortcuts);
  }, []);

  const handleOpen = () => { editor.requestOpen(); close(); };
  const handleSave = () => { editor.requestSave(); close(); };
  const handleSaveAs = () => { editor.requestSaveAs(); close(); };
  const handleExport = () => { editor.requestExport(); close(); };
  const handleClear = () => {
    window.location.hash = "local-doc=" + crypto.randomUUID();
    window.location.reload();
  };
  const handleShortcuts = () => { setShowShortcuts(true); close(); };
  const handleKeystrokeOverlay = () => {
    window.dispatchEvent(new Event("limn:toggle-keystroke-overlay"));
    close();
  };
  const handleTheme = (theme: string) => { editor.setTheme(theme); };
  const handleLightTheme = (key: ThemeKey) => {
    editor.setLightTheme(key);
    // If the active mode is dark, switch to light so the user sees the theme they picked
    const effectiveMode = currentTheme === "system" ? resolveSystemMode() : currentTheme;
    if (effectiveMode !== "light") {
      editor.setTheme("light");
    }
  };
  const handleDarkTheme = (key: ThemeKey) => {
    editor.setDarkTheme(key);
    // If the active mode is light, switch to dark so the user sees the theme they picked
    const effectiveMode = currentTheme === "system" ? resolveSystemMode() : currentTheme;
    if (effectiveMode !== "dark") {
      editor.setTheme("dark");
    }
  };

  return (
    <>
    <div ref={menuRef} style={{ position: "absolute", top: 12, left: 12, zIndex: 1000 }}>
      <button
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        style={{
          width: 36,
          height: 36,
          border: "none",
          borderRadius: 6,
          background: open ? "var(--selection-bg)" : "var(--editor-bg)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
        aria-label="Menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="4" width="14" height="2" rx="1" fill="currentColor" />
          <rect x="3" y="9" width="14" height="2" rx="1" fill="currentColor" />
          <rect x="3" y="14" width="14" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: 40,
            left: 0,
            minWidth: 240,
            background: "var(--editor-bg)",
            border: "1px solid var(--collapse-border)",
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            padding: "4px 0",
            fontSize: 14,
            color: "var(--text-color)",
          }}
        >
          {items ? (
            items.map((item, i) =>
              item === null ? <MenuDivider key={`d${i}`} /> : <MenuItem key={item.label} {...item} />
            )
          ) : (
            <>
              <MenuItem label="Open..." shortcut="Cmd+O" onClick={handleOpen} />
              <MenuItem label="Save" shortcut="Cmd+S" onClick={handleSave} />
              <MenuItem label="Save As..." shortcut="Shift+Cmd+S" onClick={handleSaveAs} />
              <MenuItem label="Export SVG" shortcut="Shift+Cmd+E" onClick={handleExport} />
              <MenuDivider />
              <MenuItem label="New" onClick={handleClear} />
            </>
          )}
          <MenuDivider />
          <MenuItem label="Keyboard Shortcuts" shortcut="?" onClick={handleShortcuts} />
          <MenuItem
            label={keystrokeOverlay ? "\u2713 Keystroke Overlay" : "Keystroke Overlay"}
            shortcut="Ctrl+Shift+K"
            onClick={handleKeystrokeOverlay}
          />
          {showTheme && (
            <>
              <MenuDivider />
              <ThemeRow currentTheme={currentTheme} onSelect={handleTheme} />
              <ThemeSubmenu
                activeLightTheme={editor.getLightTheme()}
                activeDarkTheme={editor.getDarkTheme()}
                onSelectLight={handleLightTheme}
                onSelectDark={handleDarkTheme}
              />
            </>
          )}
        </div>
      )}
    </div>
    {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

function MenuItem({ label, shortcut, onClick }: {
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "6px 12px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: 14,
        color: "var(--text-color)",
        textAlign: "left",
      }}
    >
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 16 }}>{shortcut}</span>
      )}
    </button>
  );
}

function ThemeRow({ currentTheme, onSelect }: {
  currentTheme: string;
  onSelect: (theme: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 12px",
        gap: 8,
      }}
    >
      <span style={{ flex: 1, fontSize: 14, color: "var(--text-color)" }}>Theme</span>
      <div
        style={{
          display: "flex",
          borderRadius: 8,
          background: "var(--canvas-bg)",
          padding: 2,
          gap: 2,
        }}
      >
        {THEME_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = currentTheme === opt.value;
          return (
            <button
              key={opt.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(opt.value)}
              title={opt.label}
              style={{
                width: 28,
                height: 28,
                border: "none",
                borderRadius: 6,
                background: active ? "var(--selection-bg)" : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: active ? "var(--selection-border)" : "var(--text-muted)",
              }}
            >
              <Icon />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ThemeSubmenu({ activeLightTheme, activeDarkTheme, onSelectLight, onSelectDark }: {
  activeLightTheme: string;
  activeDarkTheme: string;
  onSelectLight: (key: ThemeKey) => void;
  onSelectDark: (key: ThemeKey) => void;
}) {
  const { light, dark } = getThemesByMode();

  return (
    <div style={{ padding: "4px 12px 6px" }}>
      <ThemeGroup
        label="Light"
        keys={light}
        activeKey={activeLightTheme}
        onSelect={onSelectLight}
      />
      <ThemeGroup
        label="Dark"
        keys={dark}
        activeKey={activeDarkTheme}
        onSelect={onSelectDark}
      />
    </div>
  );
}

function ThemeGroup({ label, keys, activeKey, onSelect }: {
  label: string;
  keys: ThemeKey[];
  activeKey: string;
  onSelect: (key: ThemeKey) => void;
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      {keys.map((key) => {
        const theme = THEME_REGISTRY[key];
        if (!theme) return null;
        const active = key === activeKey;
        return (
          <button
            key={key}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(key)}
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              padding: "3px 4px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              color: "var(--text-color)",
              textAlign: "left",
              borderRadius: 4,
              gap: 6,
            }}
          >
            <ThemeSwatches branches={theme.branches} background={theme.background} />
            <span style={{ flex: 1 }}>{theme.name}</span>
            {active && <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{"\u2713"}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ThemeSwatches({ branches, background }: {
  branches: readonly string[];
  background: string;
}) {
  // Show first 5 branch colors as small circles
  return (
    <div style={{
      display: "flex",
      gap: 2,
      padding: "1px 2px",
      borderRadius: 3,
      background,
    }}>
      {branches.slice(0, 5).map((color, i) => (
        <div
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
          }}
        />
      ))}
    </div>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: "var(--collapse-border)", margin: "4px 0" }} />;
}

// --- Inline SVG icons ---

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="3" />
      <line x1="8" y1="13" x2="8" y2="15" />
      <line x1="1" y1="8" x2="3" y2="8" />
      <line x1="13" y1="8" x2="15" y2="8" />
      <line x1="3.05" y1="3.05" x2="4.46" y2="4.46" />
      <line x1="11.54" y1="11.54" x2="12.95" y2="12.95" />
      <line x1="3.05" y1="12.95" x2="4.46" y2="11.54" />
      <line x1="11.54" y1="4.46" x2="12.95" y2="3.05" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8.5a5.5 5.5 0 0 1-7-7 5.5 5.5 0 1 0 7 7z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="9" rx="1" />
      <line x1="5.5" y1="14" x2="10.5" y2="14" />
      <line x1="8" y1="11.5" x2="8" y2="14" />
    </svg>
  );
}
