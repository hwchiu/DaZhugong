import { create } from 'zustand';
import { auth, db } from '../firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

const SAFE_AUTH_ERROR_MESSAGE = 'Unable to verify your account access right now.';

let authObserverUnsubscribe = null;

function getMemberCollection() {
  return collection(db, 'groups', 'main', 'members');
}

function setSignedOutState(authError = null) {
  useAuthStore.setState({
    authReady: true,
    firebaseUser: null,
    currentMember: null,
    authError,
  });
}

function setSignedInState({ firebaseUser, currentMember }) {
  useAuthStore.setState({
    authReady: true,
    firebaseUser,
    currentMember,
    authError: null,
  });
}

async function signOutSafely() {
  try {
    await logout();
  } catch {
    // Intentionally ignored: invalid membership states should still clear local auth state.
  }
}

async function reconcileSignedInUser(user) {
  const membershipQuery = query(getMemberCollection(), where('authUid', '==', user.uid), limit(2));
  const snapshot = await getDocs(membershipQuery);
  const matches = snapshot?.docs ?? [];

  if (matches.length !== 1) {
    await signOutSafely();
    setSignedOutState(SAFE_AUTH_ERROR_MESSAGE);
    return;
  }

  const memberDoc = matches[0];
  setSignedInState({
    firebaseUser: user,
    currentMember: {
      id: memberDoc.id,
      ...(typeof memberDoc.data === 'function' ? memberDoc.data() : {}),
    },
  });
}

async function handleAuthStateChange(user) {
  if (!user) {
    setSignedOutState(null);
    return;
  }

  try {
    await reconcileSignedInUser(user);
  } catch {
    await signOutSafely();
    setSignedOutState(SAFE_AUTH_ERROR_MESSAGE);
  }
}

function stopAuthObserver() {
  if (!authObserverUnsubscribe) {
    return;
  }

  const unsubscribe = authObserverUnsubscribe;
  authObserverUnsubscribe = null;
  unsubscribe();
}

export function startAuthObserver() {
  if (authObserverUnsubscribe) {
    return stopAuthObserver;
  }

  authObserverUnsubscribe = onAuthStateChanged(auth, (user) => {
    void handleAuthStateChange(user);
  });

  return stopAuthObserver;
}

export async function logout() {
  if (!auth) {
    throw new Error('Firebase auth is unavailable.');
  }

  return signOut(auth);
}

export const useAuthStore = create(() => ({
  authReady: false,
  firebaseUser: null,
  currentMember: null,
  groupId: 'main',
  authError: null,
}));

export default useAuthStore;
