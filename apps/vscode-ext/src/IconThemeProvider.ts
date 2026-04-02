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
 *  - Font-glyph themes (e.g. vs-seti): we load the theme font file, then
 *    synthesize an SVG with an embedded @font-face + <text> node per glyph.
 *  - All errors are caught and result in null / empty map — never throws.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { IconMap } from '@shiftspace/renderer';
import { log } from './logger';

// ---------------------------------------------------------------------------
// Internal types mirroring the VSCode icon-theme JSON schema
// ---------------------------------------------------------------------------

interface IconDefinition {
  iconPath?: string; // SVG file, relative to the theme JSON
  fontCharacter?: string; // glyph icon (e.g. '\E099')
  fontColor?: string; // CSS color for glyph
  fontId?: string; // which font entry to use (defaults to first)
}

interface IconFont {
  id: string;
  src: Array<{ path: string; format: string }>;
}

interface IconThemeVariant {
  fileNames?: Record<string, string>; // filename → iconId
  fileExtensions?: Record<string, string>; // extension → iconId
  languageIds?: Record<string, string>; // language ID → iconId
  file?: string; // fallback iconId
  iconDefinitions?: Record<string, IconDefinition>;
}

interface IconThemeJson extends IconThemeVariant {
  iconDefinitions: Record<string, IconDefinition>;
  folder?: string;
  folderExpanded?: string;
  light?: IconThemeVariant;
  fonts?: IconFont[];
}

// ---------------------------------------------------------------------------
// IconThemeProvider
// ---------------------------------------------------------------------------

export class IconThemeProvider implements vscode.Disposable {
  private _themeJson: IconThemeJson | null = null;
  private _themeDir: string | null = null;

  /** Whether the theme has been loaded and is ready to resolve icons. */
  get isLoaded(): boolean {
    return this._themeJson !== null;
  }

  /** iconId → base64 data URI (or '' if the icon couldn't be resolved) */
  private _svgCache = new Map<string, string>();

  /** fontId → { base64, format } loaded from the theme's font files */
  private _fontCache = new Map<string, { b64: string; format: string }>();

  /** fileExtension (lowercase) → VSCode language ID, built from all extensions */
  private _extToLangId = new Map<string, string>();

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
    this._fontCache.clear();

    try {
      const themeId = vscode.workspace.getConfiguration('workbench').get<string>('iconTheme');
      log.debug('IconTheme load(): themeId =', themeId);

      if (!themeId) {
        log.debug('IconTheme load(): no iconTheme configured, aborting');
        return false;
      }

      const entry = this._findThemeExtension(themeId);
      if (!entry) {
        log.debug('IconTheme load(): no extension found for themeId =', themeId);
        return false;
      }

      const { extensionPath, themePath } = entry;
      const absoluteThemePath = path.join(extensionPath, themePath);
      this._themeDir = path.dirname(absoluteThemePath);
      log.debug('IconTheme load(): absoluteThemePath =', absoluteThemePath);

      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(absoluteThemePath));
      this._themeJson = JSON.parse(Buffer.from(raw).toString('utf-8')) as IconThemeJson;

      const defCount = Object.keys(this._themeJson.iconDefinitions ?? {}).length;
      const fileExtCount = Object.keys(this._themeJson.fileExtensions ?? {}).length;
      const langIdCount = Object.keys(this._themeJson.languageIds ?? {}).length;
      log.debug(
        'IconTheme load(): parsed OK |',
        'iconDefinitions:',
        defCount,
        '| fileExtensions:',
        fileExtCount,
        '| languageIds:',
        langIdCount,
        '| fonts:',
        this._themeJson.fonts?.length ?? 0
      );

      // Pre-load font files (needed for glyph-based themes like vs-seti)
      await this._loadFonts();

      // Build ext → languageId map from all installed extensions
      this._buildExtToLangIdMap();

