import * as vscode from 'vscode';
import * as path from 'path';
import { getGitRoot } from './worktrees';

export class RepoTracker implements vscode.Disposable {
  private _gitRootCache = new Map<string, string>();
  private _currentGitRoot: string | undefined;
  private _repoSwitchTimer: ReturnType<typeof setTimeout> | undefined;
  private _editorChangeDisposable: vscode.Disposable | undefined;

  get currentGitRoot(): string | undefined {
    return this._currentGitRoot;
  }

  async detectInitialGitRoot(): Promise<string | null> {
    const activeFile = vscode.window.activeTextEditor?.document.uri.fsPath;

    const fromExtension = this.getGitRootFromVscodeExtension(activeFile);
    if (fromExtension) {
      this._currentGitRoot = fromExtension;
      return fromExtension;
    }

    if (activeFile) {
      const root = await this.resolveGitRoot(activeFile);
      if (root) {
        this._currentGitRoot = root;
        return root;
      }
    }

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const folderPath = folder.uri.fsPath;
      const cached = this._gitRootCache.get(folderPath);
      const root = cached !== undefined ? cached : await getGitRoot(folderPath);
      if (root) {
        this._gitRootCache.set(folderPath, root);
        this._currentGitRoot = root;
        return root;
      }
    }

    return null;
  }

  startWatching(onSwitch: (newRoot: string) => Promise<void>): vscode.Disposable {
    this._editorChangeDisposable?.dispose();
    this._editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      const filePath = editor?.document.uri.fsPath;
      if (!filePath) return;

      if (this._repoSwitchTimer !== undefined) clearTimeout(this._repoSwitchTimer);
      this._repoSwitchTimer = setTimeout(() => {
        this._repoSwitchTimer = undefined;
        void this.maybeSwitch(filePath, onSwitch);
      }, 250);
    });
    return this._editorChangeDisposable;
  }

  private async maybeSwitch(
    filePath: string,
    onSwitch: (newRoot: string) => Promise<void>
  ): Promise<void> {
    const gitRoot = await this.resolveGitRoot(filePath);
    if (!gitRoot) return;
    if (gitRoot === this._currentGitRoot) return;
    this._currentGitRoot = gitRoot;
    await onSwitch(gitRoot);
  }

  private getGitRootFromVscodeExtension(activeFilePath?: string): string | undefined {
    const gitExt = vscode.extensions.getExtension<{
      getAPI(version: 1): { repositories: Array<{ rootUri: vscode.Uri }> };
    }>('vscode.git');

    if (!gitExt?.isActive) return undefined;

    const repos = gitExt.exports.getAPI(1).repositories;
    if (repos.length === 0) return undefined;

    if (activeFilePath) {
      const match = repos.find((r) => activeFilePath.startsWith(r.rootUri.fsPath));
      if (match) return match.rootUri.fsPath;
    }

    return repos[0]!.rootUri.fsPath;
  }

  private async resolveGitRoot(filePath: string): Promise<string | null> {
    const dir = path.dirname(filePath);
    const cached = this._gitRootCache.get(dir);
    if (cached !== undefined) return cached;
    const root = await getGitRoot(dir);
    if (root) this._gitRootCache.set(dir, root);
    return root;
  }

  dispose(): void {
    if (this._repoSwitchTimer !== undefined) {
      clearTimeout(this._repoSwitchTimer);
      this._repoSwitchTimer = undefined;
    }
    this._editorChangeDisposable?.dispose();
    this._editorChangeDisposable = undefined;
  }
}
