/* eslint-disable no-console */
const path = require('path');
const { joinUrlAndPath } = require(path.resolve(__dirname, '..', 'src', 'utils', 'urlBuilder'));

function validateUrlBuilder() {
  console.log('Validating URL builder...');

  const testCases = [
    { base: 'https://dev.example.com', path: '/about', expected: 'https://dev.example.com/about' },
    { base: 'https://dev.example.com/', path: '/about', expected: 'https://dev.example.com/about' },
    { base: 'https://dev.example.com', path: 'about', expected: 'https://dev.example.com/about' },
    { base: 'https://dev.example.com/', path: 'about', expected: 'https://dev.example.com/about' },
    { base: 'https://dev.example.com/api/', path: '/v1/users', expected: 'https://dev.example.com/api/v1/users' },
    { base: 'https://dev.example.com', path: '', expected: 'https://dev.example.com' },
    { base: 'https://dev.example.com', path: '?query=test', expected: 'https://dev.example.com?query=test' },
    { base: 'https://dev.example.com/', path: '?query=test', expected: 'https://dev.example.com/?query=test' }
  ];

  let passedTests = 0;
  const totalTests = testCases.length;

  testCases.forEach((test, index) => {
    try {
      const result = joinUrlAndPath(test.base, test.path);
      const success = result === test.expected;
      console.log(`${success ? '✅' : '❌'} Test ${index + 1}: ${test.base} + ${test.path} = ${result}`);
      if (!success) {
        console.log(`   Expected: ${test.expected}`);
      } else {
        passedTests++;
      }
    } catch (err) {
      console.error(`❌ Test ${index + 1} failed with error:`, err.message);
    }
  });

  // Test error cases
  try {
    joinUrlAndPath(null, '/about');
    console.log('❌ Should have thrown error for null base URL');
  } catch (err) {
    console.log('✅ Correctly threw error for null base URL');
    passedTests++;
  }

  try {
    joinUrlAndPath('not-a-url', '/about');
    console.log('❌ Should have thrown error for invalid base URL');
  } catch (err) {
    console.log('✅ Correctly threw error for invalid base URL');
    passedTests++;
  }

  console.log(`\nPassed ${passedTests} out of ${totalTests + 2} tests`);
  console.log('Validation complete!');
}

validateUrlBuilder();
