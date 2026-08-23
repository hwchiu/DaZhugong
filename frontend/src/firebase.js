import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';

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

export function isProductionEnvironment(env = {}) {
  return env?.PROD === true || String(env?.MODE ?? '').toLowerCase() === 'production';
}

export function isBrowserRuntime(runtime = globalThis) {
  return Boolean(runtime && runtime.window && runtime.document);
}

export function normalizeAppCheckDebugToken(value) {
  if (value === true) {
    return true;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  if (normalized.toLowerCase() === 'true') {
    return true;
  }

  return normalized;
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

export function validateAppCheckConfig(env = {}) {
  const siteKey = readEnvValue(env, 'VITE_FIREBASE_APPCHECK_SITE_KEY');

  if (!siteKey) {
    throw new Error('Missing required Firebase App Check site key: VITE_FIREBASE_APPCHECK_SITE_KEY');
  }

  if (isProductionEnvironment(env)) {
    return { siteKey };
  }

  const debugToken = normalizeAppCheckDebugToken(env?.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);

  if (debugToken === undefined) {
    throw new Error('Missing required Firebase App Check debug token: VITE_FIREBASE_APPCHECK_DEBUG_TOKEN');
  }

  return {
    siteKey,
    debugToken,
  };
}

function initializeFirebaseServices(env = import.meta.env, runtime = globalThis) {
  const config = validateFirebaseConfig(env);
  const { siteKey, debugToken } = validateAppCheckConfig(env);
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'asia-east1');

  let appCheck = null;

  if (siteKey && isBrowserRuntime(runtime)) {
    if (!isProductionEnvironment(env)) {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;

      if (runtime !== globalThis) {
        runtime.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
      }
    }

    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  return {
    app,
    auth,
    db,
    functions,
    appCheck,
  };
}

let firebaseServices;
let firebaseInitializationPromise;

export let firebaseApp;
export let auth;
export let db;
export let functions;
export let appCheck;

function assignFirebaseServices(services) {
  firebaseServices = services;
  firebaseApp = services.app;
  auth = services.auth;
  db = services.db;
  functions = services.functions;
  appCheck = services.appCheck;

  return services;
}

export async function initializeFirebase(env = import.meta.env, runtime = globalThis) {
  if (firebaseServices) {
    return firebaseServices;
  }

  if (!firebaseInitializationPromise) {
    firebaseInitializationPromise = Promise.resolve()
      .then(() => assignFirebaseServices(initializeFirebaseServices(env, runtime)))
      .catch((error) => {
        firebaseInitializationPromise = undefined;
        throw error;
      });
  }

  return firebaseInitializationPromise;
}
