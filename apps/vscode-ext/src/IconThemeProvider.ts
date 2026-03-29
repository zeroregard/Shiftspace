/**
 * IconThemeProvider
 *
 * Reads the active VSCode file icon theme from the extension host,
 * resolves file-path → SVG icon, and converts SVGs to base64 data URIs.
 *
 * Design decisions:
 *  - Data URIs (base64 SVG) rather than webview URIs: self-contained, no CSP
 *    changes needed, no localResourceRoots expansion required.
 *  - Dark variant only for v0.1: the `light` key in IconEntry exists in the
 *    type contract but is not populated here yet.
 *  - Font-glyph icon definitions (fontCharacter) are silently skipped; the
 *    renderer falls back to its built-in SVG icons.
 *  - All errors are caught and result in null / empty map — never throws.
 */
// TODO: this is not working!

import * as vscode from 'vscode';
import * as path from 'path';
import type { IconMap } from '@shiftspace/renderer';

// ---------------------------------------------------------------------------
// Internal types mirroring the VSCode icon-theme JSON schema
// ---------------------------------------------------------------------------

interface IconDefinition {
  iconPath?: string; // SVG file, relative to the theme JSON
  fontCharacter?: string; // glyph icon — not supported in v0.1
}

interface IconThemeVariant {
  fileNames?: Record<string, string>; // filename → iconId
  fileExtensions?: Record<string, string>; // extension → iconId
  file?: string; // fallback iconId
  iconDefinitions?: Record<string, IconDefinition>;
}

interface IconThemeJson extends IconThemeVariant {
  iconDefinitions: Record<string, IconDefinition>;
  folder?: string;
  folderExpanded?: string;
  light?: IconThemeVariant;
}

// ---------------------------------------------------------------------------
// IconThemeProvider
// ---------------------------------------------------------------------------

export class IconThemeProvider implements vscode.Disposable {
  private _themeJson: IconThemeJson | null = null;
  private _themeDir: string | null = null;

  /** iconId → base64 data URI (or '' if the icon couldn't be read) */
  private _svgCache = new Map<string, string>();

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  /**
   * Load the currently active icon theme.
   * Returns true on success, false if the theme can't be found or parsed.
   */
  async load(): Promise<boolean> {
    this._themeJson = null;
    this._themeDir = null;
    this._svgCache.clear();

    try {
      const themeId = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme');

      if (!themeId) return false;

      const entry = this._findThemeExtension(themeId);
      if (!entry) return false;

      const { extensionPath, themePath } = entry;
      const absoluteThemePath = path.join(extensionPath, themePath);
      this._themeDir = path.dirname(absoluteThemePath);

      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(absoluteThemePath));
      this._themeJson = JSON.parse(Buffer.from(raw).toString('utf-8')) as IconThemeJson;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find the extension that contributes `themeId` and return its path info.
   */
  private _findThemeExtension(
    themeId: string
  ): { extensionPath: string; themePath: string } | null {
    for (const ext of vscode.extensions.all) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const themes = ext.packageJSON?.contributes?.iconThemes as
        | Array<{ id: string; path: string }>
        | undefined;
      if (!Array.isArray(themes)) continue;

      const match = themes.find((t) => t.id === themeId);
      if (match) {
        return { extensionPath: ext.extensionPath, themePath: match.path };
      }
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Resolving icons for a list of relative file paths
  // -------------------------------------------------------------------------

  /**
   * Resolve icons for every path in `filePaths`.
   * Keys are the same relative paths as the input.
   * Entries where no icon could be resolved are omitted.
   */
  async resolveForFiles(filePaths: string[]): Promise<IconMap> {
    if (!this._themeJson || !this._themeDir) return {};

    const result: IconMap = {};

    // De-duplicate: many paths share the same icon definition. We only read
    // each SVG file once thanks to _svgCache.
    for (const filePath of filePaths) {
      const filename = path.basename(filePath);
      const iconId = this._resolveIconId(filename);
      if (!iconId) {
        console.log(
          '[Shiftspace] IconTheme: no iconId for',
          filename,
          '| fileExtensions keys (sample):',
          Object.keys(this._themeJson.fileExtensions ?? {}).slice(0, 5),
          '| has file default:',
          !!this._themeJson.file
        );
        continue;
      }

      const dataUri = await this._resolveIconDataUri(iconId);
      if (!dataUri) {
        console.log(
          '[Shiftspace] IconTheme: no dataUri for',
          filename,
          '-> iconId:',
          iconId,
          '| def:',
          this._themeJson.iconDefinitions[iconId]
        );
      }
      if (dataUri) {
        result[filePath] = { dark: dataUri };
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Icon ID resolution (filename → theme icon ID)
  // -------------------------------------------------------------------------

  /**
   * Walk the theme JSON lookup tables in priority order:
   *  1. fileNames  (exact filename match, case-insensitive)
   *  2. fileExtensions  (longest match wins: "config.ts" beats "ts")
   *  3. file  (theme default)
   */
  private _resolveIconId(filename: string): string | null {
    const theme = this._themeJson!;
    const lower = filename.toLowerCase();

    // 1. Exact filename match
    const byName = theme.fileNames?.[lower] ?? theme.fileNames?.[filename];
    if (byName) return byName;

    // 2. Extension match — try longest compound extension first
    //    e.g. "foo.config.ts" checks "config.ts" before "ts"
    const parts = lower.split('.');
    for (let i = 1; i < parts.length; i++) {
      const ext = parts.slice(i).join('.');
      const byExt = theme.fileExtensions?.[ext];
      if (byExt) return byExt;
    }

    // 3. Theme default
    if (theme.file) return theme.file;

    return null;
  }

  // -------------------------------------------------------------------------
  // SVG → data URI
  // -------------------------------------------------------------------------

  private async _resolveIconDataUri(iconId: string): Promise<string | null> {
    const cached = this._svgCache.get(iconId);
    if (cached !== undefined) return cached || null;

    const def = this._themeJson!.iconDefinitions[iconId];
    if (!def) {
      this._svgCache.set(iconId, '');
      return null;
    }

    // Skip font-glyph icons — no SVG to convert
    if (def.fontCharacter || !def.iconPath) {
      this._svgCache.set(iconId, '');
      return null;
    }

    try {
      const svgPath = path.resolve(this._themeDir!, def.iconPath);
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(svgPath));
      const svgContent = Buffer.from(raw).toString('utf-8');

      // Base64-encode so the data URI is CSP-safe and webview-embeddable
      const b64 = Buffer.from(svgContent).toString('base64');
      const dataUri = `data:image/svg+xml;base64,${b64}`;

      this._svgCache.set(iconId, dataUri);
      return dataUri;
    } catch {
      this._svgCache.set(iconId, '');
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

  dispose(): void {
    this._svgCache.clear();
    this._themeJson = null;
    this._themeDir = null;
  }
}
