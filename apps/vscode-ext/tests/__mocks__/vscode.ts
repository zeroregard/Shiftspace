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
};

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
