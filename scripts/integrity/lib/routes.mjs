/**
 * Static route extraction for src/App.tsx. Handles JSX attributes such as
 * element={<Page />} by tracking brace depth instead of stopping at the first ">".
 */

export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

export function normalizePath(pathname) {
  if (!pathname) return "/";
  const path = String(pathname).split("?")[0].split("#")[0];
  if (path === "/") return "/";
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.startsWith("/") ? trimmed || "/" : `/${trimmed}`;
}

export function extractExportedPathConstants(source) {
  const map = {};
  const re = /export const ([A-Z0-9_]+) = ["'](\/[^"']*)["']/g;
  for (const match of source.matchAll(re)) map[match[1]] = match[2];
  const journal = source.match(/export const JOURNAL_BASE = ["'](\/[^"']+)["']/);
  if (journal) map.JOURNAL_BASE = journal[1];
  return map;
}

function isRouteTagAt(source, index) {
  if (!source.startsWith("<Route", index)) return false;
  const next = source[index + "<Route".length];
  return next === undefined || /[\s/>]/.test(next);
}

function readJsxTag(source, start) {
  let i = start;
  let brace = 0;
  let quote = null;
  while (i < source.length) {
    const char = source[i];
    if (quote) {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (char === quote) quote = null;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      i += 1;
      continue;
    }
    if (char === "{") brace += 1;
    else if (char === "}") brace = Math.max(0, brace - 1);
    else if (char === ">" && brace === 0) {
      let j = i - 1;
      while (j > start && /\s/.test(source[j])) j -= 1;
      return {
        raw: source.slice(start, i + 1),
        end: i + 1,
        selfClosing: source[j] === "/",
      };
    }
    i += 1;
  }
  return null;
}

function readPath(attrs, constants, unresolved) {
  const literal = attrs.match(/\bpath\s*=\s*["']([^"']+)["']/);
  if (literal) return literal[1];
  const ident = attrs.match(/\bpath\s*=\s*\{([A-Za-z0-9_]+)\}/);
  if (ident) {
    if (constants[ident[1]]) return constants[ident[1]];
    unresolved.push(ident[1]);
    return null;
  }
  return undefined;
}

function joinRoute(parent, child) {
  if (child.startsWith("/")) return normalizePath(child);
  const base = !parent || parent === "/" ? "" : parent.replace(/\/+$/, "");
  return normalizePath(`${base}/${child}`);
}

export function extractRoutePatterns(appSource, constants = {}) {
  const source = stripComments(appSource);
  const patterns = [];
  const unresolved = [];
  const stack = [""];
  let i = 0;
  while (i < source.length) {
    const nextOpen = source.indexOf("<Route", i);
    const nextClose = source.indexOf("</Route>", i);
    if (nextOpen === -1 && nextClose === -1) break;
    const closeWins = nextClose !== -1 && (nextOpen === -1 || nextClose < nextOpen);
    if (closeWins) {
      if (stack.length > 1) stack.pop();
      i = nextClose + "</Route>".length;
      continue;
    }
    if (!isRouteTagAt(source, nextOpen)) {
      i = nextOpen + "<Route".length;
      continue;
    }
    const tag = readJsxTag(source, nextOpen);
    if (!tag) break;
    const attrs = tag.raw.slice("<Route".length, tag.selfClosing ? -2 : -1);
    const parent = stack[stack.length - 1] ?? "";
    const isIndex = /\bindex\b/.test(attrs) && !/\bpath\s*=/.test(attrs);
    const segment = isIndex ? undefined : readPath(attrs, constants, unresolved);
    if (segment === "*") {
      if (!tag.selfClosing) stack.push(parent);
    } else if (segment) {
      const full = joinRoute(parent, segment);
      patterns.push(full);
      if (!tag.selfClosing) stack.push(full);
    } else if (!tag.selfClosing) {
      stack.push(parent);
    }
    i = tag.end;
  }
  return { patterns: [...new Set(patterns)], unresolved };
}

export function patternMatches(pattern, pathname) {
  const path = normalizePath(pathname);
  const expected = normalizePath(pattern);
  if (expected === "/" || path === "/") return expected === path;
  const left = expected.split("/").filter(Boolean);
  const right = path.split("/").filter(Boolean);
  if (left.length !== right.length) return false;
  return left.every((segment, index) => segment.startsWith(":") || segment === right[index]);
}

export function isKnownRoute(patterns, pathname) {
  return patterns.some((pattern) => patternMatches(pattern, pathname));
}
