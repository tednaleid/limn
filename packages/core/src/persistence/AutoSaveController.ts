// ABOUTME: Configurable auto-save controller with debounce and interval modes.
// ABOUTME: Subscribes to Editor changes and delegates saves to a PersistenceProvider.

import type { Editor } from "../editor/Editor";
import type { PersistenceProvider } from "./types";

export interface AutoSaveOptions {
  /** "debounce": save after delayMs idle. "interval": save every delayMs if dirty. */
  mode: "debounce" | "interval";
  delayMs: number;
}

export class AutoSaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private disposed = false;
  private unsubscribe: () => void;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private editor: Editor,
    private provider: PersistenceProvider,
    private options: AutoSaveOptions,
  ) {
    if (options.mode === "debounce") {
      this.unsubscribe = editor.subscribe(() => this.onChangeDebounce());
    } else {
      this.unsubscribe = editor.subscribe(() => this.onChangeInterval());
      this.timer = setInterval(() => this.intervalTick(), options.delayMs);
    }
  }

  private onChangeDebounce(): void {
    if (this.disposed) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.save();
    }, this.options.delayMs);
  }

  private onChangeInterval(): void {
    this.dirty = true;
  }

  private intervalTick(): void {
    if (this.disposed || !this.dirty) return;
    this.dirty = false;
    this.save();
  }

  private save(): void {
    if (this.disposed) return;
    const data = this.editor.toJSON();
    this.saving = this.provider.save(data);
  }

  /** Force an immediate save (e.g., before explicit file save). */
  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.timer !== null) {
      if (this.options.mode === "debounce") {
        clearTimeout(this.timer);
      }
      this.timer = null;
    }
    this.dirty = false;
    const data = this.editor.toJSON();
    await this.provider.save(data);
  }

  /** Stop auto-saving and clean up. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    if (this.timer !== null) {
      if (this.options.mode === "debounce") {
        clearTimeout(this.timer);
      } else {
        clearInterval(this.timer);
      }
      this.timer = null;
    }
  }
}
