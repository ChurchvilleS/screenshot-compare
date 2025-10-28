/**
 * URL builder utilities for composing environment-specific routes.
 */
const { URL } = require('url');

/**
 * Normalize a path segment before joining it with a base URL.
 * @param {string} pathSegment Path segment that may include leading slashes or query strings.
 * @returns {string} Normalized path segment.
 */
function normalizePath(pathSegment) {
  if (pathSegment == null) {
    return '';
  }

  const trimmed = String(pathSegment).trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('?') || trimmed.startsWith('#')) {
    return trimmed;
  }

  return trimmed.replace(/^\/+/, '');
}

/**
 * Validate that a base URL is a well-formed absolute URL.
 * @param {string} baseUrl Base URL string to validate.
 * @returns {URL} Parsed URL instance for reuse.
 * @throws {TypeError} When the base URL is not provided or invalid.
 */
function validateBaseUrl(baseUrl) {
  if (!baseUrl) {
    throw new TypeError('Base URL is required.');
  }

  try {
    return new URL(baseUrl);
  } catch (error) {
    throw new TypeError(`Invalid base URL provided: ${error.message}`);
  }
}

/**
 * Combine an environment base URL with a path while preserving query strings and fragments.
 * @param {string} baseUrl Absolute base URL for the environment.
 * @param {string} [pathSegment=""] Path or query string to append to the base.
 * @returns {string} Joined absolute URL.
 */
function joinUrlAndPath(baseUrl, pathSegment = '') {
  const baseHadTrailingSlash = typeof baseUrl === 'string' && baseUrl.trim().endsWith('/');
  const parsedBase = validateBaseUrl(baseUrl);
  const normalizedPath = normalizePath(pathSegment);
  const baseString = parsedBase.toString();

  if (!normalizedPath) {
    if (parsedBase.pathname === '/' && !parsedBase.search && !parsedBase.hash) {
      return baseHadTrailingSlash ? baseString : baseString.replace(/\/$/, '');
    }
    return baseString;
  }

  if (normalizedPath.startsWith('?') || normalizedPath.startsWith('#')) {
    const baseForQuery = baseHadTrailingSlash ? baseString : baseString.replace(/\/$/, '');
    return `${baseForQuery}${normalizedPath}`;
  }

  const baseForJoin = baseString.endsWith('/') ? baseString : `${baseString}/`;
  const joinedUrl = new URL(normalizedPath, baseForJoin);

  return joinedUrl.toString();
}

module.exports = {
  joinUrlAndPath
};
