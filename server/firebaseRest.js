import process from 'node:process';

export class CommentaryError extends Error {
  constructor(code, status = 503, retryAfter = 0) { super(code); this.code = code; this.status = status; this.retryAfter = retryAfter; }
}
function encode(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isSafeInteger(value)) return { integerValue: String(value) };
  throw new CommentaryError('invalid-storage-value');
}
function decode(document) {
  if (!document) return null;
  return { data: Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) =>
    [key, value.stringValue ?? value.booleanValue ?? Number(value.integerValue)])), updateTime: document.updateTime };
}

// REST calls use Firebase ID tokens and therefore still obey Firestore rules.
// No Admin SDK, service-account credential or billing upgrade is required.
export function createFirebaseRest(env = process.env, fetcher = fetch) {
  const project = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID;
  const apiKey = env.FIREBASE_WEB_API_KEY || env.VITE_FIREBASE_API_KEY;
  const emulator = env.COMMENTARY_USE_EMULATORS === 'true';
  if (!/^[a-z0-9-]{5,60}$/.test(project ?? '') || !apiKey || (emulator && project !== 'demo-uct-inf4001n')) throw new CommentaryError('setup-required');
  const authBase = emulator ? 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1' : 'https://identitytoolkit.googleapis.com/v1';
  const base = `${emulator ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com'}/v1/projects/${project}/databases/(default)/documents`;
  const resource = (path) => `projects/${project}/databases/(default)/documents/${path}`;
  let cachedWriter = null;
  let signingIn = null;
  async function request(url, options) {
    let response;
    try { response = await fetcher(url, { ...options, signal: AbortSignal.timeout(6000) }); }
    catch { throw new CommentaryError('storage-unavailable'); }
    if (!response.ok) throw new CommentaryError(response.status === 404 ? 'not-found' : response.status === 403 ? 'access-denied' : response.status === 409 || response.status === 400 ? 'storage-conflict' : 'storage-unavailable', response.status === 403 ? 403 : 503);
    return response.json();
  }
  async function authenticate(idToken) {
    let result;
    try { result = await request(`${authBase}/accounts:lookup?key=${encodeURIComponent(apiKey)}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }); }
    catch { throw new CommentaryError('sign-in-required', 401); }
    const user = result.users?.[0];
    if (!user || user.disabled || !/^[A-Za-z0-9_-]{1,128}$/.test(user.localId)) throw new CommentaryError('sign-in-required', 401);
    return user.localId;
  }
  async function writerToken() {
    if (cachedWriter && cachedWriter.expires > Date.now()) return cachedWriter.token;
    if (!signingIn) signingIn = (async () => {
      if (!env.COMMENTARY_WRITER_EMAIL || !env.COMMENTARY_WRITER_PASSWORD || !env.COMMENTARY_WRITER_UID) throw new CommentaryError('setup-required');
      let result;
      try { result = await request(`${authBase}/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          email: env.COMMENTARY_WRITER_EMAIL, password: env.COMMENTARY_WRITER_PASSWORD, returnSecureToken: true,
        }),
      }); } catch { throw new CommentaryError('setup-required'); }
      if (result.localId !== env.COMMENTARY_WRITER_UID || !result.idToken) throw new CommentaryError('setup-required');
      cachedWriter = { token: result.idToken, expires: Date.now() + 50 * 60_000 };
      return cachedWriter.token;
    })().finally(() => { signingIn = null; });
    return signingIn;
  }
  async function get(path, token) {
    try { return decode(await request(`${base}/${path}`, { headers: { Authorization: `Bearer ${token}` } })); }
    catch (error) { if (error.code === 'not-found') return null; throw error; }
  }
  async function commit(writes, token) {
    return request(`${base}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: writes.map(({ path, data, previous }) => ({
        update: { name: resource(path), fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)])) },
        currentDocument: previous ? { updateTime: previous.updateTime } : { exists: false },
      })) }),
    });
  }
  return { authenticate, writerToken, get, commit };
}
