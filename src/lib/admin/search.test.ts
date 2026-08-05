import { describe, expect, it } from "vitest";

import {
  MAX_SEARCH_LENGTH,
  buildSearchFilter,
  normaliseSearchTerm,
  safeSortColumn,
  safeSortDirection,
} from "@/lib/admin/search";

/**
 * The filter-injection tests are the point of this file.
 *
 * PostgREST's `or=` parameter is structured text. If a search term can
 * introduce a comma, a parenthesis or a full stop into that text, it can add
 * filters the caller never wrote — which on an admin listing means changing
 * which rows come back.
 */

const COLUMNS = ["name", "slug", "suburb"] as const;

describe("normaliseSearchTerm", () => {
  it("returns null for nothing to search for", () => {
    expect(normaliseSearchTerm(undefined)).toBeNull();
    expect(normaliseSearchTerm(null)).toBeNull();
    expect(normaliseSearchTerm("")).toBeNull();
    expect(normaliseSearchTerm("   ")).toBeNull();
    expect(normaliseSearchTerm("\n\t  \n")).toBeNull();
  });

  it("ignores non-string input", () => {
    expect(normaliseSearchTerm(42 as unknown as string)).toBeNull();
    expect(normaliseSearchTerm({} as unknown as string)).toBeNull();
  });

  it("trims and collapses whitespace", () => {
    expect(normaliseSearchTerm("  two   words  ")).toBe("two words");
    expect(normaliseSearchTerm("line\nbreak")).toBe("line break");
    expect(normaliseSearchTerm("tab\tsep")).toBe("tab sep");
  });

  it("caps the length", () => {
    const term = normaliseSearchTerm("a".repeat(500));

    expect(term).toHaveLength(MAX_SEARCH_LENGTH);
  });
});

