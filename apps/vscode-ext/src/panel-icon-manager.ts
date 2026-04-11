import * as vscode from 'vscode';
import { IconThemeProvider } from './icon-theme-provider';
import type { SharedGitProvider } from './shared-git-provider';

export class PanelIconManager implements vscode.Disposable {
  private readonly _iconProvider = new IconThemeProvider();
  private readonly _sharedGit: SharedGitProvider;
  private readonly _postMessage: (msg: object) => Thenable<boolean>;
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private _configDisposable: vscode.Disposable;

  constructor(sharedGit: SharedGitProvider, postMessage: (msg: object) => Thenable<boolean>) {
    this._sharedGit = sharedGit;
    this._postMessage = postMessage;

    this._configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('workbench.iconTheme')) {
        void this.reload();
      }
    });
  }

  async reload(): Promise<void> {
    const gitProvider = this._sharedGit.provider;
    if (!gitProvider) return;
    const loaded = await this._iconProvider.load();
    if (!loaded) return;
    const filePaths = gitProvider.getAllFilePaths();
    const iconMap = await this._iconProvider.resolveForFiles(filePaths);
    await this._postMessage({ type: 'icon-theme', payload: iconMap });
  }

  async update(): Promise<void> {
    const gitProvider = this._sharedGit.provider;
    if (!this._iconProvider.isLoaded || !gitProvider) return;
    const filePaths = gitProvider.getAllFilePaths();
    const iconMap = await this._iconProvider.resolveForFiles(filePaths);
    await this._postMessage({ type: 'icon-theme', payload: iconMap });
  }

  scheduleUpdate(): void {
    if (this._debounceTimer !== undefined) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = undefined;
      void this.update();
    }, 1000);
  }

  dispose(): void {
    if (this._debounceTimer !== undefined) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = undefined;
    }
    this._configDisposable.dispose();
    this._iconProvider.dispose();
  }
}
