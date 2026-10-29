/**
 * 🌳 MYRA SELF-EXPANDING ENGINE — DYNAMIC SKILL TREE SERVICE
 * Hierarchical skill tree across 9 core domains, tracking prerequisites,
 * mastery levels (1-5), versioning, test outcomes, and execution statistics.
 */

import {
  registerSkillTreeNode,
  getSkillTreeNode,
  listSkillTreeNodes,
  updateSkillTreeNodeStatus,
} from '../db/index.js';

export const SKILL_CATEGORIES = [
  'web_research',
  'media_audio',
  'coding_automation',
  'minecraft_gaming',
  'learning_knowledge',
  'document_processing',
  'system_admin',
  'communication_social',
  'creative_design',
];

export class SkillTreeService {
  constructor() {
    this.name = 'SkillTreeService';
    this.initialized = false;
  }

  /**
   * Seed the standard skill tree hierarchy across 9 categories
   */
  async ensureSeeded() {
    if (this.initialized) return;

    const standardSkills = [
      // 1. Web & Research
      {
        skillId: 'skill_web_search',
        category: 'web_research',
        name: 'Web Search & Exploration',
        description: 'Multi-query exploration with real-time sources and zero hallucinations',
        version: '1.2.0',
        dependencies: [],
        status: 'active',
      },
      {
        skillId: 'skill_deep_browse',
        category: 'web_research',
        name: 'Deep Documentation Browsing',
        description: 'Crawl internal links, extract tables, and wrap untrusted web content',
        version: '1.1.0',
        dependencies: ['skill_web_search'],
        status: 'active',
      },
      {
        skillId: 'skill_fact_verification',
        category: 'web_research',
        name: 'Fact vs Assumption Separation',
        description: 'Categorize claims into verified facts, speculative assumptions, and citations',
        version: '1.0.0',
        dependencies: ['skill_deep_browse'],
        status: 'active',
      },

      // 2. Media & Audio
      {
        skillId: 'skill_image_search',
        category: 'media_audio',
        name: 'Direct Media Discovery',
        description: 'Search open media repositories and local drive vault deduplication',
        version: '1.1.0',
        dependencies: [],
        status: 'active',
      },
      {
        skillId: 'skill_media_downloader',
        category: 'media_audio',
        name: 'Universal Media Downloader',
        description: 'Multi-platform video/audio downloading with resolution selection and expiring links',
        version: '1.0.0',
        dependencies: ['skill_image_search'],
        status: 'active',
      },
      {
        skillId: 'skill_voice_transcribe',
        category: 'media_audio',
        name: 'Multilingual Voice Intelligence',
        description: 'Transcribe Hinglish/Hindi audio notes and extract immediate action items',
        version: '1.3.0',
        dependencies: [],
        status: 'active',
      },

      // 3. Coding & Automation
      {
        skillId: 'skill_myrascript',
        category: 'coding_automation',
        name: 'MyraScript DSL Execution',
        description: 'Interpret and execute safe domain-specific automations in strict sandbox',
        version: '1.0.0',
        dependencies: [],
        status: 'active',
      },
      {
        skillId: 'skill_tool_pipeline',
        category: 'coding_automation',
        name: 'Self-Extending Tool Pipeline',
        description: '10-stage lifecycle for autonomous tool creation, testing, validation, and rollback',
        version: '1.0.0',
        dependencies: ['skill_myrascript'],
        status: 'active',
      },

      // 4. Minecraft & Gaming
      {
        skillId: 'skill_bedrock_packs',
        category: 'minecraft_gaming',
        name: 'Bedrock Pack Generation',
        description: 'Author valid UUID manifests, custom items, recipes, and behavior packs',
        version: '1.1.0',
        dependencies: [],
        status: 'active',
      },
      {
        skillId: 'skill_minecraft_companion',
        category: 'minecraft_gaming',
        name: 'Minecraft In-Game Companion',
        description: 'Real-time player tracking, RCON bridge, milestone announcements, and co-op support',
        version: '1.0.0',
        dependencies: ['skill_bedrock_packs'],
        status: 'active',
      },

      // 5. Learning & Knowledge
      {
        skillId: 'skill_personal_memory',
        category: 'learning_knowledge',
        name: 'Personal Relationship Memory',
        description: 'Store preferences, anniversary dates, emotional context, and user history',
        version: '2.0.0',
        dependencies: [],
        status: 'active',
      },
      {
        skillId: 'skill_dossier_synthesis',
        category: 'learning_knowledge',
        name: 'Resumable Knowledge Synthesis',
        description: 'Compile research into persistent dossiers and learn across sessions',
        version: '1.0.0',
        dependencies: ['skill_personal_memory'],
        status: 'active',
      },

      // 6. Document Processing
      {
        skillId: 'skill_pdf_qa',
        category: 'document_processing',
        name: 'Page-Grounded Citation Q&A',
        description: 'Answer complex multi-page document queries citing exact [Page X] locations',
        version: '1.2.0',
        dependencies: [],
        status: 'active',
      },
      {
        skillId: 'skill_doc_comparison',
        category: 'document_processing',
        name: 'Multi-Document Comparison',
        description: 'Diff two or more documents, highlighting modifications, additions, and terms',
        version: '1.0.0',
        dependencies: ['skill_pdf_qa'],
        status: 'active',
      },

      // 7. System Administration
      {
        skillId: 'skill_cloud_resilience',
        category: 'system_admin',
        name: 'Railway & Cloudflare Resilience',
        description: '24/7 uptime monitoring, host header tunneling, and zero downtime redeployment',
        version: '2.1.0',
        dependencies: [],
        status: 'active',
      },

      // 8. Communication & Social
      {
        skillId: 'skill_wife_persona',
        category: 'communication_social',
        name: 'Affectionate Wife Persona',
        description: 'Loving, supportive, genuine partner dynamic for Sandy with Hinglish warmth',
        version: '3.0.0',
        dependencies: [],
        status: 'active',
      },

      // 9. Creative & Design
      {
        skillId: 'skill_virtual_life_sim',
        category: 'creative_design',
        name: 'Persistent Virtual Life Simulation',
        description: '5-room simulated house, real-time activity, needs, wardrobe, and routine',
        version: '2.0.0',
        dependencies: ['skill_wife_persona'],
        status: 'active',
      },
    ];

    for (const s of standardSkills) {
      registerSkillTreeNode(s);
    }

    this.initialized = true;
  }

