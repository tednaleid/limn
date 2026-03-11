// ABOUTME: Hamburger menu component for file operations and settings.
// ABOUTME: Renders a fixed-position menu button in the upper-left corner.

import { useState, useEffect, useCallback, useRef } from "react";
import { useEditor } from "../hooks/useEditor";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { AboutDialog } from "./AboutDialog";
import type { AboutVariant } from "./AboutDialog";
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

export type ThemeFocusTarget =
  | { type: "menu-item"; index: number }
  | { type: "theme-mode" }
  | { type: "theme-palette"; mode: "light" | "dark"; offset: number };

/** Map a focusIndex to the kind of item it targets. */
export function resolveThemeFocusTarget(
  focusIndex: number,
  menuItemCount: number,
  showTheme: boolean,
  lightThemeCount: number,
  darkThemeCount: number,
): ThemeFocusTarget | null {
  if (focusIndex < menuItemCount) {
    return { type: "menu-item", index: focusIndex };
  }
  if (!showTheme) return null;
  if (focusIndex === menuItemCount) {
    return { type: "theme-mode" };
  }
  const paletteIndex = focusIndex - menuItemCount - 1;
  if (paletteIndex < lightThemeCount) {
    return { type: "theme-palette", mode: "light", offset: paletteIndex };
  }
  const darkOffset = paletteIndex - lightThemeCount;
  if (darkOffset < darkThemeCount) {
    return { type: "theme-palette", mode: "dark", offset: darkOffset };
  }
  return null;
}

export interface HamburgerMenuProps {
  items?: MenuItemDef[];
  showTheme?: boolean;
  showShare?: boolean;
  keystrokeOverlay?: boolean;
  aboutVariant?: AboutVariant;
}

