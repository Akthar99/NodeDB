// tests/test-runner.js
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.currentSuite = '';
  }

  describe(name, fn) {
    this.currentSuite = name;
    console.log(`\n${name}`);
    fn();
  }

  async test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      this.passed++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${error.message}`);
      if (error.stack) {
        console.log(`    Stack: ${error.stack.split('\n')[1]}`);
      }
      this.failed++;
    }
  }

  expect(value) {
    return {
      toBe: (expected) => {
        if (value !== expected) {
          throw new Error(`Expected ${value} to be ${expected}`);
        }
      },
      toBeDefined: () => {
        if (value === undefined) {
          throw new Error(`Expected value to be defined`);
        }
      },
      toBeTruthy: () => {
        if (!value) {
          throw new Error(`Expected value to be truthy`);
        }
      },
      toBeFalsy: () => {
        if (value) {
          throw new Error(`Expected value to be falsy`);
        }
      },
      toContain: (expected) => {
        if (!value.includes(expected)) {
          throw new Error(`Expected ${value} to contain ${expected}`);
        }
      },
      toHaveLength: (expected) => {
        if (value.length !== expected) {
          throw new Error(`Expected length ${value.length} to be ${expected}`);
        }
      },
      toEqual: (expected) => {
        if (JSON.stringify(value) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(value)} to equal ${JSON.stringify(expected)}`);
        }
      },
      toThrow: (expectedError) => {
        let threw = false;
        let errorMessage = '';
        try {
          if (typeof value === 'function') {
            value();
          }
        } catch (e) {
          threw = true;
          errorMessage = e.message;
        }
        if (!threw) {
          throw new Error(`Expected function to throw`);
        }
        if (expectedError && !errorMessage.includes(expectedError)) {
          throw new Error(`Expected error to contain "${expectedError}", but got "${errorMessage}"`);
        }
      }
    };
  }
}

module.exports = TestRunner;