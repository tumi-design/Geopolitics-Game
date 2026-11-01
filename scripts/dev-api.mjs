import { createServer } from 'node:http';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
try { process.loadEnvFile('.env.local'); } catch { /* missing configuration returns a safe setup status */ }
if (process.env.COMMENTARY_USE_EMULATORS === 'true') {
  try {
    const settings = parseEnv(readFileSync('.env.commentary-emulator.local', 'utf8'));
    for (const key of ['FIREBASE_PROJECT_ID', 'FIREBASE_WEB_API_KEY', 'COMMENTARY_WRITER_EMAIL', 'COMMENTARY_WRITER_PASSWORD', 'COMMENTARY_WRITER_UID']) process.env[key] = settings[key] ?? '';
  } catch { console.log('Run npm.cmd run setup:commentary-emulator after starting the local emulators.'); }
}
const { default: handler } = await import('../api/battle-commentary.js');
const port = 3001;
export const localServer = createServer(async (req, res) => {
  res.status = (status) => { res.statusCode = status; return res; };
  res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
  if (req.url !== '/api/battle-commentary') return res.status(404).json({ code: 'not-found' });
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 1024) return res.status(413).json({ code: 'request-too-large' });
    }
    req.body = JSON.parse(body || '{}');
  } catch { return res.status(400).json({ code: 'invalid-request' }); }
  return handler(req, res);
}).listen(port, '127.0.0.1', () => console.log(`Local Vercel handler adapter: http://127.0.0.1:${port}/api/battle-commentary (no credentials logged)`));
