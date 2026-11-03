export function validateCredentials(email, password, confirmation) {
  const cleanEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error('Enter a valid email address.');
  if (!password) throw new Error('Enter your password.');
  if (confirmation !== undefined) {
    if (password.length < 6) throw new Error('Use a password with at least six characters.');
    if (password !== confirmation) throw new Error('The passwords do not match.');
  }
  return cleanEmail;
}
export function firebaseErrorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/user-not-found': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'An account already uses this email. Please sign in.',
    'auth/weak-password': 'Choose a stronger password (at least six characters).',
    'auth/password-does-not-meet-requirements': 'This password does not meet the password policy configured for this project. Choose a stronger password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Contact the project administrator.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/network-request-failed': 'Unable to connect. Check your connection and try again.',
    'auth/operation-not-allowed': 'Enable Email/Password sign-in in Firebase Authentication.',
    'auth/unauthorized-domain': 'Add this hostname to Firebase Authentication → Settings → Authorized domains.',
    'permission-denied': 'Access denied. This game is private or sharing has been disabled.',
    'unavailable': 'Firestore is unavailable or offline. Reconnect and retry the same save.',
    'resource-exhausted': 'Firebase quota has been reached. Check Firestore Usage in the Firebase Console.',
    'conflict': 'This game changed in another tab. Reload the saved position before continuing.',
  };
  return messages[error.code] ?? error.message ?? 'The request failed. Please try again.';
}
