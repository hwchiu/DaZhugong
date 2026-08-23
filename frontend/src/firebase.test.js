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

const firebaseAppCheckMock = vi.hoisted(() => ({
  initializeAppCheck: vi.fn((app, options) => ({
    service: 'app-check',
    app,
    options,
    debugTokenAtInit: globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN,
  })),
  ReCaptchaEnterpriseProvider: vi.fn(function MockReCaptchaEnterpriseProvider(siteKey) {
    this.siteKey = siteKey;
  }),
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

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: firebaseAppCheckMock.initializeAppCheck,
  ReCaptchaEnterpriseProvider: firebaseAppCheckMock.ReCaptchaEnterpriseProvider,
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
  firebaseAppCheckMock.initializeAppCheck.mockClear();
  firebaseAppCheckMock.ReCaptchaEnterpriseProvider.mockClear();
  delete globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN;
});

describe('firebase configuration helpers', () => {
  it('reports missing required Firebase environment variables', async () => {
    const { validateFirebaseConfig } = await loadFirebaseModule();

    expect(() => validateFirebaseConfig({ VITE_FIREBASE_API_KEY: 'api-key' })).toThrow(
      /VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID/,
    );
  });

  it('returns empty services outside production when Firebase config is absent', async () => {
    const { initializeFirebaseServices } = await loadFirebaseModule();

    const services = initializeFirebaseServices({ MODE: 'development' }, makeBrowserRuntime());

    expect(services).toMatchObject({
      app: null,
      auth: null,
      db: null,
      functions: null,
      appCheck: null,
    });
    expect(firebaseAppMock.initializeApp).not.toHaveBeenCalled();
  });

  it('fails clearly in production when the App Check site key is absent', async () => {
    const { initializeFirebaseServices } = await loadFirebaseModule();

    expect(() =>
      initializeFirebaseServices(
        makeFirebaseEnv({ MODE: 'production', VITE_FIREBASE_APPCHECK_SITE_KEY: '' }),
        makeBrowserRuntime(),
      ),
    ).toThrow(/VITE_FIREBASE_APPCHECK_SITE_KEY/);
    expect(firebaseAppCheckMock.initializeAppCheck).not.toHaveBeenCalled();
  });

  it('skips App Check in development when the site key is absent', async () => {
    const { initializeFirebaseServices } = await loadFirebaseModule();

    const services = initializeFirebaseServices(makeFirebaseEnv(), makeBrowserRuntime());

    expect(services.app?.name).toBe('mock-app');
    expect(services.auth?.service).toBe('auth');
    expect(services.db?.service).toBe('firestore');
    expect(services.functions?.region).toBe('asia-east1');
    expect(services.appCheck).toBeNull();
    expect(firebaseAppCheckMock.initializeAppCheck).not.toHaveBeenCalled();
  });

  it('normalizes App Check debug tokens', async () => {
    const { normalizeAppCheckDebugToken } = await loadFirebaseModule();

    expect(normalizeAppCheckDebugToken()).toBeUndefined();
    expect(normalizeAppCheckDebugToken('   ')).toBeUndefined();
    expect(normalizeAppCheckDebugToken(' true ')).toBe(true);
    expect(normalizeAppCheckDebugToken(' debug-token ')).toBe('debug-token');
  });

  it('sets the development App Check debug token before initialization', async () => {
    const { initializeFirebaseServices } = await loadFirebaseModule();

    const services = initializeFirebaseServices(
      makeFirebaseEnv({
        VITE_FIREBASE_APPCHECK_SITE_KEY: 'site-key',
        VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: ' true ',
      }),
      makeBrowserRuntime(),
    );

    expect(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN).toBe(true);
    expect(services.appCheck?.debugTokenAtInit).toBe(true);
    expect(firebaseAppCheckMock.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key');
    expect(firebaseAppCheckMock.initializeAppCheck).toHaveBeenCalledTimes(1);
  });

  it('never enables the App Check debug token in production', async () => {
    const { initializeFirebaseServices } = await loadFirebaseModule();

    const services = initializeFirebaseServices(
      makeFirebaseEnv({
        MODE: 'production',
        VITE_FIREBASE_APPCHECK_SITE_KEY: 'site-key',
        VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: 'true',
      }),
      makeBrowserRuntime(),
    );

    expect(globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN).toBeUndefined();
    expect(services.appCheck?.debugTokenAtInit).toBeUndefined();
  });
});
