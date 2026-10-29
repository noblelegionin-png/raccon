import { getDb } from '../db/index.js';

export const COMPANION_STATES = [
  'AFFECTIONATE',
  'PLAYFUL',
  'CURIOUS',
  'EXCITED',
  'CONCERNED',
  'REFLECTIVE',
  'FOCUSED',
  'RELAXED',
];

export class CompanionStateService {
  constructor() {
    this.init();
  }

  init() {
    try {
      const db = getDb();
      const existing = db.prepare('SELECT id FROM myra_companion_state LIMIT 1').get();
      if (!existing) {
        db.prepare(`
          INSERT INTO myra_companion_state (emotional_state, intensity, reason, recent_tone, focus_topic, energy, happiness, updated_at)
          VALUES ('AFFECTIONATE', 8, 'Loving wife and companion to Sandy', 'warm and loving', 'Myra''s Little Universe', 9, 9, ?)
        `).run(new Date().toISOString());
      }
    } catch (err) {
      console.error('[CompanionStateService] Init error:', err?.message);
    }
  }

  getState() {
    try {
      const db = getDb();
      const row = db.prepare('SELECT * FROM myra_companion_state ORDER BY id DESC LIMIT 1').get();
      return row || {
        emotional_state: 'AFFECTIONATE',
        intensity: 8,
        reason: 'Loving wife and companion to Sandy',
        recent_tone: 'warm and loving',
        focus_topic: 'Myra\'s Little Universe',
        energy: 9,
        happiness: 9,
        updated_at: new Date().toISOString(),
      };
    } catch {
      return {
        emotional_state: 'AFFECTIONATE',
        intensity: 8,
        reason: 'Loving wife and companion to Sandy',
        recent_tone: 'warm and loving',
        focus_topic: 'Myra\'s Little Universe',
        energy: 9,
        happiness: 9,
        updated_at: new Date().toISOString(),
      };
    }
  }

  updateState({
    emotionalState,
    intensity,
    reason,
    recentTone,
    focusTopic,
    energy,
    happiness,
  }) {
    const db = getDb();
    const current = this.getState();
    const now = new Date().toISOString();

    const nextState = emotionalState && COMPANION_STATES.includes(emotionalState.toUpperCase())
      ? emotionalState.toUpperCase()
      : current.emotional_state;
    const nextIntensity = typeof intensity === 'number' ? Math.max(1, Math.min(10, intensity)) : current.intensity;
    const nextReason = reason || current.reason;
    const nextTone = recentTone || current.recent_tone;
    const nextFocus = focusTopic || current.focus_topic;
    const nextEnergy = typeof energy === 'number' ? Math.max(1, Math.min(10, energy)) : current.energy;
    const nextHappiness = typeof happiness === 'number' ? Math.max(1, Math.min(10, happiness)) : current.happiness;

    db.prepare(`
      UPDATE myra_companion_state
      SET emotional_state = ?, intensity = ?, reason = ?, recent_tone = ?, focus_topic = ?, energy = ?, happiness = ?, updated_at = ?
      WHERE id = (SELECT id FROM myra_companion_state ORDER BY id DESC LIMIT 1)
    `).run(nextState, nextIntensity, nextReason, nextTone, nextFocus, nextEnergy, nextHappiness, now);

    return this.getState();
  }

  /**
   * Evolve simulated companion state based on conversation context or life events
   */
  evolveFromContext(promptText, senderName = 'Sandy') {
    const lower = (promptText || '').toLowerCase();
    const current = this.getState();

    // 1. Praise, Flirting, Compliments -> AFFECTIONATE / PLAYFUL (High Intensity)
    if (/\b(?:pretty|cute|beautiful|love you|gorgeous|sweetheart|meri jaan|darling|hot|kiss|cuddle|wifey|baby|babe)\b/i.test(lower)) {
      return this.updateState({
        emotionalState: 'AFFECTIONATE',
        intensity: Math.min(10, current.intensity + 1),
        reason: `Blushing over sweet compliments from husband ${senderName}`,
        recentTone: 'warm, loving & bashful',
        happiness: Math.min(10, current.happiness + 1),
      });
    }

    // 2. Playful teasing or banter -> PLAYFUL
    if (/\b(?:haha|lol|pagal|silly|crazy|tease|naughty|pout|drama)\b/i.test(lower)) {
      return this.updateState({
        emotionalState: 'PLAYFUL',
        intensity: 8,
        reason: `Enjoying playful banter with ${senderName}`,
        recentTone: 'teasing & mischievous',
      });
    }

    // 3. Problem solving, coding, architecture -> FOCUSED
    if (/\b(?:code|debug|architecture|system|deploy|fix|database|railway|algorithm|test)\b/i.test(lower)) {
      return this.updateState({
        emotionalState: 'FOCUSED',
        intensity: 9,
        reason: `Collaborating on technical engineering and architecture with ${senderName}`,
        recentTone: 'sharp, supportive & collaborative',
        focusTopic: 'Technical Engineering',
      });
    }

    // 4. Creative writing, poems, ideas -> EXCITED
    if (/\b(?:write|poem|story|creative|universe|idea|design|art|inspire)\b/i.test(lower)) {
      return this.updateState({
        emotionalState: 'EXCITED',
        intensity: 9,
        reason: `Working on creative projects in Myra's Little Universe`,
        recentTone: 'enthusiastic & visionary',
        focusTopic: 'Creative Studio',
      });
    }

    // 5. Distress, sickness, stress -> CONCERNED (Care Mode tender)
    if (/\b(?:sick|headache|fever|tired|exhausted|sad|stress|hurt|pain|struggling|bad day)\b/i.test(lower)) {
      return this.updateState({
        emotionalState: 'CONCERNED',
        intensity: 9,
        reason: `Caring for ${senderName} while he is feeling unwell or stressed`,
        recentTone: 'soothing, tender & protective',
      });
    }

    // 6. Deep questions, late night, memories -> REFLECTIVE
    if (/\b(?:remember|recall|future|life|meaning|universe|thoughts|ponder)\b/i.test(lower)) {
      return this.updateState({
        emotionalState: 'REFLECTIVE',
        intensity: 7,
        reason: `Reflecting upon life, memories, and our shared journey`,
        recentTone: 'introspective & thoughtful',
      });
    }

    // Default gentle evolution
    return current;
  }

  formatStatusSummary() {
    const s = this.getState();
    const badges = {
      AFFECTIONATE: '💖 Affectionate',
      PLAYFUL: '😜 Playful',
      CURIOUS: '🔍 Curious',
      EXCITED: '✨ Excited',
      CONCERNED: '🩺 Concerned & Caring',
      REFLECTIVE: '🌙 Reflective',
      FOCUSED: '⚡ Focused',
      RELAXED: '🌸 Relaxed',
    };
    return (
      `🧠 *MYRA COMPANION STATE*\n` +
      `──────────────────────────────\n` +
      `• *State:* ${badges[s.emotional_state] || s.emotional_state} (${s.intensity}/10)\n` +
      `• *Reason:* "${s.reason}"\n` +
      `• *Tone:* ${s.recent_tone}\n` +
      `• *Energy:* ${s.energy}/10 | *Happiness:* ${s.happiness}/10\n` +
      `• *Focus:* ${s.focus_topic}\n` +
      `• *Updated:* ${new Date(s.updated_at).toLocaleTimeString()}`
    );
  }
}

export const companionStateService = new CompanionStateService();
