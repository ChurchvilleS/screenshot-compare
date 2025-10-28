const { joinUrlAndPath } = require('../../../src/utils/urlBuilder');

describe('urlBuilder.joinUrlAndPath', () => {
  it('returns the base URL without duplicate slashes when path is root', () => {
    const result = joinUrlAndPath('https://example.com/', '/');
    expect(result).toBe('https://example.com/');
  });

  it('appends query strings correctly', () => {
    const result = joinUrlAndPath('https://example.com/base', '?version=1');
    expect(result).toBe('https://example.com/base?version=1');
  });

  it('joins nested path segments preserving trailing slash intent', () => {
    const result = joinUrlAndPath('https://example.com/root/', '/pricing');
    expect(result).toBe('https://example.com/root/pricing');
  });

  it('throws for invalid base URLs', () => {
    expect(() => joinUrlAndPath('not-a-url', '/path')).toThrow('Invalid base URL');
  });
});
