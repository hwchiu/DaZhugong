import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

export const REQUIRED_FIREBASE_ENV_FIELDS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
];

function readEnvValue(env, key) {
  const value = env?.[key];
  return typeof value === 'string' ? value.trim() : value;
}

export function getMissingFirebaseConfigFields(env = {}) {
  return REQUIRED_FIREBASE_ENV_FIELDS.filter((key) => !readEnvValue(env, key));
}

export function validateFirebaseConfig(env = {}) {
  const missing = getMissingFirebaseConfigFields(env);

  if (missing.length > 0) {
    throw new Error(`Missing required Firebase environment variables: ${missing.join(', ')}`);
  }

  return {
    apiKey: readEnvValue(env, 'VITE_FIREBASE_API_KEY'),
    authDomain: readEnvValue(env, 'VITE_FIREBASE_AUTH_DOMAIN'),
    projectId: readEnvValue(env, 'VITE_FIREBASE_PROJECT_ID'),
    storageBucket: readEnvValue(env, 'VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnvValue(env, 'VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnvValue(env, 'VITE_FIREBASE_APP_ID'),
    measurementId: readEnvValue(env, 'VITE_FIREBASE_MEASUREMENT_ID'),
  };
}

function initializeFirebaseServices(env = import.meta.env) {
  const config = validateFirebaseConfig(env);
  const app = getApps().length > 0 ? getApp() : initializeApp(config);

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    functions: getFunctions(app, 'asia-east1'),
  };
}

let firebaseServices;
let firebaseInitializationPromise;

export let firebaseApp;
export let auth;
export let db;
export let functions;

function assignFirebaseServices(services) {
  firebaseServices = services;
  firebaseApp = services.app;
  auth = services.auth;
  db = services.db;
  functions = services.functions;

  return services;
}

export async function initializeFirebase(env = import.meta.env) {
  if (firebaseServices) {
    return firebaseServices;
  }

  if (!firebaseInitializationPromise) {
    firebaseInitializationPromise = Promise.resolve()
      .then(() => assignFirebaseServices(initializeFirebaseServices(env)))
      .catch((error) => {
        firebaseInitializationPromise = undefined;
        throw error;
      });
  }

  return firebaseInitializationPromise;
}
