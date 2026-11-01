import process from 'node:process';
import { GoogleGenAI } from '@google/genai';
import { factsHash } from './commentaryFacts.js';

export const COMMENTARY_MODEL = 'gemini-3.5-flash-lite';
const instructions = `You narrate a fictional UCT strategy game, never real warfare.
Write one or two short, engaging, restrained sentences (at most 55 words) about ONLY the supplied battle.
The facts are authoritative. Do not invent casualties, locations, alliances, geography-based restrictions or future results.
Discuss possible strategic significance cautiously using may/could, not predictions presented as facts.
Use {attacker} and {defender} placeholders for country names, and no other placeholders.
The interface already displays the exact outcome, dice, casualties and remaining armies. Do not repeat numbers, numeric words or casualty claims. Interpret what those supplied facts could mean strategically instead.
Mention conquest only if outcome is conquered, elimination only if defenderEliminated is true, and overall victory only if gameWon is true.
For a stopped or failed attack, discuss preserving/rebuilding pressure rather than pretending a country changed ownership.
Do not infer why a player stopped; do not describe a voluntary stop as a defeat, failed assault or stalemate. Do not mention borders, frontiers, neighbours or adjacency: this game's geography never limits attacks.
Return JSON with factsHash copied exactly and commentary containing original prose. No markdown or links.`;

export function validateGeneratedCommentary(value, facts) {
  const rejected = (reason) => Object.assign(new Error('invalid-generation'), { reason });
  if (!value || value.factsHash !== factsHash(facts) || typeof value.commentary !== 'string') throw rejected('structure');
  // Accept exact trusted names as well as the requested placeholders.
  const template = value.commentary.trim().replaceAll(facts.attacker, '{attacker}').replaceAll(facts.defender, '{defender}');
  const substitutions = { attacker: facts.attacker, defender: facts.defender };
  const prose = template.replace(/\{([A-Za-z]+)\}/g, (token, key) => {
    if (!(key in substitutions)) throw rejected('fact-placeholder');
    return '';
  });
  if (!template.includes('{attacker}') || !template.includes('{defender}') || template.length > 500 || template.split(/\s+/).length > 60 ||
      /[{}\d<>]|https?:|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|billion)\b/i.test(prose) ||
      (facts.outcome !== 'conquered' && /\b(conquer\w*|captur\w*|occup\w*)\b/i.test(prose)) ||
      (!facts.gameWon && /\b(victor\w*|wins?|won)\b/i.test(prose)) ||
      (!facts.defenderEliminated && /\b(eliminat\w*)\b/i.test(prose)) ||
      /\b(casualt\w*|killed|dead|deaths|lost|losses|destroyed)\b/i.test(prose) ||
      /\b(border\w*|frontier\w*|neighbou?r\w*|adjacen\w*)\b/i.test(prose) ||
      (facts.outcome === 'stopped' && /\b(defeat\w*|failed|repelled|stalemate)\b/i.test(prose)) ||
      prose.replace(/[^A-Za-z]/g, '').length < 15) throw rejected('unsupported-claim');
  const text = template.replace(/\{([A-Za-z]+)\}/g, (_, key) => substitutions[key]);
  if (text.length > 900) throw rejected('length');
  return text;
}

export async function generateCommentary(facts, { client, apiKey = process.env.GEMINI_API_KEY } = {}) {
  if (!client && !apiKey) throw new Error('not-configured');
  const ai = client ?? new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: COMMENTARY_MODEL,
    contents: JSON.stringify({ factsHash: factsHash(facts), facts }),
    config: { systemInstruction: instructions, temperature: 0.3, maxOutputTokens: 500,
      httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } },
      responseMimeType: 'application/json', responseJsonSchema: {
        type: 'object', properties: { factsHash: { type: 'string', enum: [factsHash(facts)] }, commentary: { type: 'string' } },
        required: ['factsHash', 'commentary'], additionalProperties: false,
      } },
  });
  return { text: validateGeneratedCommentary(JSON.parse(response.text), facts), model: COMMENTARY_MODEL, factsHash: factsHash(facts) };
}
