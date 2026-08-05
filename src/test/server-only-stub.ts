/**
 * Stand-in for the `server-only` package, used by Vitest alone.
 *
 * The real package throws when imported outside a React Server Component, which
 * is exactly what makes it useful in a build and useless in a test runner. See
 * the alias in `vitest.config.ts`.
 *
 * Deliberately empty. Importing it must have no effect.
 */
export {};
