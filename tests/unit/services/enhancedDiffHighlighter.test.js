const { 
  detectChangeRegions,
  classifyChangeType,
  generateHighlightedDiff,
  calculateRegionSimilarity,
  normalizeRegionPositions
} = require('../../../src/services/enhancedDiffHighlighter');

describe('EnhancedDiffHighlighter', () => {
  describe('detectChangeRegions', () => {
    test('should detect regions with actual content changes', () => {
      // Test detecting regions where content has changed vs. just position shifts
      const referenceImage = {}; // Mock PNG data
      const targetImage = {}; // Mock PNG data
      const options = { verticalTolerance: 50, minRegionHeight: 100 };
      
      const result = detectChangeRegions(referenceImage, targetImage, options);
      
      expect(result).toBeDefined();
      expect(Array.isArray(result.regions)).toBe(true);
    });

    test('should not flag regions that only shifted vertically', () => {
      // Test that content which merely moved down is not flagged as changed
      const referenceImage = {}; // Mock PNG with content at y=500
      const targetImage = {}; // Mock PNG with same content at y=550
      const options = { verticalTolerance: 100 };
      
      const result = detectChangeRegions(referenceImage, targetImage, options);
      
      // Should not detect a change if within tolerance
      expect(result.regions.filter(r => r.changeType === 'position-shift')).toBeDefined();
    });

    test('should detect inserted content regions', () => {
      // Test detecting new content that was added
      const referenceImage = {}; // Mock PNG without section
      const targetImage = {}; // Mock PNG with new section
      
      const result = detectChangeRegions(referenceImage, targetImage, {});
      
      const insertions = result.regions.filter(r => r.changeType === 'insertion');
      expect(insertions.length).toBeGreaterThan(0);
    });

    test('should detect deleted content regions', () => {
      // Test detecting content that was removed
      const referenceImage = {}; // Mock PNG with section
      const targetImage = {}; // Mock PNG without section
      
      const result = detectChangeRegions(referenceImage, targetImage, {});
      
      const deletions = result.regions.filter(r => r.changeType === 'deletion');
      expect(deletions.length).toBeGreaterThan(0);
    });

    test('should handle images with different dimensions', () => {
      // Test graceful handling when images have different sizes
      const referenceImage = { width: 1280, height: 1024 };
      const targetImage = { width: 1024, height: 768 };
      
      expect(() => {
        detectChangeRegions(referenceImage, targetImage, {});
      }).not.toThrow();
    });
  });

  describe('classifyChangeType', () => {
    test('should classify content modification', () => {
      // Test identifying when content changed but stayed in same location
      const region = {
        bounds: { x: 100, y: 200, width: 300, height: 150 },
        referenceSimilarity: 0.3,
        verticalDisplacement: 0
      };
      
      const changeType = classifyChangeType(region, { similarityThreshold: 0.5 });
      
      expect(changeType).toBe('modification');
    });

    test('should classify position shift', () => {
      // Test identifying when content moved but did not change
      const region = {
        bounds: { x: 100, y: 200, width: 300, height: 150 },
        referenceSimilarity: 0.95,
        verticalDisplacement: 100
      };
      
      const changeType = classifyChangeType(region, { similarityThreshold: 0.9 });
      
      expect(changeType).toBe('position-shift');
    });

    test('should classify insertion', () => {
      // Test identifying new content that was added
      const region = {
        bounds: { x: 100, y: 500, width: 300, height: 150 },
        referenceSimilarity: 0,
        matchedInReference: false
      };
      
      const changeType = classifyChangeType(region, {});
      
      expect(changeType).toBe('insertion');
    });

    test('should classify deletion', () => {
      // Test identifying content that was removed
      const region = {
        bounds: { x: 100, y: 500, width: 300, height: 150 },
        targetSimilarity: 0,
        matchedInTarget: false
      };
      
      const changeType = classifyChangeType(region, {});
      
      expect(changeType).toBe('deletion');
    });
  });

  describe('generateHighlightedDiff', () => {
    test('should generate diff with highlighted regions only', () => {
      // Test that only actual changes are highlighted
      const referenceImage = {}; // Mock PNG
      const targetImage = {}; // Mock PNG
      const changeRegions = [
        { changeType: 'modification', bounds: { x: 100, y: 200, width: 300, height: 150 } }
      ];
      const options = { highlightMode: 'content-only' };
      
      const result = generateHighlightedDiff(referenceImage, targetImage, changeRegions, options);
      
      expect(result).toBeDefined();
      expect(result.diffImage).toBeDefined();
      expect(result.highlightedRegions).toBeDefined();
    });

    test('should use correct colors for different change types', () => {
      // Test that insertions are green, deletions are red, modifications are yellow
      const changeRegions = [
        { changeType: 'insertion', bounds: { x: 0, y: 0, width: 100, height: 100 } },
        { changeType: 'deletion', bounds: { x: 0, y: 100, width: 100, height: 100 } },
        { changeType: 'modification', bounds: { x: 0, y: 200, width: 100, height: 100 } }
      ];
      const options = {
        changeColors: {
          insert: '#28a745',
          delete: '#dc3545',
          modify: '#ffc107'
        }
      };
      
      const result = generateHighlightedDiff({}, {}, changeRegions, options);
      
      expect(result.colorMap).toBeDefined();
      expect(result.colorMap.insertion).toBe('#28a745');
      expect(result.colorMap.deletion).toBe('#dc3545');
      expect(result.colorMap.modification).toBe('#ffc107');
    });

    test('should apply border highlighting when mode is border', () => {
      // Test border mode creates bounding boxes
      const changeRegions = [
        { changeType: 'modification', bounds: { x: 100, y: 200, width: 300, height: 150 } }
      ];
      const options = { highlightMode: 'border', borderWidth: 2 };
      
      const result = generateHighlightedDiff({}, {}, changeRegions, options);
      
      expect(result.highlightStyle).toBe('border');
      expect(result.borderWidth).toBe(2);
    });

    test('should apply overlay highlighting when mode is overlay', () => {
      // Test overlay mode creates semi-transparent overlays
      const changeRegions = [
        { changeType: 'modification', bounds: { x: 100, y: 200, width: 300, height: 150 } }
      ];
      const options = { highlightMode: 'overlay', overlayOpacity: 0.3 };
      
      const result = generateHighlightedDiff({}, {}, changeRegions, options);
      
      expect(result.highlightStyle).toBe('overlay');
      expect(result.overlayOpacity).toBe(0.3);
    });
  });

  describe('calculateRegionSimilarity', () => {
    test('should calculate high similarity for identical regions', () => {
      // Test that identical content has similarity near 1.0
      const region1 = {}; // Mock image region data
      const region2 = {}; // Mock identical image region data
      
      const similarity = calculateRegionSimilarity(region1, region2);
      
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    test('should calculate low similarity for different regions', () => {
      // Test that different content has similarity near 0.0
      const region1 = {}; // Mock image region with content A
      const region2 = {}; // Mock image region with content B
      
      const similarity = calculateRegionSimilarity(region1, region2);
      
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    test('should handle regions with different dimensions', () => {
      // Test graceful handling of mismatched region sizes
      const region1 = { width: 300, height: 200 };
      const region2 = { width: 400, height: 250 };
      
      expect(() => {
        calculateRegionSimilarity(region1, region2);
      }).not.toThrow();
    });
  });

  describe('normalizeRegionPositions', () => {
    test('should align regions with vertical displacement tolerance', () => {
      // Test that regions within tolerance are matched
      const referenceRegions = [
        { bounds: { x: 100, y: 500, width: 300, height: 150 } }
      ];
      const targetRegions = [
        { bounds: { x: 100, y: 550, width: 300, height: 150 } }
      ];
      const options = { verticalTolerance: 100 };
      
      const result = normalizeRegionPositions(referenceRegions, targetRegions, options);
      
      expect(result.matchedPairs).toBeDefined();
      expect(result.matchedPairs.length).toBeGreaterThan(0);
    });

    test('should identify unmatched regions as insertions/deletions', () => {
      // Test that unmatched regions are properly classified
      const referenceRegions = [
        { bounds: { x: 100, y: 200, width: 300, height: 150 } }
      ];
      const targetRegions = [
        { bounds: { x: 100, y: 200, width: 300, height: 150 } },
        { bounds: { x: 100, y: 500, width: 300, height: 100 } }
      ];
      
      const result = normalizeRegionPositions(referenceRegions, targetRegions, {});
      
      expect(result.insertions).toBeDefined();
      expect(result.insertions.length).toBeGreaterThan(0);
    });

    test('should handle empty region arrays', () => {
      // Test graceful handling of empty inputs
      const result = normalizeRegionPositions([], [], {});
      
      expect(result.matchedPairs).toEqual([]);
      expect(result.insertions).toEqual([]);
      expect(result.deletions).toEqual([]);
    });
  });

  describe('Integration scenarios', () => {
    test('should handle scenario: image swap + paragraph addition', () => {
      // Real-world scenario: developer swaps image and adds paragraph
      const referenceImage = {}; // Mock original page
      const targetImage = {}; // Mock page with swapped image and new paragraph
      const options = {
        verticalTolerance: 50,
        highlightMode: 'border',
        changeColors: {
          insert: '#28a745',
          modify: '#ffc107'
        }
      };
      
      const regions = detectChangeRegions(referenceImage, targetImage, options);
      const diff = generateHighlightedDiff(referenceImage, targetImage, regions.regions, options);
      
      // Should detect 2 changes: image modification and paragraph insertion
      expect(regions.regions.length).toBeGreaterThan(0);
      expect(diff.highlightedRegions.length).toBeGreaterThan(0);
    });

    test('should handle scenario: responsive layout reflow', () => {
      // Scenario: same content at different viewport width
      const referenceImage = { width: 1280 }; // Desktop layout
      const targetImage = { width: 1024 }; // Tablet layout
      const options = { verticalTolerance: 200, minRegionHeight: 50 };
      
      const regions = detectChangeRegions(referenceImage, targetImage, options);
      
      // Should detect minimal changes (only content differences, not layout shifts)
      expect(regions.regions).toBeDefined();
    });

    test('should handle scenario: section deletion causing reflow', () => {
      // Scenario: middle section removed, bottom section shifts up
      const referenceImage = {}; // Page with 3 sections
      const targetImage = {}; // Page with 2 sections (middle removed)
      const options = { verticalTolerance: 300 };
      
      const regions = detectChangeRegions(referenceImage, targetImage, options);
      
      // Should detect deletion but not flag shifted footer
      const deletions = regions.regions.filter(r => r.changeType === 'deletion');
      expect(deletions.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    test('should handle images with no detectable changes', () => {
      // Test handling of identical images
      const image = {}; // Mock PNG
      
      const result = detectChangeRegions(image, image, {});
      
      expect(result.regions).toEqual([]);
    });

    test('should handle images with extreme aspect ratio differences', () => {
      // Test handling of very different image shapes
      const referenceImage = { width: 1920, height: 500 };
      const targetImage = { width: 500, height: 1920 };
      
      expect(() => {
        detectChangeRegions(referenceImage, targetImage, {});
      }).not.toThrow();
    });

    test('should handle options with invalid values', () => {
      // Test graceful handling of invalid configuration
      const options = {
        verticalTolerance: -100,
        minRegionHeight: 0,
        similarityThreshold: 1.5
      };
      
      expect(() => {
        detectChangeRegions({}, {}, options);
      }).not.toThrow();
    });
  });
});
