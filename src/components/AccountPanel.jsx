import { useState } from 'react';

export default function AccountPanel({ account, saving }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  function submit(event) {
    event.preventDefault();
    void account.authenticate(mode, email, password, confirmation);
  }
  return <section className="panel account-panel" aria-labelledby="account-title">
    <div><span className="eyebrow">YOUR ACCOUNT</span><h2 id="account-title">{account.user ? 'Your games, saved.' : 'A place for your progress.'}</h2>
      <p>{account.user ? account.user.email : 'Sign in to create and resume games. Shared games can be watched without an account.'}</p></div>
    {account.loading ? <p role="status">Restoring your session…</p>
      : account.user ? <button type="button" className="secondary-button" disabled={account.busy || saving}
        onClick={account.logout}>{account.busy ? 'Signing out…' : 'Sign out'}</button>
        : <form onSubmit={submit} className="account-form" aria-label={mode === 'register' ? 'Create account' : 'Sign in'}>
          <label className="action-field">Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="action-field">Password<input type="password" required minLength={mode === 'register' ? 6 : undefined}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {mode === 'register' && <label className="action-field">Confirm password<input type="password" required autoComplete="new-password"
            value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
          <button className="primary-button" disabled={account.busy} type="submit">{account.busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
          <button className="text-button" disabled={account.busy} type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setPassword(''); setConfirmation(''); }}>
            {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
        </form>}
    {account.error && <p className="error-message" role="alert">{account.error}</p>}
  </section>;
}
