import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseAppMock = vi.hoisted(() => {
  const state = { apps: [] };

  return {
    state,
    initializeApp: vi.fn((config) => ({ name: 'mock-app', config })),
    getApps: vi.fn(() => state.apps),
    getApp: vi.fn(() => state.apps[0] ?? { name: 'existing-app' }),
  };
});

const firebaseAuthMock = vi.hoisted(() => ({
  getAuth: vi.fn((app) => ({ service: 'auth', app })),
}));

const firebaseFirestoreMock = vi.hoisted(() => ({
  getFirestore: vi.fn((app) => ({ service: 'firestore', app })),
}));

const firebaseFunctionsMock = vi.hoisted(() => ({
  getFunctions: vi.fn((app, region) => ({ service: 'functions', app, region })),
}));

vi.mock('firebase/app', () => ({
  initializeApp: firebaseAppMock.initializeApp,
  getApps: firebaseAppMock.getApps,
  getApp: firebaseAppMock.getApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: firebaseAuthMock.getAuth,
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: firebaseFirestoreMock.getFirestore,
}));

vi.mock('firebase/functions', () => ({
  getFunctions: firebaseFunctionsMock.getFunctions,
}));

function makeFirebaseEnv(overrides = {}) {
  return {
    MODE: 'development',
    VITE_FIREBASE_API_KEY: 'api-key',
    VITE_FIREBASE_AUTH_DOMAIN: 'demo.firebaseapp.com',
    VITE_FIREBASE_PROJECT_ID: 'demo-project',
    VITE_FIREBASE_STORAGE_BUCKET: 'demo.firebasestorage.app',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '1234567890',
    VITE_FIREBASE_APP_ID: '1:1234567890:web:abcdef123456',
    ...overrides,
  };
}

function makeBrowserRuntime() {
  return {
    window: {},
    document: {},
  };
}

async function loadFirebaseModule() {
  vi.resetModules();
  return import('./firebase.js');
}

beforeEach(() => {
  firebaseAppMock.state.apps = [];
  firebaseAppMock.initializeApp.mockClear();
  firebaseAppMock.getApps.mockClear();
  firebaseAppMock.getApp.mockClear();
  firebaseAuthMock.getAuth.mockClear();
  firebaseFirestoreMock.getFirestore.mockClear();
  firebaseFunctionsMock.getFunctions.mockClear();
});

describe('firebase configuration helpers', () => {
  it('reports missing required Firebase environment variables', async () => {
    const { validateFirebaseConfig } = await loadFirebaseModule();

    expect(() => validateFirebaseConfig({ VITE_FIREBASE_API_KEY: 'api-key' })).toThrow(
      /VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID/,
    );
  });

  it('fails outside production when Firebase config is absent', async () => {
    const { initializeFirebase } = await loadFirebaseModule();

    await expect(initializeFirebase({ MODE: 'development' }, makeBrowserRuntime())).rejects.toThrow(
      /Missing required Firebase environment variables/,
    );
    expect(firebaseAppMock.initializeApp).not.toHaveBeenCalled();
  });

  it('initializes Firebase and updates exported services when required config is present', async () => {
    const firebaseModule = await loadFirebaseModule();

    const services = await firebaseModule.initializeFirebase(makeFirebaseEnv(), makeBrowserRuntime());

    expect(services).toEqual({
      app: services.app,
      auth: services.auth,
      db: services.db,
      functions: services.functions,
    });
    expect(services).not.toHaveProperty('appCheck');
    expect(firebaseModule.firebaseApp).toBe(services.app);
    expect(firebaseModule.auth).toBe(services.auth);
    expect(firebaseModule.db).toBe(services.db);
    expect(firebaseModule.functions).toBe(services.functions);
    expect(firebaseFunctionsMock.getFunctions).toHaveBeenCalledWith(services.app, 'asia-east1');
  });
});
