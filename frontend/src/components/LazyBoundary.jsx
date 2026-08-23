import { lazy, Suspense, useMemo, useState } from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';

export default function LazyBoundary({
  children,
  errorFallback,
  loader,
  loadingFallback = null,
}) {
  const [attempt, setAttempt] = useState(0);
  const LazyComponent = useMemo(() => lazy(loader), [loader, attempt]);

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => errorFallback({
        error,
        retry: () => {
          setAttempt((currentAttempt) => currentAttempt + 1);
          resetErrorBoundary();
        },
      })}
    >
      <Suspense fallback={loadingFallback}>
        {children(LazyComponent)}
      </Suspense>
    </ErrorBoundary>
  );
}
