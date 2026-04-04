/**
 * Unit tests for IconThemeProvider
 *
 * Strategy: stub the vscode module entirely so these tests run in a plain Node
 * environment via Vitest (no VS Code host required).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile, mockGetConfiguration, mockExtensions } = vi.hoisted(() => {
  const mockReadFile = vi.fn<[{ fsPath: string }], Promise<Uint8Array>>();
  const mockGetConfiguration = vi.fn();
  const mockExtensions: { all: Array<{ packageJSON: unknown; extensionPath: string }> } = {
    all: [],
  };
  return { mockReadFile, mockGetConfiguration, mockExtensions };
});

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: mockGetConfiguration,
    fs: { readFile: mockReadFile },
  },
  extensions: mockExtensions,
  Uri: {
    file: (p: string) => ({ fsPath: p }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enc(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function b64(s: string): string {
  return Buffer.from(s).toString('base64');
}

// A minimal valid theme JSON (matches the structure IconThemeProvider reads)
const THEME_JSON = JSON.stringify({
  iconDefinitions: {
    _ts: { iconPath: './icons/ts.svg' },
    _js: { iconPath: './icons/js.svg' },
    _json: { iconPath: './icons/json.svg' },
    _default: { iconPath: './icons/default.svg' },
    _glyph: { fontCharacter: '\uE001' }, // font icon — should be skipped
  },
  fileExtensions: {
    ts: '_ts',
    tsx: '_ts',
    js: '_js',
    mjs: '_js',
  },
  fileNames: {
    'package.json': '_json',
    'tsconfig.json': '_ts',
  },
  file: '_default',
});

const SVG_TS = '<svg xmlns="http://www.w3.org/2000/svg"><text>TS</text></svg>';
const SVG_JS = '<svg xmlns="http://www.w3.org/2000/svg"><text>JS</text></svg>';
const SVG_JSON = '<svg xmlns="http://www.w3.org/2000/svg"><text>JSON</text></svg>';
const SVG_DEFAULT = '<svg xmlns="http://www.w3.org/2000/svg"><text>?</text></svg>';

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function setupExtension(themeId = 'test-theme', extPath = '/ext') {
  mockExtensions.all = [
    {
      extensionPath: extPath,
      packageJSON: {
        contributes: {
          iconThemes: [{ id: themeId, path: './theme/icons.json' }],
        },
      },
    },
  ];
}

function setupConfig(themeId: string | undefined) {
  mockGetConfiguration.mockReturnValue({
    get: (_key: string) => themeId,
  });
}

function setupFileReads(extPath = '/ext') {
  mockReadFile.mockImplementation(async (uri: { fsPath: string }) => {
    const p = uri.fsPath;
    if (p.endsWith('icons.json')) return enc(THEME_JSON);
    if (p.endsWith('ts.svg')) return enc(SVG_TS);
    if (p.endsWith('js.svg')) return enc(SVG_JS);
    if (p.endsWith('json.svg')) return enc(SVG_JSON);
    if (p.endsWith('default.svg')) return enc(SVG_DEFAULT);
    throw new Error(`Unexpected path: ${p}`);
  });
  return extPath;
}

// ---------------------------------------------------------------------------
// Import after mocks are in place
// ---------------------------------------------------------------------------

// Dynamic import so the vscode mock is registered first
async function makeProvider() {
  const { IconThemeProvider } = await import('../../src/IconThemeProvider');
  return new IconThemeProvider();
}

// ---------------------------------------------------------------------------
// Tests — Phase 1: theme loading
// ---------------------------------------------------------------------------

describe('IconThemeProvider.load()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when no iconTheme is configured', async () => {
    setupConfig(undefined);
    setupExtension();
    setupFileReads();

    const p = await makeProvider();
    expect(await p.load()).toBe(false);
  });

  it('returns false when no extension contributes the theme', async () => {
    setupConfig('missing-theme');
    setupExtension('other-theme');
    setupFileReads();

    const p = await makeProvider();
    expect(await p.load()).toBe(false);
  });

  it('returns false when the theme JSON cannot be read', async () => {
    setupConfig('test-theme');
    setupExtension();
    mockReadFile.mockRejectedValue(new Error('not found'));

    const p = await makeProvider();
    expect(await p.load()).toBe(false);
  });

  it('returns true when theme JSON is found and valid', async () => {
    setupConfig('test-theme');
    setupExtension();
    setupFileReads();

    const p = await makeProvider();
    expect(await p.load()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests — Phase 2: file → icon resolution
// ---------------------------------------------------------------------------

describe('IconThemeProvider.resolveForFiles()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function loadedProvider() {
    setupConfig('test-theme');
    setupExtension();
    setupFileReads();
    const p = await makeProvider();
    await p.load();
    return p;
  }

  it('returns empty map before load()', async () => {
    setupConfig('test-theme');
    setupExtension();
    const p = await makeProvider();
    const map = await p.resolveForFiles(['src/index.ts']);
    expect(map).toEqual({});
  });

  it('resolves .ts files by extension', async () => {
    const p = await loadedProvider();
    const map = await p.resolveForFiles(['src/app/page.tsx']);
    expect(map['src/app/page.tsx']).toBeDefined();
    expect(map['src/app/page.tsx']!.dark).toBe(`data:image/svg+xml;base64,${b64(SVG_TS)}`);
  });

  it('resolves .js files by extension', async () => {
    const p = await loadedProvider();
    const map = await p.resolveForFiles(['lib/utils.js']);
    expect(map['lib/utils.js']!.dark).toBe(`data:image/svg+xml;base64,${b64(SVG_JS)}`);
  });

  it('resolves package.json by filename (overrides extension)', async () => {
    const p = await loadedProvider();
    const map = await p.resolveForFiles(['package.json']);
    expect(map['package.json']!.dark).toBe(`data:image/svg+xml;base64,${b64(SVG_JSON)}`);
  });

  it('resolves tsconfig.json by filename', async () => {
    const p = await loadedProvider();
    const map = await p.resolveForFiles(['tsconfig.json']);
    // tsconfig.json → _ts icon
    expect(map['tsconfig.json']!.dark).toBe(`data:image/svg+xml;base64,${b64(SVG_TS)}`);
  });

  it('falls back to default file icon for unknown extension', async () => {
    const p = await loadedProvider();
    const map = await p.resolveForFiles(['Makefile']);
    expect(map['Makefile']!.dark).toBe(`data:image/svg+xml;base64,${b64(SVG_DEFAULT)}`);
  });

  it('skips font-glyph icon definitions (no crash, no entry)', async () => {
    // Override theme to use a glyph icon for .ts
    const glyphTheme = JSON.stringify({
      iconDefinitions: {
        _glyph: { fontCharacter: '\uE001' },
      },
      fileExtensions: { ts: '_glyph' },
    });
    mockReadFile.mockImplementation(async (uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('icons.json')) return enc(glyphTheme);
      throw new Error('unexpected');
    });

    setupConfig('test-theme');
    setupExtension();

    const { IconThemeProvider } = await import('../../src/IconThemeProvider');
    const p = new IconThemeProvider();
    await p.load();

    const map = await p.resolveForFiles(['src/index.ts']);
    // Font icon → no entry (silently skipped, not an error)
    expect(map['src/index.ts']).toBeUndefined();
  });

  it('handles SVG read errors gracefully', async () => {
    mockReadFile.mockImplementation(async (uri: { fsPath: string }) => {
      if (uri.fsPath.endsWith('icons.json')) return enc(THEME_JSON);
      throw new Error('disk error');
    });

    setupConfig('test-theme');
    setupExtension();

    const { IconThemeProvider } = await import('../../src/IconThemeProvider');
    const p = new IconThemeProvider();
    await p.load();

    const map = await p.resolveForFiles(['src/index.ts']);
    // All SVG reads failed → no entries (no crash)
    expect(map['src/index.ts']).toBeUndefined();
  });

  it('returns multiple icons in one call', async () => {
    const p = await loadedProvider();
    const map = await p.resolveForFiles([
      'src/index.ts',
      'lib/utils.js',
      'package.json',
      'README.md', // no match → default
    ]);

    expect(Object.keys(map)).toHaveLength(4);
    expect(map['src/index.ts']!.dark).toContain('data:image/svg+xml;base64,');
    expect(map['lib/utils.js']!.dark).toContain('data:image/svg+xml;base64,');
    expect(map['package.json']!.dark).toContain('data:image/svg+xml;base64,');
    expect(map['README.md']!.dark).toContain('data:image/svg+xml;base64,'); // default icon
  });

  it('caches SVG reads (reads each file at most once)', async () => {
    const p = await loadedProvider();

    // Same extension, different paths — should read the SVG only once
    await p.resolveForFiles(['src/a.ts', 'src/b.ts', 'src/c.ts']);

    // 1 theme JSON read + 1 ts.svg read (cached for b.ts and c.ts)
    const svgCalls = mockReadFile.mock.calls.filter((c) =>
      (c[0] as { fsPath: string }).fsPath.endsWith('ts.svg')
    );
    expect(svgCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests — Preview app: no icon-map dependency
// ---------------------------------------------------------------------------

describe('Preview app isolation', () => {
  it('renderer store starts with empty iconMap', async () => {
    // Importing the renderer store directly (no vscode involved)
    const { useWorktreeStore } = await import('../../../../packages/renderer-core/src/store/index');
    const state = useWorktreeStore.getState();
    expect(state.iconMap).toEqual({});
  });

  it('setIconMap replaces the entire map', async () => {
    const { useWorktreeStore } = await import('../../../../packages/renderer-core/src/store/index');
    const { setIconMap } = useWorktreeStore.getState();

    setIconMap({ 'src/app.ts': { dark: 'data:image/svg+xml;base64,abc' } });
    expect(useWorktreeStore.getState().iconMap['src/app.ts']?.dark).toBe(
      'data:image/svg+xml;base64,abc'
    );

    // Reset so other tests aren't affected
    setIconMap({});
  });
});
