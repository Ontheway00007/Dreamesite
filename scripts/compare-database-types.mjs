/**
 * Compares the Supabase-generated database types against the hand-maintained
 * `src/types/database.ts`, and exits non-zero when they disagree.
 *
 * Usage:
 *   node scripts/compare-database-types.mjs <generated.ts> <handwritten.ts> \
 *     [--ignore-functions=a,b,c]
 *
 * Normally invoked by `scripts/check-type-drift.sh`, which generates the first
 * argument and supplies the ignore list.
 *
 * ## Why an AST and not a diff
 *
 * The two files are not meant to be identical. The generated one is a single
 * `export type Database` with inline row literals, alphabetised members,
 * `Insert`/`Update`/`Relationships` scaffolding and every function the `public`
 * schema happens to contain. The hand-written one is a set of named exported
 * interfaces referenced from `Database`, in migration order, carrying comments
 * and narrower types. Diffing them produces noise, not signal.
 *
 * So this parses both with the TypeScript compiler and compares the two things
 * that can actually break the application:
 *
 *   - every table's column names, in both directions
 *   - every table column's nullability
 *   - every function name declared here but absent from the schema
 *
 * ## What it deliberately does not compare, and why
 *
 * **Column types.** The hand-written file narrows deliberately and correctly:
 * `description_blocks` is `DescriptionBlockRow[] | null` where the generator can
 * only say `Json | null`, and `status` is a string union where the generator says
 * `string`. Those narrowings are the reason the file is hand-maintained. Failing
 * on them would mean deleting the value.
 *
 * **Function arguments.** The generator alphabetises argument names and reports
 * every argument as non-null regardless of the SQL default — `p_ip_hash` comes
 * back as `string` for a parameter that accepts null. Comparing argument lists
 * would report drift on every function that takes an optional argument.
 *
 * **Function return types.** `Returns: undefined` versus `Returns: void`, for
 * the same `returns void` function.
 *
 * **View column nullability.** PostgreSQL does not track `NOT NULL` through a
 * view, so the generator reports every view column as nullable whatever the
 * underlying column says. View column *names* are compared; nullability is not,
 * because the generator has no such information to compare against.
 *
 * **Functions in the schema but not declared here.** Reported, not failed. Many
 * are internal — trigger bodies, `lock_group_internal`, `group_lock_key` — and
 * exist only to be called from other SQL. Requiring a TypeScript declaration for
 * each would add noise with no reader. The reverse direction *is* a failure: a
 * declaration with no function behind it is a runtime error waiting to happen.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import ts from "typescript";

// ----------------------------------------------------------------------
// Arguments
// ----------------------------------------------------------------------

const positional = [];
let ignoredFunctions = new Set();

for (const argument of process.argv.slice(2)) {
  if (argument.startsWith("--ignore-functions=")) {
    ignoredFunctions = new Set(
      argument
        .slice("--ignore-functions=".length)
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
    continue;
  }
  if (argument.startsWith("--")) {
    console.error(`Unknown option: ${argument}`);
    process.exit(2);
  }
  positional.push(argument);
}

if (positional.length !== 2) {
  console.error(
    "Usage: node scripts/compare-database-types.mjs <generated.ts> <handwritten.ts> [--ignore-functions=a,b]",
  );
  process.exit(2);
}

const [generatedPath, handWrittenPath] = positional;

// ----------------------------------------------------------------------
// Parsing
// ----------------------------------------------------------------------

/** Parses a file and indexes its top-level type declarations by name. */
function parse(path) {
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(
    basename(path),
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const declarations = new Map();
  for (const statement of source.statements) {
    if (
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      declarations.set(statement.name.text, statement);
    }
  }
  return { path, source, declarations };
}

/** True when a type node admits null or undefined. */
function isNullable(typeNode) {
  if (!typeNode) return false;

  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.some((member) => isNullable(member));
  }
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return isNullable(typeNode.type);
  }
  // `null` in a type position parses as a literal type wrapping the keyword.
  if (ts.isLiteralTypeNode(typeNode)) {
    return typeNode.literal.kind === ts.SyntaxKind.NullKeyword;
  }
  return (
    typeNode.kind === ts.SyntaxKind.UndefinedKeyword ||
    typeNode.kind === ts.SyntaxKind.NullKeyword ||
    typeNode.kind === ts.SyntaxKind.AnyKeyword
  );
}

/** The string literal names in `"a" | "b"`, or a lone `"a"`. */
function literalKeys(typeNode) {
  if (!typeNode) return [];
  if (ts.isUnionTypeNode(typeNode)) {
    return typeNode.types.flatMap((member) => literalKeys(member));
  }
  if (ts.isLiteralTypeNode(typeNode) && ts.isStringLiteral(typeNode.literal)) {
    return [typeNode.literal.text];
  }
  return [];
}

