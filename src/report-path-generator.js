'use strict';

const path = require('path');
const slugify = require('slugify');

function sanitizeToken(value, fallback = 'unknown') {
  const base = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const slug = slugify(base, { lower: true, strict: true });
  if (slug && slug.length > 0) {
    return slug;
  }
  const fallbackSlug = slugify(fallback, { lower: true, strict: true });
  return fallbackSlug || fallback.toLowerCase();
}

function safeParseUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return null;
  }
  try {
    return new URL(url);
  } catch (error) {
    return null;
  }
}

function selectPathToken(parsedUrl, original) {
  if (!parsedUrl) {
    return sanitizeToken('invalid', 'invalid');
  }

  const rawSegments = parsedUrl.pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
  if (rawSegments.length === 0) {
    return sanitizeToken(parsedUrl.hostname || original, 'root');
  }

  const cleanedSegments = rawSegments
    .map((segment) => segment.replace(/\.[a-zA-Z0-9]+$/, ''))
    .filter(Boolean);

  if (cleanedSegments.length === 0) {
    return sanitizeToken(parsedUrl.hostname || original, 'root');
  }

  const meaningfulSegments = cleanedSegments.filter((segment) => segment.length > 3);
  const chosen = (meaningfulSegments.length > 0 ? meaningfulSegments : cleanedSegments)
    .reduce((longest, current) => (current.length > longest.length ? current : longest), cleanedSegments[0]);

  return sanitizeToken(chosen, 'path');
}

function getDomainToken(url) {
  const parsed = safeParseUrl(url);
  if (!parsed) {
    return null;
  }
  const hostname = (parsed.hostname || '').replace(/^www\./i, '');
  if (!hostname) {
    return null;
  }
  const parts = hostname.split('.').filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  const secondLevel = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return sanitizeToken(secondLevel, hostname);
}

function extractComparisonIdentifier(referenceUrl, targetUrl) {
  const referenceDomain = getDomainToken(referenceUrl);
  const targetDomain = getDomainToken(targetUrl);

  const useDomainTokens = referenceDomain && targetDomain && referenceDomain !== targetDomain;

  const referenceParsed = safeParseUrl(referenceUrl);
  const targetParsed = safeParseUrl(targetUrl);

  const isGenericToken = (token) => ['path', 'root', 'index', 'home', 'page'].includes(token);

  const referencePathToken = selectPathToken(referenceParsed, referenceUrl);
  const targetPathToken = selectPathToken(targetParsed, targetUrl);

  const referenceToken = useDomainTokens
    ? referenceDomain
    : (!isGenericToken(referencePathToken) && referencePathToken)
      || referenceDomain
      || sanitizeToken(referenceUrl, 'reference');
  const targetToken = useDomainTokens
    ? targetDomain
    : (!isGenericToken(targetPathToken) && targetPathToken)
      || targetDomain
      || sanitizeToken(targetUrl, 'target');

  return [referenceToken, targetToken].join('-');
}

function formatTimestampLabel(timestampInput = new Date()) {
  let date = timestampInput instanceof Date ? timestampInput : new Date(timestampInput);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    date = new Date();
  }

  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = String(date.getUTCFullYear()).slice(-2);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const suffix = date.getUTCHours() >= 12 ? 'pm' : 'am';

  return `${month}-${day}-${year}_${hours}-${minutes}${suffix}`;
}

function generateReportFileName(options = {}) {
  const {
    referenceUrl,
    targetUrl,
    timestamp = new Date(),
    prefix = 'comparison-report',
    extension = '.html'
  } = options;

  const identifier = extractComparisonIdentifier(referenceUrl, targetUrl);
  const label = formatTimestampLabel(timestamp);
  const normalizedPrefix = sanitizeToken(prefix, 'comparison-report');
  const normalizedExtension = typeof extension === 'string' && extension.trim().startsWith('.')
    ? extension.trim()
    : '.html';

  return `${normalizedPrefix}_${identifier}_${label}${normalizedExtension}`;
}

function generateReportPath(options = {}) {
  const { directory = path.join('screenshots', 'diff') } = options;
  const reportFileName = generateReportFileName(options);
  const baseDir = typeof directory === 'string' && directory.trim()
    ? directory
    : path.join('screenshots', 'diff');
  return path.join(baseDir, reportFileName);
}

module.exports = {
  extractComparisonIdentifier,
  formatTimestampLabel,
  generateReportFileName,
  generateReportPath
};
