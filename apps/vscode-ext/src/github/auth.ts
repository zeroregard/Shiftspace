import * as vscode from 'vscode';

const GITHUB_PROVIDER = 'github';
const SCOPES = ['repo'];

/**
 * Fetch a GitHub access token from VSCode's built-in auth provider WITHOUT
 * prompting. Used by the poller — a missing session simply means the feature
 * no-ops until the user signs in via the explicit command.
 */
export async function getGitHubTokenSilent(): Promise<string | null> {
  try {
    const session = await vscode.authentication.getSession(GITHUB_PROVIDER, SCOPES, {
      createIfNone: false,
      silent: true,
    });
    return session?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Interactively sign in to GitHub (shows the native auth prompt). Only call
 * from an explicit user gesture (the `shiftspace.pr.signIn` command) — never
 * from the poll loop, or signed-out users get modal spam on a timer.
 */
export async function signInToGitHub(): Promise<string | null> {
  try {
    const session = await vscode.authentication.getSession(GITHUB_PROVIDER, SCOPES, {
      createIfNone: true,
    });
    return session?.accessToken ?? null;
  } catch {
    return null; // user dismissed the prompt
  }
}
