/**
 * Temporary Jest configuration.
 * TODO: Restore coverage thresholds to 80% once additional tests are in place.
 */
module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.js',
    'scripts/**/*.js',
    'ui/src/**/*.jsx',
    '!src/**/__mocks__/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 28,
      functions: 28,
      lines: 28,
      statements: 28
    }
  },
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testMatch: ['<rootDir>/tests/unit/**/*.test.js']
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testMatch: ['<rootDir>/tests/integration/**/*.test.js']
    },
    {
      displayName: 'report-path',
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
      testMatch: ['<rootDir>/test/**/*.test.js']
    },
    {
      displayName: 'ui',
      testEnvironment: 'jsdom',
      setupFilesAfterEnv: ['<rootDir>/ui/tests/setupTests.js'],
      testMatch: ['<rootDir>/ui/src/**/*.test.jsx'],
      transform: {
        '^.+\\.(t|j)sx?$': 'babel-jest'
      },
      moduleNameMapper: {
        '\\.(css|less|sass|scss)$': '<rootDir>/tests/mocks/styleMock.js'
      }
    }
  ]
};
