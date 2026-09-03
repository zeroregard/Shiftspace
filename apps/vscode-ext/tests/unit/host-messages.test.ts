/**
 * The sidebar and the tab render the same worktree cards from the same stores,
 * so both must apply the same host messages. The sidebar used to apply only
 * half of them, which left it ignoring `settings-update` entirely — its cards
 * kept counting working changes after the user asked for the default-branch
 * comparison, and ticket links never appeared there either.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_WORKTREE_VISIBILITY,
  useSettingsStore,
  useWorktreeStore,
} from '@shiftspace/renderer';
import {
  handleCoreMessage,
  handleHostMessage,
  isAllowedOrigin,
} from '../../src/webview/host-messages';

const noop = () => {};

beforeEach(() => {
  useSettingsStore.setState({
    ticketUrlTemplate: '',
    worktreeDiffCount: 'working',
    worktreeVisibility: DEFAULT_WORKTREE_VISIBILITY,
  });
});

describe('handleCoreMessage', () => {
  // The sidebar applies the core half of the message set. A renderer setting
  // handled only in the action half never reaches it.
  it('applies every renderer setting from settings-update', () => {
    const handled = handleCoreMessage(
      {
        type: 'settings-update',
        ticketUrlTemplate: 'https://linear.app/acme/issue/{ticket}',
        worktreeDiffCount: 'defaultBranch',
        worktreeVisibility: {
          actions: 'always',
          githubStatus: 'off',
          diffCount: 'hover',
          timestamp: 'off',
        },
      },
      noop
    );
    expect(handled).toBe(true);
    expect(useSettingsStore.getState()).toMatchObject({
      ticketUrlTemplate: 'https://linear.app/acme/issue/{ticket}',
      worktreeDiffCount: 'defaultBranch',
      worktreeVisibility: {
        actions: 'always',
        githubStatus: 'off',
        diffCount: 'hover',
        timestamp: 'off',
      },
    });
  });

  it('still applies core git state', () => {
    handleHostMessage(
      {
        type: 'init',
        worktrees: [
          {
            id: 'wt-1',
            path: '/repo/wt-1',
            branch: 'feature/auth',
            files: [],
            diffMode: { type: 'working' },
            defaultBranch: 'main',
            isMainWorktree: false,
            lastActivityAt: 0,
            defaultBranchStats: { fileCount: 4, linesAdded: 90, linesRemoved: 12 },
          },
        ],
      },
      noop
    );
    expect(useWorktreeStore.getState().worktrees.get('wt-1')?.defaultBranchStats).toEqual({
      fileCount: 4,
      linesAdded: 90,
      linesRemoved: 12,
    });
  });
});

describe('isAllowedOrigin', () => {
  it('accepts webview origins and the empty origin', () => {
    expect(isAllowedOrigin('')).toBe(true);
    expect(isAllowedOrigin('vscode-webview://abc')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
    expect(isAllowedOrigin('not a url')).toBe(false);
  });
});
