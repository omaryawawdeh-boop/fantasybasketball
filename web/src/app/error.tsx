"use client";

// Route-level error boundary: a crash in one page never blanks the whole app shell.
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-live/40 bg-live/5 p-5">
      <h1 className="font-semibold">Something went wrong on this page.</h1>
      <p className="mt-1 text-sm text-muted">{error.message || "Unexpected error."} The rest of the app still works — try another section or retry.</p>
      <button onClick={reset} className="mt-3 rounded border border-line px-3 py-1.5 text-sm hover:bg-surface-2">
        Retry
      </button>
    </div>
  );
}
