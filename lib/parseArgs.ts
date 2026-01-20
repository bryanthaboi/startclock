type ParsedKv = Record<string, string>;

function tokenize(input: string): string[] {
  // Splits on whitespace, keeping quoted substrings intact.
  const tokens: string[] = [];
  let cur = "";
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === "\\" && i + 1 < input.length) {
        // Allow escaping quotes/spaces inside quoted strings.
        cur += input[i + 1];
        i++;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur.length > 0) tokens.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) tokens.push(cur);
  return tokens;
}

export function parseKeyValueArgs(input: string): ParsedKv {
  const out: ParsedKv = {};
  for (const token of tokenize(input.trim())) {
    const eq = token.indexOf("=");
    if (eq <= 0) continue;
    const key = token.slice(0, eq).trim();
    const value = token.slice(eq + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