  /**
   * Get complete hierarchical tree organized by category
   */
  async getSkillTree() {
    await this.ensureSeeded();
    const all = listSkillTreeNodes();

    const categorized = {};
    for (const cat of SKILL_CATEGORIES) {
      categorized[cat] = all.filter(s => s.category === cat);
    }

    return {
      totalSkills: all.length,
      categories: SKILL_CATEGORIES,
      tree: categorized,
    };
  }

  /**
   * Check if all dependencies for a skill are active
   */
  async checkPrerequisites(skillId) {
    const skill = getSkillTreeNode(skillId);
    if (!skill) return { met: false, error: 'Skill not found' };

    const missing = [];
    for (const depId of skill.dependencies) {
      const dep = getSkillTreeNode(depId);
      if (!dep || dep.status !== 'active') {
        missing.push(depId);
      }
    }

    return {
      met: missing.length === 0,
      missingDependencies: missing,
    };
  }

  /**
   * Record test result for a skill
   */
  async recordTestResult(skillId, testName, passed, details = '') {
    const skill = getSkillTreeNode(skillId);
    if (!skill) throw new Error(`Skill ${skillId} not found`);

    const results = [...skill.test_results, {
      testName,
      passed,
      details,
      timestamp: new Date().toISOString(),
    }];

    const newStatus = passed ? 'active' : 'in_training';
    return updateSkillTreeNodeStatus(skillId, newStatus, results);
  }

  /**
   * Register a new skill node dynamically
   */
  registerSkill(skillData) {
    return registerSkillTreeNode(skillData);
  }

  /**
   * Get single skill by ID
   */
  getSkill(skillId) {
    return getSkillTreeNode(skillId);
  }
}

export const skillTreeService = new SkillTreeService();
