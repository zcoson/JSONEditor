export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export interface JsonNode {
  key: string;
  value: JsonValue;
  type: 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';
  path: (string | number)[];
  expanded?: boolean;
}

export function getValueType(value: JsonValue): JsonNode['type'] {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value as 'string' | 'number' | 'boolean';
}

export function parseJson(content: string): JsonValue | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function formatJson(value: JsonValue, indent: number = 2): string {
  return JSON.stringify(value, null, indent);
}

export function getValueAtPath(root: JsonValue, path: (string | number)[]): JsonValue | undefined {
  let current: JsonValue | undefined = root;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      if (Array.isArray(current)) {
        current = current[key as number];
      } else {
        current = (current as JsonObject)[key as string];
      }
    } else {
      return undefined;
    }
  }
  return current;
}

export function setValueAtPath(
  root: JsonValue,
  path: (string | number)[],
  newValue: JsonValue
): JsonValue {
  if (path.length === 0) return newValue;

  const newRoot = JSON.parse(JSON.stringify(root)) as JsonObject | JsonArray;
  let current: JsonObject | JsonArray = newRoot;

  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (Array.isArray(current)) {
      current = current[key as number] as JsonObject | JsonArray;
    } else {
      current = (current as JsonObject)[key as string] as JsonObject | JsonArray;
    }
  }

  const lastKey = path[path.length - 1];
  if (Array.isArray(current)) {
    current[lastKey as number] = newValue;
  } else {
    (current as JsonObject)[lastKey as string] = newValue;
  }

  return newRoot;
}

export function removeEscape(content: string): string {
  return content.replace(/\\"/g, '"');
}

export function compressJson(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed);
  } catch {
    return content.replace(/\s+/g, '');
  }
}
