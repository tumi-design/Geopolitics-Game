import { createFirebaseRest } from '../server/firebaseRest.js';
import { createCommentaryStore } from '../server/commentaryStore.js';
import { createCommentaryHandler } from '../server/commentaryHandler.js';
import { generateCommentary } from '../server/geminiCommentary.js';

export const config = { maxDuration: 60 };
let handler;
export default async function battleCommentary(req, res) {
  try {
    if (!handler) {
      const firebase = createFirebaseRest();
      handler = createCommentaryHandler({ firebase, store: createCommentaryStore(firebase), generate: generateCommentary });
    }
    return await handler(req, res);
  } catch {
    // Never return or log SDK errors, tokens, credentials or environment values.
    return res.status(503).json({ code: 'setup-required' });
  }
}
