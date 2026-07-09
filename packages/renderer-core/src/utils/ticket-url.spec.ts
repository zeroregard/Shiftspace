import { describe, it, expect } from 'vitest';
import { buildTicketUrl, extractTicketId } from './ticket-url';

describe('extractTicketId', () => {
  it('extracts a Jira/Linear-style id from a branch name', () => {
    expect(extractTicketId('feature/ABC-123-add-thing')).toBe('ABC-123');
    expect(extractTicketId('ENG-42')).toBe('ENG-42');
  });

  it('returns null when there is no ticket id', () => {
    expect(extractTicketId('feature/add-thing')).toBeNull();
    expect(extractTicketId('main')).toBeNull();
  });
});

describe('buildTicketUrl', () => {
  it('returns null for an empty template', () => {
    expect(buildTicketUrl('', 'ABC-123')).toBeNull();
  });

  it('substitutes {ticket} with the extracted id', () => {
    expect(buildTicketUrl('https://linear.app/acme/issue/{ticket}', 'feature/ABC-123-x')).toBe(
      'https://linear.app/acme/issue/ABC-123'
    );
  });

  it('returns null when {ticket} is required but none can be extracted', () => {
    expect(
      buildTicketUrl('https://linear.app/acme/issue/{ticket}', 'feature/add-thing')
    ).toBeNull();
  });

  it('substitutes {branch} with the URL-encoded branch name', () => {
    expect(buildTicketUrl('https://ci/{branch}', 'feature/add thing')).toBe(
      'https://ci/feature%2Fadd%20thing'
    );
  });

  it('supports both placeholders at once', () => {
    expect(buildTicketUrl('https://x/{ticket}?b={branch}', 'ABC-1-foo')).toBe(
      'https://x/ABC-1?b=ABC-1-foo'
    );
  });
});
