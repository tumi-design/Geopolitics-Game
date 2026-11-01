import { useEffect, useState } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth, firebaseConfigurationError } from '../services/firebase.js';
import { validateCredentials, firebaseErrorMessage } from '../services/authValidation.js';

export default function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(auth));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(firebaseConfigurationError);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => { setUser(next); setLoading(false); }, (failure) => {
      setError(firebaseErrorMessage(failure)); setLoading(false);
    });
  }, []);
  async function authenticate(mode, email, password, confirmation) {
    setError(''); setBusy(true);
    try {
      if (!auth) throw new Error(firebaseConfigurationError);
      const clean = validateCredentials(email, password, mode === 'register' ? confirmation : undefined);
      await (mode === 'register' ? createUserWithEmailAndPassword(auth, clean, password)
        : signInWithEmailAndPassword(auth, clean, password));
    } catch (failure) { setError(firebaseErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await signOut(auth); } catch (failure) { setError(firebaseErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  return { user, loading, busy, error, authenticate, logout };
}
