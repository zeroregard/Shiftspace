/**
 * Minimal vscode mock for unit tests.
 * Only provides the surface area needed by src/actions/configLoader.ts.
 */
export const window = {
  createOutputChannel: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    dispose: () => {},
  }),
  showErrorMessage: (..._args: unknown[]) => Promise.resolve(undefined),
  showInformationMessage: (..._args: unknown[]) => Promise.resolve(undefined),
  showWarningMessage: (..._args: unknown[]) => Promise.resolve(undefined),
  tabGroups: { all: [] },
  withProgress: <T>(_opts: unknown, task: () => Promise<T>) => task(),
};

export const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15,
};

export const ViewColumn = {
  Active: -1,
  Beside: -2,
  One: 1,
  Two: 2,
  Three: 3,
};

export const commands = {
  executeCommand: (..._args: unknown[]) => Promise.resolve(undefined),
};

export class Position {
  constructor(
    public line: number,
    public character: number
  ) {}
}

export class Selection {
  constructor(
    public anchor: Position,
    public active: Position
  ) {}
}

// Minimal stand-in for vscode.TabInputWebview — only used in `instanceof`
// checks inside provider code paths that the tests currently exercise.
export class TabInputWebview {
  viewType = '';
}

export const languages = {
  getDiagnostics: () => [],
  onDidChangeDiagnostics: () => ({ dispose: () => {} }),
};

export const DiagnosticSeverity = {
  Error: 0,
  Warning: 1,
  Information: 2,
  Hint: 3,
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file', path }),
};

export const workspace = {
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => {} }),
    onDidCreate: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
  getConfiguration: () => ({
    get: () => [],
  }),
};

export class RelativePattern {
  constructor(
    public base: string,
    public pattern: string
  ) {}
}
