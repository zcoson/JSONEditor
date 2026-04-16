import { useState, useCallback, useRef } from 'react';
import type { JsonValue } from '../utils/jsonUtils';
import { parseJson, formatJson, setValueAtPath, insertArrayItem, removeArrayItem, addObjectProperty, removeObjectProperty } from '../utils/jsonUtils';

export interface UseJsonStateReturn {
  rawContent: string;
  jsonValue: JsonValue | null;
  selectedPath: (string | number)[];
  error: string | null;
  filePath: string | null;
  setRawContent: (content: string) => void;
  setSelectedPath: (path: (string | number)[]) => void;
  updateValue: (path: (string | number)[], newValue: JsonValue) => void;
  insertItem: (path: (string | number)[], index: number, newItem: JsonValue) => void;
  removeItem: (path: (string | number)[], index: number) => void;
  addProperty: (path: (string | number)[], key: string, value: JsonValue) => void;
  removeProperty: (path: (string | number)[], key: string) => void;
  loadJson: (content: string, path?: string) => void;
  clear: () => void;
  reset: () => void;
  undo: () => void;
  canUndo: boolean;
  hasOriginal: boolean;
}

export function useJsonState(): UseJsonStateReturn {
  const [rawContent, setRawContent] = useState<string>('');
  const [jsonValue, setJsonValue] = useState<JsonValue | null>(null);
  const [selectedPath, setSelectedPath] = useState<(string | number)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string>('');
  const [filePath, setFilePath] = useState<string | null>(null);

  // History for undo
  const historyRef = useRef<JsonValue[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  const loadJson = useCallback((content: string, path?: string) => {
    console.log('loadJson called with path:', path);
    setRawContent(content);
    setOriginalContent(content);
    if (path) {
      console.log('Setting filePath to:', path);
      setFilePath(path);
    }
    const parsed = parseJson(content);
    if (parsed === null && content.trim()) {
      setError('Invalid JSON');
      setJsonValue(null);
    } else {
      setError(null);
      setJsonValue(parsed);
      // Clear history when loading new file
      historyRef.current = [];
      setCanUndo(false);
    }
  }, []);

  const updateValue = useCallback((path: (string | number)[], newValue: JsonValue) => {
    if (jsonValue === null) return;

    // Save current state to history before updating
    historyRef.current.push(jsonValue);
    // Limit history to 50 items
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    setCanUndo(true);

    const updated = setValueAtPath(jsonValue, path, newValue);
    setJsonValue(updated);
    setRawContent(formatJson(updated));
  }, [jsonValue]);

  const insertItem = useCallback((path: (string | number)[], index: number, newItem: JsonValue) => {
    if (jsonValue === null) return;

    historyRef.current.push(jsonValue);
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    setCanUndo(true);

    const updated = insertArrayItem(jsonValue, path, index, newItem);
    setJsonValue(updated);
    setRawContent(formatJson(updated));
  }, [jsonValue]);

  const removeItem = useCallback((path: (string | number)[], index: number) => {
    if (jsonValue === null) return;

    historyRef.current.push(jsonValue);
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    setCanUndo(true);

    const updated = removeArrayItem(jsonValue, path, index);
    setJsonValue(updated);
    setRawContent(formatJson(updated));
  }, [jsonValue]);

  const addProperty = useCallback((path: (string | number)[], key: string, value: JsonValue) => {
    if (jsonValue === null) return;

    historyRef.current.push(jsonValue);
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    setCanUndo(true);

    const updated = addObjectProperty(jsonValue, path, key, value);
    setJsonValue(updated);
    setRawContent(formatJson(updated));
  }, [jsonValue]);

  const removeProperty = useCallback((path: (string | number)[], key: string) => {
    if (jsonValue === null) return;

    historyRef.current.push(jsonValue);
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    setCanUndo(true);

    const updated = removeObjectProperty(jsonValue, path, key);
    setJsonValue(updated);
    setRawContent(formatJson(updated));
  }, [jsonValue]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;

    const previousValue = historyRef.current.pop()!;
    setJsonValue(previousValue);
    setRawContent(formatJson(previousValue));
    setCanUndo(historyRef.current.length > 0);
  }, []);

  const clear = useCallback(() => {
    setRawContent('');
    setJsonValue(null);
    setSelectedPath([]);
    setError(null);
    setOriginalContent('');
    setFilePath(null);
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const reset = useCallback(() => {
    if (!originalContent) return;
    setRawContent(originalContent);
    const parsed = parseJson(originalContent);
    if (parsed !== null) {
      setJsonValue(parsed);
      setError(null);
    }
    // Clear history on reset
    historyRef.current = [];
    setCanUndo(false);
    // Don't reset selectedPath - keep current panels open
  }, [originalContent]);

  return {
    rawContent,
    jsonValue,
    selectedPath,
    error,
    filePath,
    setRawContent,
    setSelectedPath,
    updateValue,
    insertItem,
    removeItem,
    addProperty,
    removeProperty,
    loadJson,
    clear,
    reset,
    undo,
    canUndo,
    hasOriginal: !!originalContent,
  };
}
