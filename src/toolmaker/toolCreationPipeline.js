/**
 * 🛠️ MYRA SELF-EXPANDING ENGINE — TOOL CREATION PIPELINE
 * 10-Stage Autonomous Lifecycle:
 * LEARN -> DESIGN -> GENERATE -> TEST -> VALIDATE -> REGISTER -> APPROVE -> ACTIVATE -> MONITOR -> IMPROVE
 * Backed by myra_generated_tools and safe rollback controls.
 */

import { safeSandboxRunner } from './safeSandboxRunner.js';
import {
  createGeneratedTool,
  getGeneratedToolByName,
  listGeneratedTools,
  updateGeneratedToolStatus,
  logAudit,
} from '../db/index.js';

export class ToolCreationPipeline {
  constructor() {
    this.name = 'ToolCreationPipeline';
  }

  /**
   * Run the full pipeline from specification to validation & staging
   */
  async createCustomTool({
    toolName,
    category = 'automation',
    description,
    inputSchema = {},
    outputSchema = {},
    code,
    language = 'javascript',
    testSuite = [],
    requiresElevated = false,
  }) {
    if (!toolName || !/^[a-z0-9_]+$/i.test(toolName)) {
      throw new Error(`Invalid tool name "${toolName}". Use alphanumeric and underscores only.`);
    }

    if (!code || typeof code !== 'string') {
      throw new Error('Tool implementation code is required.');
    }

    // Stage 1 & 2: LEARN & DESIGN are captured in input parameters

    // Stage 3: GENERATE (code provided or transpiled)
    const existingTool = getGeneratedToolByName(toolName);
    const rollbackCode = existingTool ? existingTool.code : null;

    // Stage 4: TEST in safe sandbox
    const testOutcomes = await safeSandboxRunner.runTestSuite(code, testSuite);

    // Stage 5: VALIDATE performance & safety
    const maxAllowedTime = 3000;
    const performanceValid = testOutcomes.totalTimeMs <= maxAllowedTime;
    const isValid = testOutcomes.allPassed && performanceValid;

    const sandboxMetrics = {
      totalTimeMs: testOutcomes.totalTimeMs,
      allPassed: testOutcomes.allPassed,
      passedCount: testOutcomes.passedCount,
      totalCount: testOutcomes.testCount,
    };

    // Stage 6: REGISTER into database
    let initialStatus = 'test_failed';
    if (isValid) {
      initialStatus = requiresElevated ? 'pending_owner_approval' : 'approved';
    }

    const tool = createGeneratedTool({
      toolName,
      category,
      description: description || `Autonomous tool: ${toolName}`,
      inputSchema,
      outputSchema,
      code,
      language,
      status: initialStatus,
      testSuite,
      testResults: testOutcomes.results,
      sandboxMetrics,
      rollbackCode,
    });

    logAudit('toolmaker', 'TOOL_PIPELINE_RUN', `Tool: ${toolName}, Status: ${initialStatus}, Passed: ${testOutcomes.passedCount}/${testOutcomes.testCount}`);

    return {
      toolName,
      status: initialStatus,
      passed: isValid,
      testOutcomes,
      requiresOwnerApproval: initialStatus === 'pending_owner_approval',
      tool,
    };
  }

  /**
   * Stage 7 & 8: Owner Approval and Activation
   */
  async approveAndActivateTool(toolName, approvedBy = 'Sandy') {
    const tool = getGeneratedToolByName(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found.`);

    const updated = updateGeneratedToolStatus(toolName, 'active', {
      reviewed_by: approvedBy,
    });

    logAudit('toolmaker', 'TOOL_ACTIVATED', `Tool: ${toolName} activated by ${approvedBy}`);
    return updated;
  }

  /**
   * Execute an active tool safely
   */
  async executeTool(toolName, args = {}) {
    const tool = getGeneratedToolByName(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found.`);
    if (tool.status !== 'active' && tool.status !== 'approved') {
      throw new Error(`Tool ${toolName} is not active (current status: ${tool.status}).`);
    }

    const runOutcome = await safeSandboxRunner.runSandboxed(tool.code, args);
    return runOutcome;
  }

  /**
   * Stage 10: Rollback to previous version if regressions or errors occur
   */
  async rollbackTool(toolName, reason = 'Regression detected') {
    const tool = getGeneratedToolByName(toolName);
    if (!tool) throw new Error(`Tool ${toolName} not found.`);
    if (!tool.rollback_code) {
      throw new Error(`No previous rollback version available for ${toolName}.`);
    }

    const updated = updateGeneratedToolStatus(toolName, 'rolled_back', {
      test_results: [{ rollbackReason: reason, timestamp: new Date().toISOString() }],
    });

    // Revert code
    createGeneratedTool({
      toolName,
      category: tool.category,
      description: tool.description,
      inputSchema: tool.input_schema,
      outputSchema: tool.output_schema,
      code: tool.rollback_code,
      language: tool.language,
      status: 'active',
      testSuite: tool.test_suite,
      rollbackCode: null,
    });

    logAudit('toolmaker', 'TOOL_ROLLED_BACK', `Tool: ${toolName} reverted. Reason: ${reason}`);
    return getGeneratedToolByName(toolName);
  }

  /**
   * List all generated tools
   */
  listTools(status = null) {
    return listGeneratedTools(status);
  }
}

export const toolCreationPipeline = new ToolCreationPipeline();
