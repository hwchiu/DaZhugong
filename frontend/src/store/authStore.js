import { create } from 'zustand';
import { auth, db } from '../firebase.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

const SAFE_AUTH_ERROR_MESSAGE = 'Unable to verify your account access right now.';

let authObserverUnsubscribe = null;
let authObserverGeneration = 0;
let authObserverActive = false;

function isCurrentAuthObserverGeneration(generation) {
  return authObserverActive && generation === authObserverGeneration;
}

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

async function reconcileSignedInUser(user, generation) {
  const membershipQuery = query(getMemberCollection(), where('authUid', '==', user.uid), limit(2));
  const snapshot = await getDocs(membershipQuery);
  if (!isCurrentAuthObserverGeneration(generation)) {
    return;
  }

  const matches = snapshot?.docs ?? [];

  if (matches.length !== 1) {
    if (!isCurrentAuthObserverGeneration(generation)) {
      return;
    }

    await signOutSafely();
    if (!isCurrentAuthObserverGeneration(generation)) {
      return;
    }

    setSignedOutState(SAFE_AUTH_ERROR_MESSAGE);
    return;
  }

  const memberDoc = matches[0];
  if (!isCurrentAuthObserverGeneration(generation)) {
    return;
  }

  setSignedInState({
    firebaseUser: user,
    currentMember: {
      id: memberDoc.id,
      ...(typeof memberDoc.data === 'function' ? memberDoc.data() : {}),
    },
  });
}

async function handleAuthStateChange(user, generation) {
  if (!isCurrentAuthObserverGeneration(generation)) {
    return;
  }

  if (!user) {
    setSignedOutState(null);
    return;
  }

  try {
    await reconcileSignedInUser(user, generation);
  } catch {
    if (!isCurrentAuthObserverGeneration(generation)) {
      return;
    }

    await signOutSafely();
    if (!isCurrentAuthObserverGeneration(generation)) {
      return;
    }

    setSignedOutState(SAFE_AUTH_ERROR_MESSAGE);
  }
}

function stopAuthObserver() {
  if (!authObserverUnsubscribe) {
    return;
  }

  authObserverGeneration += 1;
  authObserverActive = false;
  const unsubscribe = authObserverUnsubscribe;
  authObserverUnsubscribe = null;
  unsubscribe();
}

export function startAuthObserver() {
  if (authObserverUnsubscribe) {
    return stopAuthObserver;
  }

  authObserverActive = true;
  authObserverUnsubscribe = onAuthStateChanged(auth, (user) => {
    const generation = ++authObserverGeneration;
    void handleAuthStateChange(user, generation);
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