export function HamburgerMenu({ items, showTheme = true, showShare = true, keystrokeOverlay, aboutVariant }: HamburgerMenuProps) {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentTheme = normalizeTheme(editor.getTheme());

  const [focusIndex, setFocusIndex] = useState(0);
  const modeValues: string[] = THEME_OPTIONS.map((o) => o.value);
  const modeIndex = modeValues.indexOf(currentTheme);
  const [themeModeFocus, setThemeModeFocus] = useState(modeIndex >= 0 ? modeIndex : 2);

  const close = useCallback(() => setOpen(false), []);

  // Listen for 'm' key toggle from useKeyboardHandler
  useEffect(() => {
    const handleToggleMenu = () => setOpen((prev) => !prev);
    window.addEventListener("limn:toggle-menu", handleToggleMenu);
    return () => window.removeEventListener("limn:toggle-menu", handleToggleMenu);
  }, []);

  // Reset focusIndex and theme mode focus when menu opens
  useEffect(() => {
    if (open) {
      setFocusIndex(0);
      const idx = modeValues.indexOf(currentTheme);
      setThemeModeFocus(idx >= 0 ? idx : 2);
    }
  }, [open]);

  const handleOpen = () => { editor.requestOpen(); close(); };
  const handleSave = () => { editor.requestSave(); close(); };
  const handleSaveAs = () => { editor.requestSaveAs(); close(); };
  const handleExport = () => { editor.requestExport(); close(); };
  const handleShare = () => { editor.requestShare(); close(); };
  const handleClear = () => {
    window.location.hash = "local-doc=" + crypto.randomUUID();
    window.location.reload();
  };
  const handleShortcuts = () => { setShowShortcuts(true); close(); };
  const handleKeystrokeOverlay = () => {
    window.dispatchEvent(new Event("limn:toggle-keystroke-overlay"));
    close();
  };
  const handleAbout = () => { setShowAbout(true); close(); };
  const handleTheme = (theme: string) => { editor.setTheme(theme); };

  // Build a flat list of actionable menu items for keyboard navigation.
  // This must match the order they appear in the rendered menu.
  const actionableItems: { label: string; onClick: () => void }[] = items
    ? items.filter((item): item is NonNullable<MenuItemDef> => item !== null)
    : [
        { label: "Open", onClick: handleOpen },
        { label: "Save", onClick: handleSave },
        { label: "Save As", onClick: handleSaveAs },
        { label: "Export SVG", onClick: handleExport },
        ...(showShare ? [{ label: "Copy Share Link", onClick: handleShare }] : []),
        { label: "New", onClick: handleClear },
      ];
  // Always append the fixed items at the bottom
  actionableItems.push(
    { label: "Keyboard Shortcuts", onClick: handleShortcuts },
    { label: "Keystroke Overlay", onClick: handleKeystrokeOverlay },
    { label: "About", onClick: handleAbout },
  );
  const actionableItemCount = actionableItems.length;
  const { light: lightThemeKeys, dark: darkThemeKeys } = getThemesByMode();
  const allThemeKeys = [...lightThemeKeys, ...darkThemeKeys];
  const totalItemCount = actionableItemCount + (showTheme ? 1 + allThemeKeys.length : 0);

  const activateItemAtIndex = (index: number) => {
    const item = actionableItems[index];
    if (item) item.onClick();
  };

  const selectThemePaletteKey = (target: { mode: "light" | "dark"; offset: number }) => {
    const key = allThemeKeys[target.mode === "light" ? target.offset : lightThemeKeys.length + target.offset];
    if (key) (target.mode === "light" ? handleLightTheme : handleDarkTheme)(key);
  };

  // Keyboard navigation (capture phase, before canvas handler)
  useEffect(() => {
    if (!open) return;
    const target = resolveThemeFocusTarget(
      focusIndex, actionableItemCount, showTheme, lightThemeKeys.length, darkThemeKeys.length,
    );
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          e.stopPropagation();
          close();
          break;
        case "j":
        case "ArrowDown":
          e.stopPropagation();
          e.preventDefault();
          setFocusIndex((prev) => (prev + 1) % totalItemCount);
          break;
        case "k":
        case "ArrowUp":
          e.stopPropagation();
          e.preventDefault();
          setFocusIndex((prev) => (prev - 1 + totalItemCount) % totalItemCount);
          break;
        case "Enter":
          e.stopPropagation();
          e.preventDefault();
          if (target?.type === "menu-item") {
            activateItemAtIndex(target.index);
          } else if (target?.type === "theme-palette") {
            selectThemePaletteKey(target);
          }
          break;
        case " ":
          if (target?.type === "theme-palette") {
            e.stopPropagation();
            e.preventDefault();
            selectThemePaletteKey(target);
          }
          break;
        case "h":
        case "ArrowLeft":
          if (target?.type === "theme-mode") {
            e.stopPropagation();
            e.preventDefault();
            setThemeModeFocus((prev) => {
              const next = Math.max(0, prev - 1);
              const opt = THEME_OPTIONS[next];
              if (opt) handleTheme(opt.value);
              return next;
            });
          }
          break;
        case "l":
        case "ArrowRight":
          if (target?.type === "theme-mode") {
            e.stopPropagation();
            e.preventDefault();
            setThemeModeFocus((prev) => {
              const next = Math.min(THEME_OPTIONS.length - 1, prev + 1);
              const opt = THEME_OPTIONS[next];
              if (opt) handleTheme(opt.value);
              return next;
            });
          } else if (target?.type === "theme-palette") {
            e.stopPropagation();
            e.preventDefault();
            selectThemePaletteKey(target);
          }
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, close, focusIndex, totalItemCount]);

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
        title="Menu (m)"
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
            (() => {
              let idx = 0;
              return items.map((item, i) =>
                item === null
                  ? <MenuDivider key={`d${i}`} />
                  : <MenuItem key={item.label} {...item} active={focusIndex === idx++} />
              );
            })()
          ) : (
            (() => {
              let idx = 0;
              return (
                <>
                  <MenuItem label="Open..." shortcut="Cmd+O" onClick={handleOpen} active={focusIndex === idx++} />
                  <MenuItem label="Save" shortcut="Cmd+S" onClick={handleSave} active={focusIndex === idx++} />
                  <MenuItem label="Save As..." shortcut="Shift+Cmd+S" onClick={handleSaveAs} active={focusIndex === idx++} />
                  <MenuItem label="Export SVG" shortcut="Shift+Cmd+E" onClick={handleExport} active={focusIndex === idx++} />
                  {showShare && <MenuItem label="Copy Share Link" onClick={handleShare} active={focusIndex === idx++} />}
                  <MenuDivider />
                  <MenuItem label="New" onClick={handleClear} active={focusIndex === idx++} />
                </>
              );
            })()
          )}
          <MenuDivider />
          <MenuItem label="Keyboard Shortcuts" shortcut="?" onClick={handleShortcuts} active={focusIndex === actionableItemCount - 3} />
          <MenuItem
            label={keystrokeOverlay ? "\u2713 Keystroke Overlay" : "Keystroke Overlay"}
            shortcut="Ctrl+Shift+K"
            onClick={handleKeystrokeOverlay}
            active={focusIndex === actionableItemCount - 2}
          />
          <MenuItem label="About" onClick={handleAbout} active={focusIndex === actionableItemCount - 1} />
          {showTheme && (() => {
            const target = resolveThemeFocusTarget(
              focusIndex, actionableItemCount, showTheme, lightThemeKeys.length, darkThemeKeys.length,
            );
            const focusedThemeKey = target?.type === "theme-palette"
              ? allThemeKeys[target.mode === "light" ? target.offset : lightThemeKeys.length + target.offset]
              : undefined;
            return (
              <>
                <MenuDivider />
                <ThemeRow
                  currentTheme={currentTheme}
                  onSelect={handleTheme}
                  active={target?.type === "theme-mode"}
                  focusedOptionIndex={target?.type === "theme-mode" ? themeModeFocus : undefined}
                />
                <ThemeSubmenu
                  activeLightTheme={editor.getLightTheme()}
                  activeDarkTheme={editor.getDarkTheme()}
                  onSelectLight={handleLightTheme}
                  onSelectDark={handleDarkTheme}
                  focusedKey={focusedThemeKey}
                />
              </>
            );
          })()}
        </div>
      )}
    </div>
    {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}
    {showAbout && <AboutDialog onClose={() => setShowAbout(false)} variant={aboutVariant} />}
    </>
  );
}

