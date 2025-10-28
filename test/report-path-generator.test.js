const { describe, expect, it } = require('@jest/globals');

const {
  extractComparisonIdentifier,
  formatTimestampLabel,
  generateReportFileName
} = require('../src/report-path-generator');

describe('report path generator', () => {
  describe('extractComparisonIdentifier', () => {
    it('extracts domain tokens from different URLs', () => {
      const identifier = extractComparisonIdentifier(
        'https://news.example.com/login',
        'https://checkout.sample.org/cart'
      );

      expect(identifier).toBe('example-sample');
    });

    it('uses path segments when domains are identical', () => {
      const identifier = extractComparisonIdentifier(
        'https://creditcards.chase.com/a1/iberia/aep/lto',
        'https://creditcards.chase.com/avios/britishairways'
      );

      expect(identifier).toBe('iberia-britishairways');
    });
  });

  describe('formatTimestampLabel', () => {
    it('includes properly formatted timestamps', () => {
      const timestamp = new Date('2025-10-27T14:22:15Z');

      expect(formatTimestampLabel(timestamp)).toBe('10-27-25_14-22pm');
    });
  });

  describe('generateReportFileName', () => {
    it('handles malformed URLs gracefully', () => {
      const timestamp = new Date('2025-10-27T14:22:15Z');

      expect(() => {
        const fileName = generateReportFileName({
          referenceUrl: 'notaurl',
          targetUrl: 'https://valid.example.com/path',
          timestamp
        });

        expect(fileName).toBe('comparison-report_invalid-example_10-27-25_14-22pm.html');
      }).not.toThrow();
    });
  });
});
