import { useEffect } from 'react';
import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Router-level error boundary.
 *
 * Special-cases the "Failed to fetch dynamically imported module" error,
 * which happens right after a new frontend deploy when the user's browser
 * has a stale index.html referencing asset filenames that no longer exist
 * in S3. In that case we silently reload the page so they get the fresh
 * index.html and matching chunks.
 *
 * For every other error, renders a friendly error screen with Retry / Home
 * actions instead of React Router's raw "Hey developer" message.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : isRouteErrorResponse(error)
          ? `${error.status} ${error.statusText}`
          : 'An unexpected error occurred.';

  const isChunkLoadError =
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
      error.message,
    );

  // Auto-reload once on stale-chunk errors. We use sessionStorage to prevent
  // infinite reload loops if the error is actually something else.
  useEffect(() => {
    if (!isChunkLoadError) return;
    const RELOAD_KEY = 'chunk-reload-attempted';
    if (sessionStorage.getItem(RELOAD_KEY)) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    window.location.reload();
  }, [isChunkLoadError]);

  // Clear the reload flag on successful mounts from a different cause
  useEffect(() => {
    if (!isChunkLoadError) {
      sessionStorage.removeItem('chunk-reload-attempted');
    }
  }, [isChunkLoadError]);

  const is404 = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="flex max-w-lg flex-col items-center text-center">
        <div className="mb-6 rounded-full bg-amber-500/10 p-4">
          <AlertTriangle className="size-10 text-amber-600" />
        </div>

        <h1 className="text-2xl font-bold text-foreground">
          {is404 ? 'Page not found' : isChunkLoadError ? 'Refreshing…' : 'Something went wrong'}
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {is404
            ? "That page doesn't exist or you don't have access to it."
            : isChunkLoadError
              ? 'A newer version of the app is available. Reloading now…'
              : 'The page failed to load. Try refreshing, or go back to the dashboard.'}
        </p>

        {!isChunkLoadError && (
          <details className="mt-4 w-full rounded-lg border border-border/40 bg-muted/30 p-3 text-left">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Technical details
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">
              {errorMessage}
            </pre>
          </details>
        )}

        {!isChunkLoadError && (
          <div className="mt-6 flex gap-3">
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="size-4" />
              Reload
            </Button>
            <Button onClick={() => navigate('/')}>
              <Home className="size-4" />
              Go to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
