import { memo, useState, useRef, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { JsonValue } from '../utils/jsonUtils';
import { getValueType, getValueAtPath } from '../utils/jsonUtils';
import { AutoResizeTextarea } from './AutoResizeTextarea';

// Pagination configuration
const PAGE_SIZE = 50; // Items per page
const VIRTUAL_THRESHOLD = 51; // Use pagination above this threshold (> 50 items)

// JSON syntax highlighter - memoized result type
interface HighlightCache {
  json: string;
  result: ReactNode;
}

// Module-level cache for highlight results
let highlightCache: HighlightCache | null = null;

// JSON syntax highlighter with caching (only for small content)
function highlightJson(json: string): ReactNode {
  // Don't cache for large content (> 50KB, roughly equivalent to > 100 items)
  const shouldCache = json.length < 50000;

  // Check cache
  if (shouldCache && highlightCache && highlightCache.json === json) {
    return highlightCache.result;
  }

  const parts: ReactNode[] = [];
  let key = 0;

  // Match different JSON tokens
  const regex = /("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*)|(true|false|null)|([\[\]{}])|([,\n])/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(json)) !== null) {
    // Add any text before the match
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{json.slice(lastIndex, match.index)}</span>);
    }

    const [, keyStr, strValue, numValue, boolValue, bracket, punctuation] = match;

    if (keyStr !== undefined) {
      // Property key with colon
      parts.push(<span key={key++} className="text-[var(--syntax-key)]">{keyStr}</span>);
      parts.push(<span key={key++}>:</span>);
    } else if (strValue !== undefined) {
      // String value
      parts.push(<span key={key++} className="text-[var(--syntax-string)]">{strValue}</span>);
    } else if (numValue !== undefined) {
      // Number
      parts.push(<span key={key++} className="text-[var(--syntax-number)]">{numValue}</span>);
    } else if (boolValue !== undefined) {
      // Boolean or null
      parts.push(<span key={key++} className="text-[var(--syntax-boolean)]">{boolValue}</span>);
    } else if (bracket !== undefined) {
      // Brackets
      parts.push(<span key={key++} className="text-[var(--text-muted)]">{bracket}</span>);
    } else if (punctuation !== undefined) {
      // Comma or newline
      parts.push(<span key={key++}>{punctuation}</span>);
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining text
  if (lastIndex < json.length) {
    parts.push(<span key={key++}>{json.slice(lastIndex)}</span>);
  }

  // Cache result only for small content
  const result = parts;
  if (shouldCache) {
    highlightCache = { json, result };
  }
  return result;
}

// Module-level variable to remember the last mode in this session
let lastEditorMode: 'edit' | 'preview' = 'preview';

interface EditorPanelProps {
  rootValue: JsonValue | null;
  selectedPath: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  onInsert: (path: (string | number)[], index: number, newItem: JsonValue) => void;
  onRemove: (path: (string | number)[], index: number) => void;
  onAddProperty: (path: (string | number)[], key: string, value: JsonValue) => void;
  onRemoveProperty: (path: (string | number)[], key: string) => void;
  fontSize?: number;
}

interface ObjectEditorProps {
  value: Record<string, JsonValue>;
  path: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  onAddProperty: (path: (string | number)[], key: string, value: JsonValue) => void;
  onRemoveProperty: (path: (string | number)[], key: string) => void;
  fontSize?: number;
}

interface ArrayEditorProps {
  value: JsonValue[];
  path: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  onInsert: (path: (string | number)[], index: number, newItem: JsonValue) => void;
  onRemove: (path: (string | number)[], index: number) => void;
  fontSize?: number;
}

function ValueEditor({
  value,
  path,
  onUpdate,
  fontSize,
  singleValueRef,
}: {
  value: JsonValue;
  path: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  fontSize?: number;
  singleValueRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const type = getValueType(value);
  const strValue = String(value);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let newValue: JsonValue;
    if (type === 'number') {
      newValue = parseFloat(e.target.value) || 0;
    } else if (type === 'boolean') {
      newValue = (e.target as HTMLInputElement).checked;
    } else {
      newValue = e.target.value;
    }
    onUpdate(path, newValue);
  };

  if (type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={value as boolean}
        onChange={handleChange}
        className="w-4 h-4"
      />
    );
  }

  if (type === 'null') {
    return (
      <select
        value="null"
        onChange={(e) => {
          const val = e.target.value;
          let newValue: JsonValue;
          if (val === 'null') {
            newValue = null;
          } else if (val === 'true' || val === 'false') {
            newValue = val === 'true';
          } else if (!isNaN(parseFloat(val))) {
            newValue = parseFloat(val);
          } else {
            newValue = val === 'empty' ? '' : val;
          }
          onUpdate(path, newValue);
        }}
        className="px-1 py-0.5 border border-[var(--border-default)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--primary)] text-[var(--text-muted)] bg-[var(--bg-primary)]"
      >
        <option value="null">null</option>
        <option value="empty">""</option>
        <option value="0">0</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (type === 'object' || type === 'array') {
    return (
      <span className="text-[var(--text-muted)]">
        {type === 'object' ? `{ ${Object.keys(value as object).length} keys }` : `[ ${(value as JsonValue[]).length} items ]`}
      </span>
    );
  }

  // Use textarea for strings to show all content
  if (type === 'string') {
    return (
      <AutoResizeTextarea
        ref={singleValueRef as React.RefObject<HTMLTextAreaElement>}
        value={strValue}
        onChange={(newValue) => onUpdate(path, newValue)}
        fontSize={fontSize}
      />
    );
  }

  return (
    <input
      ref={singleValueRef as React.RefObject<HTMLInputElement>}
      type="number"
      value={strValue}
      onChange={handleChange}
      className="w-full max-w-md px-1 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

function ObjectEditor({ value, path, onUpdate, onAddProperty, onRemoveProperty, fontSize }: ObjectEditorProps) {
  const entries = Object.entries(value);
  const [newKey, setNewKey] = useState('');

  // Pagination state for objects with many properties
  const usePagination = entries.length >= VIRTUAL_THRESHOLD;
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.min(PAGE_SIZE, entries.length));

  // Reset pagination when path changes (node switch)
  const pathKey = JSON.stringify(path);
  useEffect(() => {
    setStartIndex(0);
    setEndIndex(Math.min(PAGE_SIZE, entries.length));
  }, [pathKey, entries.length]);

  // Adjust indices when entries length changes
  useEffect(() => {
    if (usePagination) {
      setEndIndex((prev) => Math.min(prev, entries.length));
    }
  }, [entries.length, usePagination]);

  // Visible entries
  const visibleEntries = usePagination ? entries.slice(startIndex, endIndex) : entries;
  const hasMore = usePagination && endIndex < entries.length;
  const hasMoreTop = usePagination && startIndex > 0;

  // Load previous page
  const loadPrevPage = () => {
    if (startIndex > 0) {
      setStartIndex((prev) => Math.max(prev - PAGE_SIZE, 0));
      if (endIndex - startIndex >= PAGE_SIZE) {
        setEndIndex((prev) => Math.max(prev - PAGE_SIZE, startIndex));
      }
    }
  };

  // Load next page
  const loadNextPage = () => {
    if (endIndex < entries.length) {
      setEndIndex((prev) => Math.min(prev + PAGE_SIZE, entries.length));
      if (endIndex - startIndex >= PAGE_SIZE) {
        setStartIndex((prev) => Math.min(prev + PAGE_SIZE, endIndex));
      }
    }
  };

  const handleAdd = () => {
    if (newKey.trim() && !(newKey.trim() in value)) {
      onAddProperty(path, newKey.trim(), null);
      setNewKey('');
    }
  };

  return (
    <div className="space-y-2 overflow-x-auto max-w-full">
      {usePagination && (
        <div className="flex items-center justify-between py-2 px-3 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] text-xs text-[var(--text-secondary)]">
          <button
            onClick={loadPrevPage}
            disabled={!hasMoreTop}
            className={`px-2 py-1 rounded ${hasMoreTop ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
          >
            ← Prev
          </button>
          <span>Showing {startIndex + 1} - {endIndex} of {entries.length}</span>
          <button
            onClick={loadNextPage}
            disabled={!hasMore}
            className={`px-2 py-1 rounded ${hasMore ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
          >
            Next →
          </button>
        </div>
      )}
      {entries.length === 0 ? (
        <div className="text-[var(--text-muted)] italic text-sm py-4 text-center">Empty object</div>
      ) : (
        visibleEntries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-2 min-w-0 group">
            <span className="font-semibold text-[var(--syntax-key)] w-32 truncate flex-shrink-0 text-sm">
              {key}
            </span>
            <span className="text-[var(--text-muted)]">:</span>
            <div className="flex-1 min-w-0">
              <ValueEditor
                value={val}
                path={[...path, key]}
                onUpdate={onUpdate}
                fontSize={fontSize}
              />
            </div>
            <button
              onClick={() => onRemoveProperty(path, key)}
              className="btn btn-danger btn-row-action"
              title="Delete property"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))
      )}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[var(--border-light)]">
        {usePagination ? (
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <button
              onClick={loadPrevPage}
              disabled={!hasMoreTop}
              className={`px-2 py-1 rounded ${hasMoreTop ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
            >
              ←
            </button>
            <span>{startIndex + 1}-{endIndex}/{entries.length}</span>
            <button
              onClick={loadNextPage}
              disabled={!hasMore}
              className={`px-2 py-1 rounded ${hasMore ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
            >
              →
            </button>
          </div>
        ) : <div />}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAdd();
              }
            }}
            placeholder="New property name"
            className="input w-32"
          />
          <button
            onClick={handleAdd}
            disabled={!newKey.trim() || newKey.trim() in value}
            className="btn btn-success"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Property
          </button>
        </div>
      </div>
    </div>
  );
}

function ArrayEditor({ value, path, onUpdate, onInsert, onRemove, fontSize }: ArrayEditorProps) {
  // Pagination state
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.min(PAGE_SIZE, value.length));
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if we should use pagination
  const usePagination = value.length >= VIRTUAL_THRESHOLD;

  // Reset pagination when path changes (node switch)
  const pathKey = JSON.stringify(path);
  useEffect(() => {
    setStartIndex(0);
    setEndIndex(Math.min(PAGE_SIZE, value.length));
  }, [pathKey, value.length]);

  // Adjust indices when array length changes
  useEffect(() => {
    if (usePagination) {
      setEndIndex((prev) => Math.min(prev, value.length));
    }
  }, [value.length, usePagination]);

  // Check if all items are objects with same keys for table view
  const isTableMode = value.length > 0 && value.every(
    (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
  );

  // Visible items
  const visibleItems = usePagination ? value.slice(startIndex, endIndex) : value;
  const hasMore = usePagination && endIndex < value.length;
  const hasMoreTop = usePagination && startIndex > 0;

  if (isTableMode) {
    const allKeys = new Set<string>();
    value.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach((k) => allKeys.add(k));
      }
    });
    const keys = Array.from(allKeys);

    // Create empty object with all keys
    const createEmptyItem = (): Record<string, JsonValue> => {
      const item: Record<string, JsonValue> = {};
      keys.forEach(k => item[k] = null);
      return item;
    };

    // Calculate actual index for pagination
    const getActualIndex = (localIndex: number) =>
      usePagination ? startIndex + localIndex : localIndex;

    // Load previous page
    const loadPrevPage = () => {
      if (startIndex > 0) {
        setStartIndex((prev) => Math.max(prev - PAGE_SIZE, 0));
        if (endIndex - startIndex >= PAGE_SIZE) {
          setEndIndex((prev) => Math.max(prev - PAGE_SIZE, startIndex));
        }
      }
    };

    // Load next page
    const loadNextPage = () => {
      if (endIndex < value.length) {
        setEndIndex((prev) => Math.min(prev + PAGE_SIZE, value.length));
        if (endIndex - startIndex >= PAGE_SIZE) {
          setStartIndex((prev) => Math.min(prev + PAGE_SIZE, endIndex));
        }
      }
    };

    return (
      <div ref={containerRef} className="max-w-full flex flex-col flex-1 min-h-0">
        {usePagination && (
          <div className="flex items-center justify-between py-2 px-3 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] text-xs text-[var(--text-secondary)] flex-shrink-0">
            <button
              onClick={loadPrevPage}
              disabled={!hasMoreTop}
              className={`px-2 py-1 rounded ${hasMoreTop ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
            >
              ← Prev
            </button>
            <span>Showing {startIndex + 1} - {endIndex} of {value.length}</span>
            <button
              onClick={loadNextPage}
              disabled={!hasMore}
              className={`px-2 py-1 rounded ${hasMore ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
            >
              Next →
            </button>
          </div>
        )}
        <div className="overflow-auto flex-1 min-h-0">
        <table className="border-collapse w-full" style={{ minWidth: 'max-content' }}>
          <thead className="sticky top-0 z-20">
            <tr className="bg-[var(--bg-secondary)]">
              <th className="sticky left-0 z-30 border-b border-r border-[var(--border-light)] px-2 py-1.5 text-left font-semibold text-[var(--text-primary)] whitespace-nowrap text-xs bg-[var(--bg-secondary)]">#</th>
              {keys.map((key, keyIndex) => (
                <th key={key} className={`border-b border-[var(--border-light)] px-2 py-1.5 text-left font-semibold text-[var(--syntax-key)] whitespace-nowrap text-xs bg-[var(--bg-secondary)] ${keyIndex < keys.length - 1 ? 'border-r' : ''}`}>
                  {key}
                </th>
              ))}
              <th className="border-b border-[var(--border-light)] px-2 py-1.5 text-left font-semibold text-[var(--text-primary)] whitespace-nowrap text-xs bg-[var(--bg-secondary)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, localIndex) => {
              const actualIndex = getActualIndex(localIndex);
              return (
                <tr key={actualIndex} className="hover:bg-[var(--bg-secondary)] transition-colors group">
                  <td className="sticky left-0 z-10 border-b border-r border-[var(--border-light)] px-2 py-1.5 text-[var(--text-muted)] whitespace-nowrap text-xs font-mono bg-[var(--bg-primary)] group-hover:bg-[var(--bg-secondary)]">{actualIndex}</td>
                  {keys.map((key, keyIndex) => (
                    <td key={key} className={`border-b border-[var(--border-light)] px-2 py-1.5 min-w-0 ${keyIndex < keys.length - 1 ? 'border-r' : ''}`}>
                      <ValueEditor
                        value={(item as Record<string, JsonValue>)[key]}
                        path={[...path, actualIndex, key]}
                        onUpdate={onUpdate}
                        fontSize={fontSize}
                      />
                    </td>
                  ))}
                  <td className="border-b border-[var(--border-light)] px-2 py-1.5 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onInsert(path, actualIndex + 1, createEmptyItem())}
                        className="btn btn-success btn-row-action"
                        title="Insert row below"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onRemove(path, actualIndex)}
                        className="btn btn-danger btn-row-action"
                        title="Delete this row"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2 flex-shrink-0">
          {usePagination ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <button
                onClick={loadPrevPage}
                disabled={!hasMoreTop}
                className={`px-2 py-1 rounded ${hasMoreTop ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
              >
                ←
              </button>
              <span>{startIndex + 1}-{endIndex}/{value.length}</span>
              <button
                onClick={loadNextPage}
                disabled={!hasMore}
                className={`px-2 py-1 rounded ${hasMore ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
              >
                →
              </button>
            </div>
          ) : <div />}
          <button
            onClick={() => onInsert(path, value.length, createEmptyItem())}
            className="btn btn-success"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Row
          </button>
        </div>
      </div>
    );
  }

  // Simple array view
  // Calculate actual index for pagination
  const getActualIndex = (localIndex: number) =>
    usePagination ? startIndex + localIndex : localIndex;

  // Load previous page
  const loadPrevPage = () => {
    if (startIndex > 0) {
      setStartIndex((prev) => Math.max(prev - PAGE_SIZE, 0));
      if (endIndex - startIndex >= PAGE_SIZE) {
        setEndIndex((prev) => Math.max(prev - PAGE_SIZE, startIndex));
      }
    }
  };

  // Load next page
  const loadNextPage = () => {
    if (endIndex < value.length) {
      setEndIndex((prev) => Math.min(prev + PAGE_SIZE, value.length));
      if (endIndex - startIndex >= PAGE_SIZE) {
        setStartIndex((prev) => Math.min(prev + PAGE_SIZE, endIndex));
      }
    }
  };

  return (
    <div ref={containerRef} className="max-w-full flex flex-col flex-1 min-h-0">
      {usePagination && (
        <div className="flex items-center justify-between py-2 px-3 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] text-xs text-[var(--text-secondary)] flex-shrink-0">
          <button
            onClick={loadPrevPage}
            disabled={!hasMoreTop}
            className={`px-2 py-1 rounded ${hasMoreTop ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
          >
            ← Prev
          </button>
          <span>Showing {startIndex + 1} - {endIndex} of {value.length}</span>
          <button
            onClick={loadNextPage}
            disabled={!hasMore}
            className={`px-2 py-1 rounded ${hasMore ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
          >
            Next →
          </button>
        </div>
      )}
      <div className="overflow-auto flex-1 min-h-0">
      <table className="border-collapse w-full" style={{ minWidth: 'max-content' }}>
        <thead className="sticky top-0 z-20">
          <tr className="bg-[var(--bg-secondary)]">
            <th className="sticky left-0 z-30 border-b border-r border-[var(--border-light)] px-2 py-1.5 text-left font-semibold text-[var(--text-primary)] whitespace-nowrap text-xs bg-[var(--bg-secondary)]">#</th>
            <th className="border-b border-r border-[var(--border-light)] px-2 py-1.5 text-left font-semibold text-[var(--text-primary)] whitespace-nowrap text-xs bg-[var(--bg-secondary)]">Value</th>
            <th className="border-b border-[var(--border-light)] px-2 py-1.5 text-left font-semibold text-[var(--text-primary)] whitespace-nowrap text-xs bg-[var(--bg-secondary)]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, localIndex) => {
            const actualIndex = getActualIndex(localIndex);
            return (
              <tr key={actualIndex} className="hover:bg-[var(--bg-secondary)] transition-colors">
                <td className="sticky left-0 z-10 border-b border-r border-[var(--border-light)] px-2 py-1.5 text-[var(--text-muted)] whitespace-nowrap text-xs font-mono bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)]">{actualIndex}</td>
                <td className="border-b border-r border-[var(--border-light)] px-2 py-1.5 min-w-0">
                  <ValueEditor
                    value={item}
                    path={[...path, actualIndex]}
                    onUpdate={onUpdate}
                    fontSize={fontSize}
                  />
                </td>
                <td className="border-b border-[var(--border-light)] px-2 py-1.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <button
                      onClick={() => onInsert(path, actualIndex + 1, null)}
                      className="btn btn-success btn-row-action"
                      title="Insert item below"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onRemove(path, actualIndex)}
                      className="btn btn-danger btn-row-action"
                      title="Delete this item"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2 flex-shrink-0">
        {usePagination ? (
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <button
              onClick={loadPrevPage}
              disabled={!hasMoreTop}
              className={`px-2 py-1 rounded ${hasMoreTop ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
            >
              ←
            </button>
            <span>{startIndex + 1}-{endIndex}/{value.length}</span>
            <button
              onClick={loadNextPage}
              disabled={!hasMore}
              className={`px-2 py-1 rounded ${hasMore ? 'text-[var(--syntax-key)] hover:bg-[var(--bg-tertiary)] cursor-pointer' : 'text-[var(--text-muted)] cursor-not-allowed'}`}
            >
              →
            </button>
          </div>
        ) : <div />}
        <button
          onClick={() => onInsert(path, value.length, null)}
          className="btn btn-success"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>
    </div>
  );
}

export const EditorPanel = memo(function EditorPanel({ rootValue, selectedPath, onUpdate, onInsert, onRemove, onAddProperty, onRemoveProperty, fontSize = 14 }: EditorPanelProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>(lastEditorMode);
  const [feedback, setFeedback] = useState<{ action: string; status: 'success' | 'error' } | null>(null);
  const [filterExpr, setFilterExpr] = useState('');
  const previewRef = useRef<HTMLPreElement>(null);
  const singleValuePreviewRef = useRef<HTMLSpanElement>(null);
  const singleValueInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const prevSelectedPathRef = useRef<string>('');

  // Calculate selected value
  const selectedValue = rootValue === null ? null :
    (selectedPath.length === 0 ? rootValue : getValueAtPath(rootValue, selectedPath));

  // Determine if we're editing a single value (not object/array)
  const isSingleValue = selectedValue !== undefined &&
    selectedValue !== null &&
    typeof selectedValue !== 'object';

  // Determine if selected value is complex (object or array)
  const isComplex = selectedValue !== null &&
    selectedValue !== undefined &&
    typeof selectedValue === 'object';

  // Handle Cmd/Ctrl + A
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        // If focus is on an input or textarea, let browser handle it natively
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
          return; // Let browser's native select all work
        }

        // In preview mode, select all in preview
        if (mode === 'preview') {
          e.preventDefault();
          // For complex types, use the pre element
          if (isComplex) {
            const pre = previewRef.current;
            if (pre) {
              const range = document.createRange();
              range.selectNodeContents(pre);
              const selection = window.getSelection();
              if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }
          } else {
            // For single values, use the span element
            const span = singleValuePreviewRef.current;
            if (span) {
              const range = document.createRange();
              range.selectNodeContents(span);
              const selection = window.getSelection();
              if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
              }
            }
          }
        } else {
          // In edit mode: only handle if editing a single value
          if (isSingleValue && singleValueInputRef.current) {
            e.preventDefault();
            singleValueInputRef.current.select();
          } else if (!isSingleValue) {
            // Not a single value - prevent default but do nothing
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isSingleValue, isComplex]);

  // Clear selection when switching nodes
  const currentPathKey = JSON.stringify(selectedPath);
  if (prevSelectedPathRef.current !== currentPathKey) {
    prevSelectedPathRef.current = currentPathKey;
    // Path changed - clear selection
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    // Also blur any focused input
    if (singleValueInputRef.current) {
      singleValueInputRef.current.blur();
    }
  }

  const handleSetMode = (newMode: 'edit' | 'preview') => {
    lastEditorMode = newMode;
    setMode(newMode);
  };

  const showFeedback = (action: string, status: 'success' | 'error' = 'success') => {
    setFeedback({ action, status });
    setTimeout(() => setFeedback(null), 1500);
  };

  const handleCopy = async (value: JsonValue) => {
    try {
      const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      await writeText(content);
      showFeedback('copy');
    } catch (error) {
      console.error('Failed to copy:', error);
      showFeedback('copy', 'error');
    }
  };

  const handleCopyCompressed = async (value: JsonValue) => {
    try {
      const content = typeof value === 'string' ? value : JSON.stringify(value);
      await writeText(content);
      showFeedback('compress');
    } catch (error) {
      console.error('Failed to copy compressed:', error);
      showFeedback('compress', 'error');
    }
  };

  // Apply filter expression to the data - must be before any early returns
  const getFilteredValue = useMemo(() => {
    return (value: JsonValue): { result: JsonValue | null; error: string | null } => {
      if (!filterExpr.trim()) {
        return { result: value, error: null };
      }

      // Security: limit expression length to prevent DoS
      if (filterExpr.length > 500) {
        return { result: null, error: 'Expression too long (max 500 chars)' };
      }

      // Security: check for potentially dangerous patterns
      const dangerousPatterns = [
        /eval\s*\(/i,
        /Function\s*\(/i,
        /constructor/i,
        /__proto__/i,
        /prototype/i,
        /process\s*\(/i,
        /require\s*\(/i,
        /import\s*\(/i,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(filterExpr)) {
          return { result: null, error: 'Expression contains forbidden pattern' };
        }
      }

      try {
        // Helper functions for statistics with better precision
        // Convert value to number, handling null/undefined
        const toNum = (b: unknown): number => {
          if (b === null || b === undefined) return 0;
          if (typeof b === 'number') return b;
          if (typeof b === 'string' && !isNaN(Number(b))) return Number(b);
          return 0;
        };

        // Kahan-Babuska-Neumaier summation algorithm for better floating point precision
        // This is an improvement over Kahan's algorithm
        const sum = (arr: unknown[]) => {
          // Safety: limit array size
          if (!Array.isArray(arr) || arr.length > 1000000) {
            console.warn('Array too large for sum operation');
            return 0;
          }
          let s = 0;
          let c = 0; // compensation
          for (const b of arr) {
            const num = toNum(b);
            const t = s + num;
            if (Math.abs(s) >= Math.abs(num)) {
              c += (s - t) + num;
            } else {
              c += (num - t) + s;
            }
            s = t;
          }
          return s + c;
        };
        const avg = (arr: unknown[]) => {
          if (!Array.isArray(arr)) return 0;
          const validNums = arr.filter(b => b !== null && b !== undefined);
          if (!validNums.length) return 0;
          return sum(validNums) / validNums.length;
        };
        const count = (arr: unknown[]) => Array.isArray(arr) ? arr.length : 0;
        const min = (arr: unknown[]) => {
          if (!Array.isArray(arr)) return 0;
          const nums = arr.map(toNum).filter(n => !isNaN(n));
          if (!nums.length) return 0;
          return Math.min(...nums.slice(0, 1000000)); // Limit for spread
        };
        const max = (arr: unknown[]) => {
          if (!Array.isArray(arr)) return 0;
          const nums = arr.map(toNum).filter(n => !isNaN(n));
          if (!nums.length) return 0;
          return Math.max(...nums.slice(0, 1000000)); // Limit for spread
        };
        const unique = (arr: unknown[]) => {
          if (!Array.isArray(arr)) return [];
          return [...new Set(arr)];
        };
        const groupBy = (arr: Record<string, unknown>[], key: string | ((item: Record<string, unknown>) => string)) => {
          if (!Array.isArray(arr)) return {};
          const result: Record<string, Record<string, unknown>[]> = {};
          for (const item of arr) {
            const k = typeof key === 'function' ? key(item) : String(item[key]);
            (result[k] = result[k] || []).push(item);
          }
          return result;
        };

        // Create a safe evaluation context
        // Note: This is intentionally allowing user expressions for data transformation
        // The expression length is limited above to mitigate DoS risk
        const func = new Function('root', 'sum', 'avg', 'count', 'min', 'max', 'unique', 'groupBy', `
          "use strict";
          try {
            const result = ${filterExpr};
            return result;
          } catch (e) {
            throw new Error('Filter error: ' + e.message);
          }
        `);
        const result = func(value, sum, avg, count, min, max, unique, groupBy);

        // Validate result is JSON-serializable
        if (result === undefined) {
          return { result: null, error: null };
        }

        // Check if result is a valid JSON value (not a function, etc.)
        if (typeof result === 'function') {
          return { result: null, error: 'Result is a function, not JSON data' };
        }

        // Try to serialize to validate it's valid JSON (with size limit)
        try {
          const serialized = JSON.stringify(result);
          if (serialized === undefined) {
            return { result: null, error: 'Result cannot be serialized to JSON' };
          }
          // Limit result size to 10MB
          if (serialized.length > 10 * 1024 * 1024) {
            return { result: null, error: 'Result too large (max 10MB)' };
          }
        } catch {
          return { result: null, error: 'Result contains circular reference' };
        }

        return { result, error: null };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        return { result: null, error: errorMsg };
      }
    };
  }, [filterExpr]);

  if (rootValue === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-2">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm">No JSON loaded</span>
      </div>
    );
  }

  if (selectedValue === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-2">
        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239L7.47 5.47a1 1 0 01-.828.99L3.47 6.47m12.141 14.829l-.47-3.23a1 1 0 01.828-.99l3.172-.47" />
        </svg>
        <span className="text-sm">Select a node to edit</span>
      </div>
    );
  }

  const type = getValueType(selectedValue);

  const filteredResult = mode === 'preview' && isComplex ? getFilteredValue(selectedValue) : { result: selectedValue, error: null };
  const displayValue = filteredResult.error ? selectedValue : filteredResult.result;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--bg-primary)]" style={{ fontSize: `${fontSize}px` }}>
      <div className="flex items-center justify-between px-3 py-1 border-b border-[var(--border-light)] bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] gap-2">
        <div className="flex items-center gap-2 text-[var(--text-primary)] truncate flex-1">
          <svg className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-xs font-medium">Path:</span>
          <span className="text-xs font-mono text-[var(--syntax-key)]">
            {selectedPath.length === 0 ? 'root' : selectedPath.join(' → ')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => handleCopyCompressed(selectedValue)}
            className={`btn ${feedback?.action === 'compress' ? (feedback.status === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'btn-default'}`}
            title="Copy compressed JSON"
          >
            {feedback?.action === 'compress' ? (feedback.status === 'success' ? 'Copied!' : 'Failed') : 'Compress'}
          </button>
          <button
            onClick={() => handleCopy(selectedValue)}
            className={`btn ${feedback?.action === 'copy' ? (feedback.status === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'btn-default'}`}
            title="Copy formatted JSON"
          >
            {feedback?.action === 'copy' ? (feedback.status === 'success' ? 'Copied!' : 'Failed') : 'Copy'}
          </button>
          <div className="w-px h-4 bg-[var(--border-default)]" />
          <button
            onClick={() => handleSetMode('edit')}
            className={`btn ${mode === 'edit' ? 'btn-primary' : 'btn-default'}`}
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button
            onClick={() => handleSetMode('preview')}
            className={`btn ${mode === 'preview' ? 'btn-primary' : 'btn-default'}`}
          >
            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview
          </button>
        </div>
      </div>
      {mode === 'preview' && isComplex && (
        <div className="px-3 py-1 border-b border-[var(--border-light)] bg-[var(--bg-secondary)]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-secondary)] font-medium flex-shrink-0">Filter:</span>
            <input
              type="text"
              value={filterExpr}
              onChange={(e) => setFilterExpr(e.target.value.trimStart())}
              placeholder="e.g. groupBy(root, x => x.status), unique(root.map(x => x.category)), root.filter(x => x.active), sum(root.map(x => x.price))"
              className="input flex-1 font-mono"
            />
          </div>
          {filteredResult.error && (
            <div className="text-xs text-red-500 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {filteredResult.error}
            </div>
          )}
          {filterExpr.trim() && !filteredResult.error && filteredResult.result !== null && (
            <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Filter applied. Result: {Array.isArray(filteredResult.result) ? `${filteredResult.result.length} items` : typeof filteredResult.result === 'object' ? `${Object.keys(filteredResult.result as object).length} keys` : 'value'}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto p-3 flex flex-col min-h-0">
        {mode === 'preview' ? (
          isComplex ? (
            (() => {
              try {
                if (displayValue === null) {
                  return <div className="text-[var(--text-muted)] italic">No result</div>;
                }
                // Check if it's an array with more than 100 items
                const isArray = Array.isArray(displayValue);
                const arrayLength = isArray ? displayValue.length : 0;
                const usePreTag = isArray && arrayLength > 100;

                const jsonStr = JSON.stringify(displayValue, null, 2);

                if (usePreTag) {
                  // For large arrays (>100), use simple pre tag for better performance
                  return (
                    <pre ref={previewRef} className="font-mono whitespace-pre-wrap break-all">
                      {jsonStr}
                    </pre>
                  );
                }

                return (
                  <pre ref={previewRef} className="font-mono whitespace-pre-wrap break-all">
                    {highlightJson(jsonStr)}
                  </pre>
                );
              } catch {
                return <div className="text-[var(--text-muted)] italic">Result cannot be displayed</div>;
              }
            })()
          ) : (
            <span ref={singleValuePreviewRef} className="font-mono">
              {String(selectedValue)}
            </span>
          )
        ) : (
          <>
            {type === 'object' && (
              <ObjectEditor
                value={selectedValue as Record<string, JsonValue>}
                path={selectedPath}
                onUpdate={onUpdate}
                onAddProperty={onAddProperty}
                onRemoveProperty={onRemoveProperty}
                fontSize={fontSize}
              />
            )}
            {type === 'array' && (
              <ArrayEditor
                value={selectedValue as JsonValue[]}
                path={selectedPath}
                onUpdate={onUpdate}
                onInsert={onInsert}
                onRemove={onRemove}
                fontSize={fontSize}
              />
            )}
            {type !== 'object' && type !== 'array' && (
              <div className="flex items-center gap-1">
                <span className="font-medium text-[var(--syntax-key)]">Value:</span>
                <div className="flex-1">
                  <ValueEditor
                    value={selectedValue}
                    path={selectedPath}
                    onUpdate={onUpdate}
                    singleValueRef={singleValueInputRef}
                  />
                </div>
                <button
                  onClick={() => onUpdate(selectedPath, null)}
                  className="btn btn-danger btn-row-action flex-shrink-0"
                  title="Set to null"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
