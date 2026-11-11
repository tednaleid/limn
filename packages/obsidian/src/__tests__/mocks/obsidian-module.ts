// ABOUTME: Runtime stand-in for the `obsidian` package under vitest (the real package ships types only).
// ABOUTME: Wired in through resolve.alias in vitest.config.ts; carries just enough behavior for unit tests.

export class WorkspaceLeaf {
  lastState: unknown = null;
  view: unknown = null;
  setViewState(state: unknown): Promise<void> {
    this.lastState = state;
    return Promise.resolve();
  }
  getViewState(): unknown {
    return this.lastState;
  }
  openFile(_file?: unknown): Promise<void> {
    return Promise.resolve();
  }
}

export class TAbstractFile {
  path = "";
  name = "";
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
}

export class TFolder extends TAbstractFile {}

export class Component {
  load(): void {}
  unload(): void {}
}

export class View extends Component {
  constructor(public leaf: WorkspaceLeaf) {
    super();
  }
}

export class FileView extends View {
  file: TFile | null = null;
}

export class TextFileView extends FileView {
  data = "";
  requestSave(): void {}
  save(): Promise<void> {
    return Promise.resolve();
  }
}

export class MarkdownView extends TextFileView {}

export class Plugin extends Component {}

export class PluginSettingTab {
  containerEl = { empty(): void {} };
  constructor(public app: unknown, public plugin: unknown) {}
}

export class Setting {
  setName(): this { return this; }
  setDesc(): this { return this; }
  addDropdown(): this { return this; }
}

export class Notice {
  constructor(public message: string) {}
}

export class Menu extends Component {}

export const Platform = { isMacOS: false };

export class Scope {
  register(): void {}
}
