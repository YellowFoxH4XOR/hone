// Minimal YAML subset parser — zero dependencies, fast enough for synchronous
// hooks. Supports exactly what Hone's config.yaml needs:
//   - nested maps via indentation
//   - scalars: bool, int, float, null, quoted/unquoted strings
//   - inline lists: [a, b, c]
//   - block lists of scalars:  - item
//   - comments (#) and blank lines
// Deliberately NOT supported: anchors, aliases, multi-line strings, tags,
// lists of maps. If a user's config needs those, it's out of scope for Hone.

import type { YamlValue, YamlMap } from './types.ts';

interface Line {
  indent: number;
  text: string;
  lineNo: number;
}

export function parse(text: unknown): YamlValue {
  const lines: Line[] = [];
  const raw = String(text).split(/\r?\n/);
  for (let n = 0; n < raw.length; n++) {
    const stripped = stripComment(raw[n] ?? '');
    if (stripped.trim() === '') continue;
    const indent = stripped.length - stripped.trimStart().length;
    lines.push({ indent, text: stripped.trim(), lineNo: n + 1 });
  }
  if (lines.length === 0) return {};
  const first = lines[0]!;
  const { value } = parseBlock(lines, 0, first.indent);
  return value;
}

interface BlockResult {
  value: YamlValue;
  next: number;
}

function parseBlock(lines: Line[], start: number, indent: number): BlockResult {
  const line = lines[start]!;
  if (line.text.startsWith('- ') || line.text === '-') {
    return parseList(lines, start, indent);
  }
  return parseMap(lines, start, indent);
}

function parseMap(lines: Line[], start: number, indent: number): BlockResult {
  const map: YamlMap = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new Error(`yaml: unexpected indent at line ${line.lineNo}`);
    }
    const m = line.text.match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+):(.*)$/);
    if (!m) throw new Error(`yaml: expected "key: value" at line ${line.lineNo}`);
    const key = String(parseScalar(m[1]!.trim()));
    const rest = m[2]!.trim();
    if (rest !== '') {
      map[key] = parseScalar(rest);
      i++;
    } else {
      const next = lines[i + 1];
      if (next && next.indent > indent) {
        const child = parseBlock(lines, i + 1, next.indent);
        map[key] = child.value;
        i = child.next;
      } else if (next && next.indent === indent && (next.text.startsWith('- ') || next.text === '-')) {
        // Idiomatic YAML allows a block list's dashes at the SAME indent as
        // the parent key — accept both styles.
        const child = parseList(lines, i + 1, indent);
        map[key] = child.value;
        i = child.next;
      } else {
        map[key] = null;
        i++;
      }
    }
  }
  return { value: map, next: i };
}

function parseList(lines: Line[], start: number, indent: number): BlockResult {
  const list: YamlValue[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.indent !== indent || !(line.text.startsWith('- ') || line.text === '-')) break;
    const item = line.text === '-' ? '' : line.text.slice(2).trim();
    list.push(item === '' ? null : parseScalar(item));
    i++;
  }
  return { value: list, next: i };
}

function parseScalar(s: string): YamlValue {
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner).map((part) => parseScalar(part.trim()));
  }
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    const body = s.slice(1, -1);
    return s[0] === '"' ? body.replace(/\\(["\\])/g, '$1') : body;
  }
  if (s === 'true' || s === 'True') return true;
  if (s === 'false' || s === 'False') return false;
  if (s === 'null' || s === '~' || s === 'Null') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
  return s;
}

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of s) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ']') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') parts.push(current);
  return parts;
}

function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      // Inside double quotes, a backslash escapes the next char — an escaped
      // quote must not close the string (else trailing "# ..." text leaks in).
      if (quote === '"' && ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '#' && (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t')) {
      return line.slice(0, i);
    }
  }
  return line;
}