function memberName(member) {
  const name = member.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * Flattens a type node into a `Map<columnName, { nullable }>`.
 *
 * Follows type references within the file, resolves `Omit` and `Pick`, merges
 * intersections and interface `extends` clauses. Returns null when the shape
 * cannot be resolved, so the caller can report that rather than silently
 * comparing against nothing.
 */
function resolveMembers(typeNode, file, seen = new Set()) {
  if (!typeNode) return null;

  if (ts.isParenthesizedTypeNode(typeNode)) {
    return resolveMembers(typeNode.type, file, seen);
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    const members = new Map();
    for (const member of typeNode.members) {
      if (!ts.isPropertySignature(member)) continue;
      const name = memberName(member);
      if (!name) continue;
      members.set(name, {
        nullable: Boolean(member.questionToken) || isNullable(member.type),
      });
    }
    return members;
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    const members = new Map();
    for (const part of typeNode.types) {
      const resolved = resolveMembers(part, file, seen);
      if (!resolved) return null;
      for (const [name, info] of resolved) members.set(name, info);
    }
    return members;
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const name = ts.isIdentifier(typeNode.typeName)
      ? typeNode.typeName.text
      : typeNode.typeName.right.text;
    const args = typeNode.typeArguments ?? [];

    if (name === "Omit" && args.length === 2) {
      const base = resolveMembers(args[0], file, seen);
      if (!base) return null;
      for (const key of literalKeys(args[1])) base.delete(key);
      return base;
    }

    if (name === "Pick" && args.length === 2) {
      const base = resolveMembers(args[0], file, seen);
      if (!base) return null;
      const keep = new Set(literalKeys(args[1]));
      for (const key of [...base.keys()]) {
        if (!keep.has(key)) base.delete(key);
      }
      return base;
    }

    // Guard against a cycle in the declarations.
    if (seen.has(name)) return new Map();
    const nextSeen = new Set(seen).add(name);

    const declaration = file.declarations.get(name);
    if (!declaration) return null;

    if (ts.isTypeAliasDeclaration(declaration)) {
      return resolveMembers(declaration.type, file, nextSeen);
    }

    // An interface: its own members, plus anything it extends.
    const members = new Map();
    for (const clause of declaration.heritageClauses ?? []) {
      for (const parent of clause.types) {
        const resolved = resolveMembers(parent, file, nextSeen);
        if (!resolved) return null;
        for (const [key, info] of resolved) members.set(key, info);
      }
    }
    for (const member of declaration.members) {
      if (!ts.isPropertySignature(member)) continue;
      const key = memberName(member);
      if (!key) continue;
      members.set(key, {
        nullable: Boolean(member.questionToken) || isNullable(member.type),
      });
    }
    return members;
  }

  return null;
}

/** The type node for a named property of a type literal. */
function propertyType(typeNode, name) {
  if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return null;
  for (const member of typeNode.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (memberName(member) === name) return member.type ?? null;
  }
  return null;
}

/**
 * The `public` schema type literal from a `Database` declaration, whether it is
 * written as an interface (hand-written) or a type alias (generated).
 */
function databasePublicSchema(file) {
  const declaration = file.declarations.get("Database");
  if (!declaration) {
    throw new Error(`${file.path}: no exported \`Database\` declaration found`);
  }

  if (ts.isTypeAliasDeclaration(declaration)) {
    return propertyType(declaration.type, "public");
  }

  for (const member of declaration.members) {
    if (!ts.isPropertySignature(member)) continue;
    if (memberName(member) === "public") return member.type ?? null;
  }
  return null;
}

/** `Map<tableName, Map<columnName, { nullable }>>` for Tables or Views. */
function readRelations(file, schema, section) {
  const sectionType = propertyType(schema, section);
  const relations = new Map();
  if (!sectionType || !ts.isTypeLiteralNode(sectionType)) return relations;

  for (const member of sectionType.members) {
    if (!ts.isPropertySignature(member)) continue;
    const name = memberName(member);
    if (!name) continue;

    const rowType = propertyType(member.type, "Row");
    if (!rowType) {
      throw new Error(
        `${file.path}: ${section}.${name} has no \`Row\` property`,
      );
    }
    const members = resolveMembers(rowType, file);
    if (!members) {
      throw new Error(
        `${file.path}: could not resolve the row shape of ${section}.${name}`,
      );
    }
    relations.set(name, members);
  }
  return relations;
}

function readFunctionNames(file, schema) {
  const sectionType = propertyType(schema, "Functions");
  const names = new Set();
  if (!sectionType || !ts.isTypeLiteralNode(sectionType)) return names;

  for (const member of sectionType.members) {
    if (!ts.isPropertySignature(member)) continue;
    const name = memberName(member);
    if (name) names.add(name);
  }
  return names;
}

// ----------------------------------------------------------------------
// Comparison
// ----------------------------------------------------------------------

const problems = [];
const notes = [];

function compareRelations(section, generated, handWritten, compareNullability) {
  const allNames = new Set([...generated.keys(), ...handWritten.keys()]);

  for (const name of [...allNames].sort()) {
    const schemaColumns = generated.get(name);
    const declaredColumns = handWritten.get(name);

    if (!schemaColumns) {
      problems.push(
        `${section} \`${name}\` is declared in src/types/database.ts but does not exist in the schema.`,
      );
      continue;
    }
    if (!declaredColumns) {
      problems.push(
        `${section} \`${name}\` exists in the schema but is missing from src/types/database.ts.`,
      );
      continue;
    }

    for (const column of [...schemaColumns.keys()].sort()) {
      if (!declaredColumns.has(column)) {
        problems.push(
          `${section} \`${name}\`: column \`${column}\` exists in the schema but is missing from src/types/database.ts.`,
        );
      }
    }
    for (const column of [...declaredColumns.keys()].sort()) {
      if (!schemaColumns.has(column)) {
        problems.push(
          `${section} \`${name}\`: column \`${column}\` is declared in src/types/database.ts but does not exist in the schema.`,
        );
      }
    }

    if (!compareNullability) continue;

    for (const [column, schemaInfo] of schemaColumns) {
      const declaredInfo = declaredColumns.get(column);
      if (!declaredInfo) continue;
      if (declaredInfo.nullable !== schemaInfo.nullable) {
        problems.push(
          `${section} \`${name}\`: column \`${column}\` is ${
            schemaInfo.nullable ? "nullable" : "NOT NULL"
          } in the schema but declared ${
            declaredInfo.nullable ? "nullable" : "non-null"
          } in src/types/database.ts.`,
        );
      }
    }
  }
}

let generatedFile;
let handWrittenFile;
try {
  generatedFile = parse(generatedPath);
  handWrittenFile = parse(handWrittenPath);
} catch (error) {
  console.error(`Could not read the type files: ${error.message}`);
  process.exit(2);
}

let generatedSchema;
let handWrittenSchema;
try {
  generatedSchema = databasePublicSchema(generatedFile);
  handWrittenSchema = databasePublicSchema(handWrittenFile);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (!generatedSchema || !handWrittenSchema) {
  console.error(
    "Could not locate the `public` schema in one of the type files. The generator's output shape may have changed.",
  );
  process.exit(2);
}

let generatedTables;
let handWrittenTables;
let generatedViews;
let handWrittenViews;
try {
  generatedTables = readRelations(generatedFile, generatedSchema, "Tables");
  handWrittenTables = readRelations(handWrittenFile, handWrittenSchema, "Tables");
  generatedViews = readRelations(generatedFile, generatedSchema, "Views");
  handWrittenViews = readRelations(handWrittenFile, handWrittenSchema, "Views");
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

if (generatedTables.size === 0) {
  console.error(
    "The generated file declared no tables. That is a generation failure, not an empty schema.",
  );
  process.exit(2);
}

compareRelations("Table", generatedTables, handWrittenTables, true);
// Nullability is not compared for views: see the header.
compareRelations("View", generatedViews, handWrittenViews, false);

const generatedFunctions = readFunctionNames(generatedFile, generatedSchema);
const handWrittenFunctions = readFunctionNames(handWrittenFile, handWrittenSchema);

for (const name of [...handWrittenFunctions].sort()) {
  if (!generatedFunctions.has(name)) {
    problems.push(
      `Function \`${name}\` is declared in src/types/database.ts but does not exist in the schema.`,
    );
  }
}

const undeclared = [...generatedFunctions]
  .filter((name) => !handWrittenFunctions.has(name))
  .filter((name) => !ignoredFunctions.has(name))
  .sort();

if (undeclared.length > 0) {
  notes.push(
    `${undeclared.length} schema function(s) are not declared in src/types/database.ts. ` +
      "This is not a failure — internal SQL helpers have no TypeScript caller — but " +
      "add a declaration if application code needs to call one:",
  );
  for (const name of undeclared) notes.push(`    ${name}`);
}

// ----------------------------------------------------------------------
// Report
// ----------------------------------------------------------------------

const columnCount = [...generatedTables.values()].reduce(
  (total, columns) => total + columns.size,
  0,
);

console.log(
  `Compared ${generatedTables.size} table(s) / ${columnCount} column(s), ` +
    `${generatedViews.size} view(s) and ${handWrittenFunctions.size} declared function(s).`,
);

if (notes.length > 0) {
  console.log("");
  for (const note of notes) console.log(note);
}

if (problems.length > 0) {
  console.error("");
  console.error(
    `Generated types have drifted from src/types/database.ts (${problems.length} problem(s)):`,
  );
  console.error("");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  console.error(
    "Update src/types/database.ts to match the schema, or add the migration the types are already expecting.",
  );
  process.exit(1);
}

console.log("No drift: every table column and declared function matches the schema.");
