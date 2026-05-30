import {
  initializeAuth,
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as _signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User,
} from 'firebase/auth';
import { app } from './config';

function createAuth() {
  try {
    // getReactNativePersistence isn't surfaced by Firebase v11 TypeScript types in all
    // monorepo configurations, so we require() it at runtime to keep type-check clean.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { getReactNativePersistence } = require('firebase/auth') as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Fast refresh — auth already initialized, return existing instance.
    return getAuth(app);
  }
}

export const auth = createAuth();

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signUp(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOut(): Promise<void> {
  await _signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// Re-authenticates with password then permanently deletes the current user.
// Throws if password is wrong or no user is signed in.
export async function deleteCurrentUser(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('auth/no-current-user');
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  await deleteUser(user);
}

// Verify the user's password without deleting anything.
// Throws auth/wrong-password / auth/invalid-credential if wrong.
export async function reauthenticate(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('auth/no-current-user');
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
}

// Delete the currently-signed-in auth account.
// Call reauthenticate() first, then deleteAllUserData(), then this.
export async function deleteAuthUser(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('auth/no-current-user');
  await deleteUser(user);
}

// Returns unsubscribe function — call it in useEffect cleanup.
export function subscribeToAuthState(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser(): User | null {
  return auth.currentUser;
}
