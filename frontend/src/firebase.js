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

function createEmptyFirebaseServices() {
  return {
    app: null,
    auth: null,
    db: null,
    functions: null,
    appCheck: null,
  };
}

export function initializeFirebaseServices(env = import.meta.env, runtime = globalThis) {
  const production = isProductionEnvironment(env);
  const missingConfig = getMissingFirebaseConfigFields(env);

  if (missingConfig.length > 0) {
    if (production) {
      throw new Error(`Missing required Firebase environment variables: ${missingConfig.join(', ')}`);
    }

    return createEmptyFirebaseServices();
  }

  const config = validateFirebaseConfig(env);
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const functions = getFunctions(app, 'asia-east1');
  const siteKey = readEnvValue(env, 'VITE_FIREBASE_APPCHECK_SITE_KEY');

  if (production && !siteKey) {
    throw new Error('Missing required Firebase App Check site key: VITE_FIREBASE_APPCHECK_SITE_KEY');
  }

  let appCheck = null;

  if (siteKey && isBrowserRuntime(runtime)) {
    if (!production) {
      const debugToken = normalizeAppCheckDebugToken(env?.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);

      if (debugToken !== undefined) {
        globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
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

const firebaseServices = initializeFirebaseServices();

export const firebaseApp = firebaseServices.app;
export const auth = firebaseServices.auth;
export const db = firebaseServices.db;
export const functions = firebaseServices.functions;
export const appCheck = firebaseServices.appCheck;
