import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

// Fixed loopback URLs and demo project: this cannot provision production users.
const email = `commentary-writer-${Date.now()}@example.com`;
const password = randomBytes(24).toString('base64url');
try {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const user = await response.json();
  if (!response.ok || !user.localId) throw new Error('setup-failed');
  const configured = await fetch('http://127.0.0.1:8080/v1/projects/demo-uct-inf4001n/databases/(default)/documents/serverConfig/commentary', {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { writerUid: { stringValue: user.localId } } }),
  });
  if (!configured.ok) throw new Error('setup-failed');
  await writeFile('.env.commentary-emulator.local', [
    'FIREBASE_PROJECT_ID=demo-uct-inf4001n', 'FIREBASE_WEB_API_KEY=demo-key',
    `COMMENTARY_WRITER_EMAIL=${email}`, `COMMENTARY_WRITER_PASSWORD=${password}`, `COMMENTARY_WRITER_UID=${user.localId}`, '',
  ].join('\n'), { mode: 0o600 });
  console.log('Demo commentary writer configured. Its local-only credentials are in ignored .env.commentary-emulator.local. Your Gemini key was not copied or printed.');
} catch {
  console.error('Demo writer setup failed. Start the Auth and Firestore emulators for demo-uct-inf4001n first. No credentials were logged.');
  process.exitCode = 1;
}
