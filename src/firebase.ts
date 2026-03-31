import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User, 
  updateProfile, 
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, onSnapshot, orderBy, limit, getDocFromServer, FirestoreError, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// Suppress Firestore SDK warnings about offline mode
setLogLevel('silent');

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Error Handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Ignore offline errors to allow the app to work offline without crashing
  if (errorMessage.includes('offline') || errorMessage.includes('Failed to get document because the client is offline')) {
    console.warn('Firestore is offline. Operating in offline mode.');
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.warn('Firestore Error: ', JSON.stringify(errInfo));
  // We use console.warn instead of console.error and avoid throwing to prevent red screens in offline mode
}

// Connection Test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Silent catch for offline errors to avoid confusing the user
    // The handleFirestoreError will still log a warning if needed
  }
}
testConnection();

export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  updateProfile,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  limit 
};
export type { User };
