import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { firebaseApp } from './firebase';

export const firebaseAuth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

if (firebaseAuth) {
  void setPersistence(firebaseAuth, browserLocalPersistence);
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

export function subscribeAuth(listener: (user: User | null) => void): () => void {
  if (!firebaseAuth) {
    listener(null);
    return () => undefined;
  }
  return onAuthStateChanged(firebaseAuth, listener);
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = firebaseAuth?.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken(forceRefresh);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  if (!firebaseAuth) {
    throw new Error('Kimlik doğrulama yapılandırılmadı.');
  }
  try {
    await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
  } catch (error) {
    throw new Error(mapFirebaseAuthError(error));
  }
}

export async function signOutUser(): Promise<void> {
  if (firebaseAuth) {
    await signOut(firebaseAuth);
  }
}

export function mapFirebaseAuthError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Geçerli bir e-posta adresi girin.';
    case 'auth/user-disabled':
      return 'Bu hesap devre dışı bırakılmış.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'E-posta veya şifre hatalı.';
    case 'auth/too-many-requests':
      return 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.';
    case 'auth/network-request-failed':
      return 'Bağlantı kurulamadı. İnterneti kontrol edip tekrar deneyin.';
    case 'auth/operation-not-allowed':
      return 'E-posta ile giriş bu projede açık değil.';
    default:
      return 'Giriş yapılamadı. Bilgilerinizi kontrol edin.';
  }
}
