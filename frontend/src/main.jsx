import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initializeFirebase } from './firebase.js';
import { startAuthObserver } from './store/authStore.js';
import './index.css';

const ROOT_INSTANCE_KEY = '__dazhugongReactRoot';

function StartupConfigurationError() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12 text-slate-800">
      <section className="w-full max-w-md rounded-3xl bg-white px-8 py-10 text-center shadow-lg shadow-rose-100">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-rose-400">Configuration error</p>
        <h1 className="mt-4 text-3xl font-bold text-rose-500">Unable to start the app</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Check the required Firebase settings, then reload the page.
        </p>
      </section>
    </main>
  );
}

export function getSafeFirebaseStartupMessage(error) {
  const message = error instanceof Error ? error.message : 'Firebase initialization failed';
  const safeMessage = message.split(':', 1)[0]?.trim();

  return safeMessage ? `${safeMessage.replace(/\.+$/, '')}.` : 'Firebase initialization failed.';
}

let currentApplicationCleanup = null;

function getOrCreateRoot(rootElement, createRootImpl) {
  if (!rootElement[ROOT_INSTANCE_KEY]) {
    rootElement[ROOT_INSTANCE_KEY] = createRootImpl(rootElement);
  }

  return rootElement[ROOT_INSTANCE_KEY];
}

function registerApplicationCleanup({ stopAuthObserver, addWindowListener, removeWindowListener, hot }) {
  let cleanedUp = false;

  const handleWindowExit = () => {
    cleanup();
  };

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    removeWindowListener?.('beforeunload', handleWindowExit);

    if (typeof stopAuthObserver === 'function') {
      stopAuthObserver();
    }
  };

  addWindowListener?.('beforeunload', handleWindowExit);
  hot?.dispose?.(cleanup);

  return cleanup;
}

export async function startApplication({
  initializeFirebaseImpl = initializeFirebase,
  startAuthObserverImpl = startAuthObserver,
  rootElement = document.getElementById('root'),
  createRootImpl = (element) => ReactDOM.createRoot(element),
  addWindowListener = globalThis.window?.addEventListener?.bind(globalThis.window),
  removeWindowListener = globalThis.window?.removeEventListener?.bind(globalThis.window),
  hot = import.meta.hot,
  logger = console.error,
} = {}) {
  currentApplicationCleanup?.();
  currentApplicationCleanup = null;

  try {
    await initializeFirebaseImpl();
    const stopAuthObserver = startAuthObserverImpl();
    const cleanup = registerApplicationCleanup({
      stopAuthObserver,
      addWindowListener,
      removeWindowListener,
      hot,
    });

    currentApplicationCleanup = cleanup;
    getOrCreateRoot(rootElement, createRootImpl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    return cleanup;
  } catch (error) {
    logger('Firebase initialization failed:', getSafeFirebaseStartupMessage(error));
    getOrCreateRoot(rootElement, createRootImpl).render(
      <React.StrictMode>
        <StartupConfigurationError />
      </React.StrictMode>,
    );
  }
}

if (import.meta.env.MODE !== 'test') {
  void startApplication();
}