function MenuItem({ label, shortcut, onClick, active }: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  active?: boolean;
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
        background: active ? "var(--selection-bg)" : "transparent",
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

function ThemeRow({ currentTheme, onSelect, active, focusedOptionIndex }: {
  currentTheme: string;
  onSelect: (theme: string) => void;
  active?: boolean;
  focusedOptionIndex?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "6px 12px",
        gap: 8,
        background: active ? "var(--selection-bg)" : "transparent",
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
        {THEME_OPTIONS.map((opt, i) => {
          const Icon = opt.icon;
          const isActive = currentTheme === opt.value;
          const isFocused = active && focusedOptionIndex === i;
          return (
            <button
              key={opt.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(opt.value)}
              title={opt.label}
              style={{
                width: 28,
                height: 28,
                border: isFocused ? "2px solid var(--selection-border)" : "none",
                borderRadius: 6,
                background: isActive ? "var(--selection-bg)" : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive ? "var(--selection-border)" : "var(--text-muted)",
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

function ThemeSubmenu({ activeLightTheme, activeDarkTheme, onSelectLight, onSelectDark, focusedKey }: {
  activeLightTheme: string;
  activeDarkTheme: string;
  onSelectLight: (key: ThemeKey) => void;
  onSelectDark: (key: ThemeKey) => void;
  focusedKey?: string;
}) {
  const { light, dark } = getThemesByMode();

  return (
    <div style={{ padding: "4px 12px 6px" }}>
      <ThemeGroup
        label="Light"
        keys={light}
        activeKey={activeLightTheme}
        onSelect={onSelectLight}
        focusedKey={focusedKey}
      />
      <ThemeGroup
        label="Dark"
        keys={dark}
        activeKey={activeDarkTheme}
        onSelect={onSelectDark}
        focusedKey={focusedKey}
      />
    </div>
  );
}

function ThemeGroup({ label, keys, activeKey, onSelect, focusedKey }: {
  label: string;
  keys: ThemeKey[];
  activeKey: string;
  onSelect: (key: ThemeKey) => void;
  focusedKey?: string;
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
      {keys.map((key) => {
        const theme = THEME_REGISTRY[key];
        if (!theme) return null;
        const active = key === activeKey;
        const focused = key === focusedKey;
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
              background: focused ? "var(--selection-bg)" : "transparent",
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
