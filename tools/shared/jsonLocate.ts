/**
 * Maps validator paths ("shows[12].date") to 1-based line numbers in the JSON source,
 * so CI annotations land on the offending line. Expects text that JSON.parse accepted.
 */
export function locateJsonPaths(text: string): ReadonlyMap<string, number> {
  const lines = new Map<string, number>();
  let position = 0;
  let line = 1;

  const peek = () => text.charAt(position);

  const skipWhitespace = () => {
    while (position < text.length) {
      const char = peek();
      if (char === '\n') line++;
      else if (char !== ' ' && char !== '\t' && char !== '\r') return;
      position++;
    }
  };

  const expect = (char: string) => {
    if (peek() !== char) throw new SyntaxError(`expected "${char}" at line ${line}`);
    position++;
  };

  const readString = (): string => {
    const start = position;
    expect('"');
    while (position < text.length && peek() !== '"') {
      position += peek() === '\\' ? 2 : 1;
    }
    expect('"');
    return JSON.parse(text.slice(start, position)) as string;
  };

  const readValue = (path: string) => {
    skipWhitespace();
    lines.set(path, line);
    const char = peek();
    if (char === '{') readObject(path);
    else if (char === '[') readArray(path);
    else if (char === '"') readString();
    else {
      while (position < text.length && !/[\s,\]}]/.test(peek())) position++;
    }
  };

  const readObject = (path: string) => {
    expect('{');
    skipWhitespace();
    if (peek() === '}') {
      position++;
      return;
    }
    for (;;) {
      skipWhitespace();
      const keyLine = line;
      const key = readString();
      const keyPath = path === '' ? key : `${path}.${key}`;
      skipWhitespace();
      expect(':');
      readValue(keyPath);
      lines.set(keyPath, keyLine);
      skipWhitespace();
      if (peek() === ',') {
        position++;
        continue;
      }
      expect('}');
      return;
    }
  };

  const readArray = (path: string) => {
    expect('[');
    skipWhitespace();
    if (peek() === ']') {
      position++;
      return;
    }
    for (let index = 0; ; index++) {
      readValue(`${path}[${index}]`);
      skipWhitespace();
      if (peek() === ',') {
        position++;
        continue;
      }
      expect(']');
      return;
    }
  };

  readValue('');
  return lines;
}

/** Line of the path, or of its closest located ancestor (a missing field is reported on its object). */
export function lineForPath(lines: ReadonlyMap<string, number>, path: string): number {
  for (let candidate = path; ; candidate = parentPath(candidate)) {
    const found = lines.get(candidate);
    if (found !== undefined) return found;
    if (candidate === '') return 1;
  }
}

function parentPath(path: string): string {
  const cut = Math.max(path.lastIndexOf('.'), path.lastIndexOf('['));
  return cut <= 0 ? '' : path.slice(0, cut);
}
