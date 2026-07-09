import { describe, it, expect } from 'vitest';
import { parseGitHubRemote } from '../../src/github/remote';

describe('parseGitHubRemote', () => {
  it('parses scp-like SSH remotes', () => {
    expect(parseGitHubRemote('git@github.com:owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGitHubRemote('git@github.com:owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses ssh:// remotes', () => {
    expect(parseGitHubRemote('ssh://git@github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses https remotes with and without .git', () => {
    expect(parseGitHubRemote('https://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGitHubRemote('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('parses git:// remotes', () => {
    expect(parseGitHubRemote('git://github.com/owner/repo.git')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('handles a trailing slash and extra path segments', () => {
    expect(parseGitHubRemote('https://github.com/owner/repo/')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
    expect(parseGitHubRemote('https://github.com/owner/repo/extra/noise')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('ignores surrounding whitespace', () => {
    expect(parseGitHubRemote('  https://github.com/owner/repo.git\n')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('returns null for non-GitHub hosts', () => {
    expect(parseGitHubRemote('git@gitlab.com:owner/repo.git')).toBeNull();
    expect(parseGitHubRemote('https://bitbucket.org/owner/repo')).toBeNull();
    // GitHub Enterprise is out of scope for v1.
    expect(parseGitHubRemote('https://github.acme.com/owner/repo')).toBeNull();
  });

  it('returns null for malformed / incomplete remotes', () => {
    expect(parseGitHubRemote('')).toBeNull();
    expect(parseGitHubRemote('not a url')).toBeNull();
    expect(parseGitHubRemote('https://github.com/owner')).toBeNull();
    expect(parseGitHubRemote('https://github.com/')).toBeNull();
  });
});
