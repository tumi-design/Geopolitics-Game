// Explicit opt-in smoke test: never log environment variables or SDK errors.
import process from 'node:process';
import { generateCommentary, COMMENTARY_MODEL } from '../server/geminiCommentary.js';
try { process.loadEnvFile('.env.local'); } catch { /* deployed environments already supply variables */ }
const facts = { eventId: 1, round: 1, attacker: 'South Africa', defender: 'Algeria', outcome: 'stopped',
  phase: { attackerRolls: [1, 4], defenderRolls: [2, 3], attackerLosses: 1, defenderLosses: 1, attackingSoldiers: 9, defendingSoldiers: 1 },
  remainingAttackers: 9, remainingDefenders: 1, conquestReward: 0, occupationSoldiers: 0 };
try {
  const result = await generateCommentary(facts);
  console.log(`Real Gemini request succeeded (${COMMENTARY_MODEL}). Synthetic development battle, not a saved game:`);
  console.log(result.text);
} catch (error) {
  const detail = ['structure', 'fact-placeholder', 'fact-sentence', 'unsupported-claim', 'length'].includes(error.reason) ? `/${error.reason}` : '';
  const reason = ['not-configured', 'invalid-generation'].includes(error.message) ? `${error.message}${detail}` : 'provider-request-failed';
  console.error(`Gemini smoke test did not succeed. Reason: ${reason}. Status: ${Number(error.status) || 'unavailable'}. Check model access, free-tier quota and server configuration. No credentials or provider error details were logged.`);
  process.exitCode = 1;
}
