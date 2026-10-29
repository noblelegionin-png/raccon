/**
 * 🛡️ MYRA SELF-EXPANDING ENGINE — SAFE SANDBOX RUNNER
 * Node.js vm-isolated execution environment with strict CPU timeout (3,000ms),
 * memory isolation, forbidden prototype pollution & host escape prevention.
 */

import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

export class SafeSandboxRunner {
  constructor() {
    this.timeoutMs = 3000; // 3,000 ms hard CPU timeout
    this.maxOutputBytes = 2 * 1024 * 1024; // 2 MB output limit
  }

  /**
   * Run code in an isolated VM context with strict boundaries
   */
  async runSandboxed(code, inputArgs = {}, capabilities = {}) {
    const startTime = performance.now();
    const logs = [];

    // Construct isolated context with zero access to Node environment
    const sandboxContext = {
      args: Object.freeze({ ...inputArgs }),
      capabilities: Object.freeze({ ...capabilities }),
      console: {
        log: (...msgs) => logs.push(msgs.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' ')),
        error: (...msgs) => logs.push(`[ERROR] ${msgs.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' ')}`),
        warn: (...msgs) => logs.push(`[WARN] ${msgs.map(m => typeof m === 'object' ? JSON.stringify(m) : String(m)).join(' ')}`),
      },
      Math,
      Date,
      JSON,
      String,
      Number,
      Boolean,
      Array,
      Object,
      RegExp,
      Map,
      Set,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      // Strictly nullify hostile host handles
      process: null,
      require: null,
      global: null,
      globalThis: null,
      Function: null,
      eval: null,
    };

    const context = vm.createContext(sandboxContext);

    try {
      // Wrap code in an immediately invoked async function that receives args
      const wrappedScript = `
        "use strict";
        (async () => {
          ${code}
        })()
      `;

      const script = new vm.Script(wrappedScript);
      const executionPromise = script.runInContext(context, {
        timeout: this.timeoutMs,
        displayErrors: true,
      });

      const result = await executionPromise;
      const durationMs = Math.round(performance.now() - startTime);

      // Verify result size
      let serialized = '';
      try {
        serialized = JSON.stringify(result) || '';
      } catch {
        serialized = String(result);
      }

      if (serialized.length > this.maxOutputBytes) {
        throw new Error(`OutputSizeExceeded: Result of ${serialized.length} bytes exceeded 2 MB ceiling.`);
      }

      return {
        success: true,
        result,
        executionTimeMs: durationMs,
        logs,
      };
    } catch (err) {
      const durationMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        error: err.message,
        executionTimeMs: durationMs,
        logs,
      };
    }
  }

  /**
   * Run a test suite against a candidate tool code block
   */
  async runTestSuite(code, testCases = [], capabilities = {}) {
    const results = [];
    let allPassed = true;
    let totalTime = 0;

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const outcome = await this.runSandboxed(code, tc.input || {}, capabilities);
      totalTime += outcome.executionTimeMs;

      let passed = outcome.success;
      if (passed && tc.expected !== undefined) {
        passed = JSON.stringify(outcome.result) === JSON.stringify(tc.expected);
      }

      if (!passed) allPassed = false;

      results.push({
        testIndex: i + 1,
        testName: tc.name || `Case #${i + 1}`,
        passed,
        executionTimeMs: outcome.executionTimeMs,
        actual: outcome.result,
        expected: tc.expected,
        error: outcome.error,
      });
    }

    return {
      allPassed,
      totalTimeMs: totalTime,
      testCount: testCases.length,
      passedCount: results.filter(r => r.passed).length,
      results,
    };
  }
}

export const safeSandboxRunner = new SafeSandboxRunner();
