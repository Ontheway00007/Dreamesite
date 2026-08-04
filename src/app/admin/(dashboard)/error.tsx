"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-64 flex-col items-center justify-center space-y-4">
      <div className="text-center">
        <h2 className="text-foreground text-lg font-medium">
          Something went wrong
        </h2>
        <p className="text-foreground-muted mt-1 text-sm">
          {error.message || "An unexpected error occurred."}
        </p>
      </div>
      <button
        onClick={reset}
        className="bg-accent hover:bg-accent-strong text-foreground-inverse rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
