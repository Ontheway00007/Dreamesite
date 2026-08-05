/**
 * Search term sanitisation for PostgREST filters.
 *
 * ## The problem this solves
 *
 * PostgREST's `or=` parameter is a comma-separated list of
 * `column.operator.value` triples wrapped in parentheses:
 *
 *     or=(name.ilike.%kew%,slug.ilike.%kew%)
 *
 * Interpolating a raw search term into that string lets the term change the
 * shape of the query rather than just its value. A term containing a comma
 * introduces an extra filter; a parenthesis closes the group early; a full
 * stop is read as the separator between column, operator and value. A search
 * for `a,is_published.eq.true` would append a filter nobody asked for, and a
 * search for `50%` would be read as a wildcard.
 *
 * This is filter injection. It cannot reach SQL — PostgREST parameterises
 * values before they get there — but it can widen or narrow a result set in
 * ways the caller did not intend, which on an admin listing means showing
 * rows the filters were meant to exclude.
 *
 * ## The fix
 *
 * PostgREST accepts double-quoted values, and inside those quotes the
 * structural characters lose their meaning. So:
 *
 *   1. Escape the SQL `LIKE` metacharacters (`%`, `_`, `\`) so the term
 *      matches literally and the administrator cannot accidentally — or
 *      deliberately — supply a pattern.
 *   2. Wrap the result in double quotes, escaping `"` and `\` inside them,
 *      so commas, parentheses and full stops are data rather than syntax.
 *   3. Cap the length, because an unbounded term becomes an unbounded query.
 *
 * Apostrophes need no special handling: they are not significant to
 * PostgREST's grammar, and the value never reaches SQL as text.
 */

/** Longer than any realistic property name, short enough to stay cheap. */
export const MAX_SEARCH_LENGTH = 120;

/**
 * Escapes the characters `LIKE` treats as wildcards.
 *
 * The backslash must be doubled first, otherwise the backslashes this
 * function adds would themselves be escaped on the second pass.
 */
function escapeLikeWildcards(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/** Escapes what PostgREST's double-quoted string syntax reserves. */
function escapeQuotedValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Normalises a raw search term.
 *
 * Returns `null` when there is nothing to search for, so callers can skip
 * adding a filter entirely rather than searching for an empty string.
 */
export function normaliseSearchTerm(raw: string | undefined | null): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  // Collapse runs of whitespace — including the newlines a paste can carry —
  // so "two   words" and "two words" behave identically.
  const collapsed = raw.replace(/\s+/g, " ").trim();

  if (collapsed === "") {
    return null;
  }

  return collapsed.slice(0, MAX_SEARCH_LENGTH);
}

/**
 * Builds a safe PostgREST `or=` expression for a case-insensitive
 * "contains" search across several columns.
 *
 * Returns `null` when the term is empty, which the caller should treat as
 * "apply no search filter".
 *
 * @example
 * buildSearchFilter("O'Brien, 50%", ["name", "slug"])
 * // => 'name.ilike."%O\'Brien, 50\\%%",slug.ilike."%O\'Brien, 50\\%%"'
 */
export function buildSearchFilter(
  raw: string | undefined | null,
  columns: readonly string[],
): string | null {
  const term = normaliseSearchTerm(raw);

  if (term === null || columns.length === 0) {
    return null;
  }

  // Wildcards escaped first so the pattern matches the literal term, then
  // the whole thing quoted so its punctuation cannot restructure the filter.
  const pattern = `%${escapeLikeWildcards(term)}%`;
  const quoted = `"${escapeQuotedValue(pattern)}"`;

  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}

/**
 * Restricts a sort column to a known-safe allow-list.
 *
 * Column names are identifiers, not values, so PostgREST cannot parameterise
 * them. An allow-list is the only correct approach — never pass a
 * caller-supplied string through as a column name.
 */
export function safeSortColumn(
  requested: string | undefined | null,
  allowed: readonly string[],
  fallback: string,
): string {
  if (typeof requested === "string" && allowed.includes(requested)) {
    return requested;
  }

  return fallback;
}

/** Normalises a sort direction to one of the two legal values. */
export function safeSortDirection(
  requested: string | undefined | null,
): "asc" | "desc" {
  return requested === "desc" ? "desc" : "asc";
}