describe("buildSearchFilter", () => {
  it("returns null when there is nothing to filter on", () => {
    expect(buildSearchFilter("", COLUMNS)).toBeNull();
    expect(buildSearchFilter("   ", COLUMNS)).toBeNull();
    expect(buildSearchFilter(undefined, COLUMNS)).toBeNull();
  });

  it("returns null when no columns are searchable", () => {
    expect(buildSearchFilter("anything", [])).toBeNull();
  });

  it("builds one ilike clause per column", () => {
    const filter = buildSearchFilter("kew", COLUMNS) as string;

    expect(filter).toBe(
      'name.ilike."%kew%",slug.ilike."%kew%",suburb.ilike."%kew%"',
    );
  });

  it("quotes the value so it cannot be read as filter syntax", () => {
    const filter = buildSearchFilter("plain", ["name"]) as string;

    expect(filter).toBe('name.ilike."%plain%"');
  });

  /* --- Injection --------------------------------------------------------- */

  it("neutralises a comma, which would otherwise add a filter", () => {
    // Unquoted, this term would append `is_published.eq.true` as a second
    // filter and reveal draft properties the caller meant to exclude.
    const filter = buildSearchFilter("a,is_published.eq.true", ["name"]) as string;

    // The assertion that matters: exactly one filter clause was produced, so
    // the comma did not introduce a second one.
    expect(filter.split("ilike")).toHaveLength(2);

    // The whole payload sits inside the quoted value. Its underscore is
    // escaped too, since LIKE would otherwise treat it as a wildcard.
    expect(filter).toBe('name.ilike."%a,is\\\\_published.eq.true%"');
    expect(filter.startsWith('name.ilike."')).toBe(true);
    expect(filter.endsWith('"')).toBe(true);
  });

  it("neutralises parentheses, which would otherwise close the group early", () => {
    const filter = buildSearchFilter("a)or(b", ["name"]) as string;

    expect(filter).toBe('name.ilike."%a)or(b%"');
  });

  it("neutralises the column/operator separator", () => {
    const filter = buildSearchFilter("name.eq.x", ["name"]) as string;

    expect(filter).toBe('name.ilike."%name.eq.x%"');
  });

  it("escapes a double quote so it cannot end the quoted value", () => {
    const filter = buildSearchFilter('say "hi"', ["name"]) as string;

    expect(filter).toBe('name.ilike."%say \\"hi\\"%"');
  });

  /* --- LIKE wildcards ---------------------------------------------------
     Two escaping layers are in play here, and the doubled backslashes below
     are the correct result of both, not an off-by-one:

       1. LIKE level — `%` becomes `\%` so it matches a literal percent sign
          rather than "anything".
       2. PostgREST quoted-string level — that `\` becomes `\\` so it
          survives transport and arrives at SQL as a single backslash.

     PostgREST unescapes `\\` to `\` when parsing the quoted value, so SQL
     receives `ilike '%50\%%'` and LIKE reads `\%` as a literal `%`. Escaping
     only once would leave `\%` inside the quotes, which PostgREST does not
     recognise as an escape sequence.
  --------------------------------------------------------------------- */

  it("escapes a percent sign so it matches literally", () => {
    // Unescaped, a search for `50%` would match anything beginning "50".
    const filter = buildSearchFilter("50%", ["name"]) as string;

    expect(filter).toBe('name.ilike."%50\\\\%%"');
  });

  it("escapes an underscore, which LIKE treats as any single character", () => {
    // Unescaped, `a_b` would match "axb" as well as "a_b".
    const filter = buildSearchFilter("a_b", ["name"]) as string;

    expect(filter).toBe('name.ilike."%a\\\\_b%"');
  });

  it("escapes a backslash before adding its own", () => {
    // The order matters: doubling the user's backslash must happen before the
    // escapes this function introduces, or those get escaped too.
    const filter = buildSearchFilter("a\\b", ["name"]) as string;

    expect(filter).toBe('name.ilike."%a\\\\\\\\b%"');
  });

  /* --- Characters that legitimately appear in property names ----------- */

  it("passes an apostrophe through unharmed", () => {
    // Apostrophes are not significant to PostgREST and the value never
    // reaches SQL as text, so no escaping is needed — but it must still work.
    const filter = buildSearchFilter("O'Brien", ["name"]) as string;

    expect(filter).toBe('name.ilike."%O\'Brien%"');
  });

  it("handles accented characters", () => {
    const filter = buildSearchFilter("Café", ["name"]) as string;

    expect(filter).toBe('name.ilike."%Café%"');
  });

  it("handles a hyphenated suburb", () => {
    const filter = buildSearchFilter("Sunbury-Bulla", ["suburb"]) as string;

    expect(filter).toBe('suburb.ilike."%Sunbury-Bulla%"');
  });

  it("caps a very long term", () => {
    const filter = buildSearchFilter("x".repeat(1000), ["name"]) as string;

    expect(filter.length).toBeLessThan(MAX_SEARCH_LENGTH + 40);
  });
});

describe("safeSortColumn", () => {
  const allowed = ["name", "status", "updated_at"];

  it("accepts an allowed column", () => {
    expect(safeSortColumn("name", allowed, "name")).toBe("name");
    expect(safeSortColumn("updated_at", allowed, "name")).toBe("updated_at");
  });

  it("falls back for anything not on the list", () => {
    // Column names are identifiers, so they cannot be parameterised — an
    // allow-list is the only safe approach.
    expect(safeSortColumn("id; drop table properties", allowed, "name")).toBe("name");
    expect(safeSortColumn("private_latitude", allowed, "name")).toBe("name");
    expect(safeSortColumn("", allowed, "name")).toBe("name");
    expect(safeSortColumn(undefined, allowed, "name")).toBe("name");
    expect(safeSortColumn(null, allowed, "name")).toBe("name");
  });

  it("rejects a non-string", () => {
    expect(safeSortColumn(1 as unknown as string, allowed, "name")).toBe("name");
  });
});

describe("safeSortDirection", () => {
  it("recognises descending", () => {
    expect(safeSortDirection("desc")).toBe("desc");
  });

  it("defaults to ascending for everything else", () => {
    expect(safeSortDirection("asc")).toBe("asc");
    expect(safeSortDirection("DESC")).toBe("asc");
    expect(safeSortDirection("nonsense")).toBe("asc");
    expect(safeSortDirection(undefined)).toBe("asc");
    expect(safeSortDirection(null)).toBe("asc");
  });
});