      return true;
    } catch (err) {
      log.error('IconTheme load(): error loading theme:', err);
      return false;
    }
  }

  /**
   * Pre-load all font files declared by the theme into _fontCache as base64.
   * These are used to synthesize SVGs for glyph-based icon definitions.
   */
  private async _loadFonts(): Promise<void> {
    const fonts = this._themeJson?.fonts ?? [];
    for (const font of fonts) {
      for (const src of font.src) {
        try {
          const fontPath = path.resolve(this._themeDir!, src.path);
          const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(fontPath));
          const b64 = Buffer.from(raw).toString('base64');
          this._fontCache.set(font.id, { b64, format: src.format });
          log.debug('IconTheme _loadFonts(): loaded font', font.id, 'from', fontPath);
          break; // Use first available src format
        } catch (err) {
          log.warn('IconTheme _loadFonts(): failed to load font', font.id, src.path, err);
        }
      }
    }
  }

  /**
   * Build a map of file extension → VSCode language ID by scanning all
   * installed extensions' contributes.languages. Used to resolve icon IDs
   * from themes that use languageIds (like vs-seti) rather than fileExtensions.
   */
  private _buildExtToLangIdMap(): void {
    this._extToLangId.clear();
    for (const ext of vscode.extensions.all) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const langs = ext.packageJSON?.contributes?.languages as
        | Array<{ id: string; extensions?: string[] }>
        | undefined;
      if (!Array.isArray(langs)) continue;

      for (const lang of langs) {
        if (!lang.id || !Array.isArray(lang.extensions)) continue;
        for (const fileExt of lang.extensions) {
          // fileExt is like '.ts', '.tsx' — strip the leading dot
          const normalized = fileExt.replace(/^\./, '').toLowerCase();
          if (normalized && !this._extToLangId.has(normalized)) {
            this._extToLangId.set(normalized, lang.id);
          }
        }
      }
    }
    log.debug(
      'IconTheme _buildExtToLangIdMap(): mapped',
      this._extToLangId.size,
      'extensions to language IDs'
    );
    log.debug(
      'IconTheme _buildExtToLangIdMap(): ts =',
      this._extToLangId.get('ts'),
      '| tsx =',
      this._extToLangId.get('tsx')
    );
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
        log.debug('IconTheme _findThemeExtension(): found in', ext.id, '| themePath:', match.path);
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

    for (const filePath of filePaths) {
      const filename = path.basename(filePath);
      const iconId = this._resolveIconId(filename);
      if (!iconId) continue;

      const dataUri = await this._resolveIconDataUri(iconId);
      if (dataUri) {
        result[filePath] = { dark: dataUri };
      }
    }

    log.debug(
      'IconTheme resolveForFiles(): resolved',
      Object.keys(result).length,
      '/',
      filePaths.length,
      'files'
    );
    return result;
  }

  // -------------------------------------------------------------------------
  // Icon ID resolution (filename → theme icon ID)
  // -------------------------------------------------------------------------

  /**
   * Walk the theme JSON lookup tables in priority order:
   *  1. fileNames  (exact filename match, case-insensitive)
   *  2. fileExtensions  (longest match wins: "config.ts" beats "ts")
   *  3. languageIds  (via ext → languageId map built from all extensions)
   *  4. file  (theme default)
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

    // 3. Language ID match (for themes like vs-seti that use languageIds)
    if (theme.languageIds) {
      for (let i = 1; i < parts.length; i++) {
        const ext = parts.slice(i).join('.');
        const langId = this._extToLangId.get(ext);
        if (langId) {
          const byLang = theme.languageIds[langId];
          if (byLang) return byLang;
        }
      }
    }

    // 4. Theme default
    if (theme.file) return theme.file;

    return null;
  }

  // -------------------------------------------------------------------------
  // Icon data URI resolution (SVG file or synthesized glyph SVG)
  // -------------------------------------------------------------------------

  private async _resolveIconDataUri(iconId: string): Promise<string | null> {
    const cached = this._svgCache.get(iconId);
    if (cached !== undefined) return cached || null;

    const def = this._themeJson!.iconDefinitions[iconId];
    if (!def) {
      this._svgCache.set(iconId, '');
      return null;
    }

    // --- SVG file path icon ---
    if (def.iconPath) {
      try {
        const svgPath = path.resolve(this._themeDir!, def.iconPath);
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(svgPath));
        const b64 = Buffer.from(raw).toString('base64');
        const dataUri = `data:image/svg+xml;base64,${b64}`;
        this._svgCache.set(iconId, dataUri);
        return dataUri;
      } catch (err) {
        log.error('IconTheme: failed to read SVG for', iconId, '| error:', err);
        this._svgCache.set(iconId, '');
        return null;
      }
    }

    // --- Font-glyph icon ---
    if (def.fontCharacter) {
      const fontId = def.fontId ?? this._themeJson!.fonts?.[0]?.id;
      const fontData = fontId ? this._fontCache.get(fontId) : undefined;

      if (!fontData) {
        log.warn('IconTheme: no font loaded for glyph icon', iconId, '| fontId:', fontId);
        this._svgCache.set(iconId, '');
        return null;
      }

      // fontCharacter is stored as e.g. '\E099' (backslash + hex) in the JSON.
      // Convert to the actual Unicode character for SVG text content.
      const hexStr = def.fontCharacter.replace(/^\\/, '');
      const codePoint = parseInt(hexStr, 16);
      const glyphChar = isNaN(codePoint) ? def.fontCharacter : String.fromCodePoint(codePoint);
      const color = def.fontColor ?? '#cccccc';

      // Synthesize an SVG that embeds the font and renders the glyph
      const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">`,
        `<defs><style>`,
        `@font-face{font-family:'${fontId}';src:url('data:font/${fontData.format};base64,${fontData.b64}') format('${fontData.format}');}`,
        `</style></defs>`,
        `<text x="8" y="13" font-family="'${fontId}'" font-size="14" fill="${color}" text-anchor="middle">${glyphChar}</text>`,
        `</svg>`,
      ].join('');

      const svgB64 = Buffer.from(svg).toString('base64');
      const dataUri = `data:image/svg+xml;base64,${svgB64}`;
      this._svgCache.set(iconId, dataUri);
      return dataUri;
    }

    this._svgCache.set(iconId, '');
    return null;
  }

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

  dispose(): void {
    this._svgCache.clear();
    this._fontCache.clear();
    this._extToLangId.clear();
    this._themeJson = null;
    this._themeDir = null;
  }
}
