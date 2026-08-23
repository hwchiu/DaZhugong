import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { initializeFirebase } from './firebase.js';
import './index.css';

function StartupConfigurationError() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12 text-slate-800">
      <section className="w-full max-w-md rounded-3xl bg-white px-8 py-10 text-center shadow-lg shadow-rose-100">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-rose-400">Configuration error</p>
        <h1 className="mt-4 text-3xl font-bold text-rose-500">Unable to start the app</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Check the required Firebase and App Check settings, then reload the page.
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

export async function startApplication({
  initializeFirebaseImpl = initializeFirebase,
  rootElement = document.getElementById('root'),
  createRootImpl = (element) => ReactDOM.createRoot(element),
  logger = console.error,
} = {}) {
  try {
    await initializeFirebaseImpl();
    createRootImpl(rootElement).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  } catch (error) {
    logger('Firebase initialization failed:', getSafeFirebaseStartupMessage(error));
    createRootImpl(rootElement).render(
      <React.StrictMode>
        <StartupConfigurationError />
      </React.StrictMode>,
    );
  }
}

if (import.meta.env.MODE !== 'test') {
  void startApplication();
}
