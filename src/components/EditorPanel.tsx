import { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { JsonValue } from '../utils/jsonUtils';
import { getValueType, getValueAtPath } from '../utils/jsonUtils';
import { AutoResizeTextarea } from './AutoResizeTextarea';

// Pagination configuration
const PAGE_SIZE = 50; // Items per page
const VIRTUAL_THRESHOLD = 100; // Use virtual scrolling above this threshold

// JSON syntax highlighter - memoized result type
interface HighlightCache {
  json: string;
  result: ReactNode;
}

// Module-level cache for highlight results
let highlightCache: HighlightCache | null = null;

// JSON syntax highlighter with caching
function highlightJson(json: string): ReactNode {
  // Check cache
  if (highlightCache && highlightCache.json === json) {
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
      parts.push(<span key={key++} className="text-blue-600">{keyStr}</span>);
      parts.push(<span key={key++}>:</span>);
    } else if (strValue !== undefined) {
      // String value
      parts.push(<span key={key++} className="text-green-600">{strValue}</span>);
    } else if (numValue !== undefined) {
      // Number
      parts.push(<span key={key++} className="text-purple-600">{numValue}</span>);
    } else if (boolValue !== undefined) {
      // Boolean or null
      parts.push(<span key={key++} className="text-orange-600">{boolValue}</span>);
    } else if (bracket !== undefined) {
      // Brackets
      parts.push(<span key={key++} className="text-gray-500">{bracket}</span>);
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

  // Cache result
  const result = parts;
  highlightCache = { json, result };
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
        className="px-1 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-400"
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
      <span className="text-gray-500">
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

  const handleAdd = () => {
    if (newKey.trim() && !(newKey.trim() in value)) {
      onAddProperty(path, newKey.trim(), null);
      setNewKey('');
    }
  };

  return (
    <div className="space-y-2 overflow-x-auto max-w-full">
      {entries.length === 0 ? (
        <div className="text-slate-400 italic text-sm py-4 text-center">Empty object</div>
      ) : (
        entries.map(([key, val]) => (
          <div key={key} className="flex items-center gap-2 min-w-0 group">
            <span className="font-semibold text-blue-600 w-32 truncate flex-shrink-0 text-sm">
              {key}
            </span>
            <span className="text-slate-400">:</span>
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
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200">
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
  );
}

function ArrayEditor({ value, path, onUpdate, onInsert, onRemove, fontSize }: ArrayEditorProps) {
  // Virtual scrolling state (only used when length >= VIRTUAL_THRESHOLD)
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(Math.min(PAGE_SIZE, value.length));
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if we should use virtual scrolling
  const useVirtualScrolling = value.length >= VIRTUAL_THRESHOLD;

  // Adjust indices only when array length changes
  const prevLengthRef = useRef(value.length);
  if (prevLengthRef.current !== value.length) {
    const oldLength = prevLengthRef.current;
    const newLength = value.length;
    prevLengthRef.current = newLength;

    if (newLength >= VIRTUAL_THRESHOLD) {
      if (newLength < oldLength) {
        // Items deleted - adjust indices to stay valid
        setEndIndex((prev) => Math.min(prev, newLength));
        setStartIndex((prev) => Math.min(prev, Math.max(0, newLength - PAGE_SIZE)));
      } else if (newLength > oldLength) {
        // Items added - extend window to show new items
        setEndIndex((prev) => {
          // If viewing near the end, extend to include new items
          if (prev >= oldLength - PAGE_SIZE) {
            return newLength;
          }
          return prev;
        });
      }
    }
  }

  // Check if all items are objects with same keys for table view
  const isTableMode = value.length > 0 && value.every(
    (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
  );

  // Scroll event handler for virtual scrolling
  useEffect(() => {
    if (!useVirtualScrolling) return;

    const container = containerRef.current;
    if (!container) return;

    // Find the scrollable parent
    let scrollParent: HTMLElement | null = container;
    while (scrollParent && !(scrollParent.classList.contains('overflow-auto') && scrollParent.scrollHeight > scrollParent.clientHeight)) {
      scrollParent = scrollParent.parentElement;
    }
    if (!scrollParent) scrollParent = window as unknown as HTMLElement;

    const handleScroll = () => {
      const scrollTop = 'scrollTop' in scrollParent! ? scrollParent.scrollTop : window.scrollY;
      const scrollHeight = 'scrollHeight' in scrollParent! ? scrollParent.scrollHeight : document.documentElement.scrollHeight;
      const clientHeight = 'clientHeight' in scrollParent! ? scrollParent.clientHeight : window.innerHeight;

      // Load more at bottom
      if (scrollTop + clientHeight >= scrollHeight - 3 && endIndex < value.length) {
        setEndIndex((prev) => {
          const newEnd = Math.min(prev + PAGE_SIZE, value.length);
          if (newEnd - startIndex > PAGE_SIZE * 2) {
            setStartIndex((prevStart) => Math.min(prevStart + PAGE_SIZE, newEnd - PAGE_SIZE));
          }
          return newEnd;
        });
      }

      // Load more at top
      if (scrollTop <= 3 && startIndex > 0) {
        setStartIndex((prev) => {
          const newStart = Math.max(prev - PAGE_SIZE, 0);
          if (endIndex - newStart > PAGE_SIZE * 2) {
            setEndIndex((prevEnd) => Math.max(prevEnd - PAGE_SIZE, newStart + PAGE_SIZE));
          }
          return newStart;
        });
      }
    };

    const target = scrollParent === (window as unknown as HTMLElement) ? window : scrollParent;
    target.addEventListener('scroll', handleScroll);
    return () => target.removeEventListener('scroll', handleScroll);
  }, [startIndex, endIndex, value.length, useVirtualScrolling]);

  // Simple pagination for non-virtual mode
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const simplePrevLengthRef = useRef(value.length);

  // Adjust visible count when array length changes (for simple pagination)
  if (!useVirtualScrolling) {
    const oldLength = simplePrevLengthRef.current;
    if (oldLength !== value.length) {
      simplePrevLengthRef.current = value.length;
      // Only reset if length decreased
      if (value.length < oldLength) {
        setVisibleCount(Math.min(PAGE_SIZE, value.length));
      }
    }
  }

  // IntersectionObserver for non-virtual mode
  useEffect(() => {
    if (useVirtualScrolling) return;

    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && visibleCount < value.length) {
          setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, value.length));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleCount, value.length, useVirtualScrolling]);

  // Visible items
  const visibleItems = useVirtualScrolling
    ? value.slice(startIndex, endIndex)
    : value.slice(0, visibleCount);
  const hasMore = useVirtualScrolling ? endIndex < value.length : visibleCount < value.length;
  const hasMoreTop = useVirtualScrolling && startIndex > 0;

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

    // Calculate actual index for virtual scrolling
    const getActualIndex = (localIndex: number) =>
      useVirtualScrolling ? startIndex + localIndex : localIndex;

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
      <div ref={containerRef} className="overflow-auto max-w-full">
        {useVirtualScrolling && hasMoreTop && (
          <div
            onClick={loadPrevPage}
            className="text-center py-2 text-slate-400 text-xs border-b border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-slate-600"
          >
            ↑ 点击加载上一页 (显示 {startIndex} - {endIndex} / {value.length} 项)
          </div>
        )}
        <table className="border-collapse w-full" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr className="bg-slate-50">
              <th className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap text-xs">#</th>
              {keys.map((key, keyIndex) => (
                <th key={key} className={`border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-blue-600 whitespace-nowrap text-xs ${keyIndex < keys.length - 1 ? 'border-r' : ''}`}>
                  {key}
                </th>
              ))}
              <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap text-xs">操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item, localIndex) => {
              const actualIndex = getActualIndex(localIndex);
              return (
                <tr key={actualIndex} className="hover:bg-slate-50 transition-colors group">
                  <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-400 whitespace-nowrap text-xs font-mono">{actualIndex}</td>
                  {keys.map((key, keyIndex) => (
                    <td key={key} className={`border-b border-slate-200 px-2 py-1.5 min-w-0 ${keyIndex < keys.length - 1 ? 'border-r' : ''}`}>
                      <ValueEditor
                        value={(item as Record<string, JsonValue>)[key]}
                        path={[...path, actualIndex, key]}
                        onUpdate={onUpdate}
                        fontSize={fontSize}
                      />
                    </td>
                  ))}
                  <td className="border-b border-slate-200 px-2 py-1.5 whitespace-nowrap">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onInsert(path, actualIndex + 1, createEmptyItem())}
                        className="btn btn-success btn-row-action"
                        title="在下方插入行"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onRemove(path, actualIndex)}
                        className="btn btn-danger btn-row-action"
                        title="删除此行"
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
        {useVirtualScrolling ? (
          hasMore && (
            <div
              onClick={loadNextPage}
              className="text-center py-2 text-slate-400 text-xs cursor-pointer hover:bg-slate-100 hover:text-slate-600"
            >
              点击加载下一页... (显示 {startIndex} - {endIndex} / {value.length} 项)
            </div>
          )
        ) : (
          hasMore && (
            <div ref={loadMoreRef} className="text-center py-2 text-slate-400 text-xs">
              已加载 {visibleCount} / {value.length} 项，下拉加载更多...
            </div>
          )
        )}
        <button
          onClick={() => onInsert(path, value.length, createEmptyItem())}
          className="btn btn-success mt-2"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Row
        </button>
      </div>
    );
  }

  // Simple array view
  // Calculate actual index for virtual scrolling
  const getActualIndex = (localIndex: number) =>
    useVirtualScrolling ? startIndex + localIndex : localIndex;

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
    <div ref={containerRef} className="overflow-auto max-w-full">
      {useVirtualScrolling && hasMoreTop && (
        <div
          onClick={loadPrevPage}
          className="text-center py-2 text-slate-400 text-xs border-b border-slate-100 cursor-pointer hover:bg-slate-100 hover:text-slate-600"
        >
          ↑ 点击加载上一页 (显示 {startIndex} - {endIndex} / {value.length} 项)
        </div>
      )}
      <table className="border-collapse w-full" style={{ minWidth: 'max-content' }}>
        <thead>
          <tr className="bg-slate-50">
            <th className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap text-xs">#</th>
            <th className="border-b border-r border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap text-xs">Value</th>
            <th className="border-b border-slate-200 px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap text-xs">操作</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, localIndex) => {
            const actualIndex = getActualIndex(localIndex);
            return (
              <tr key={actualIndex} className="hover:bg-slate-50 transition-colors">
                <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-400 whitespace-nowrap text-xs font-mono">{actualIndex}</td>
                <td className="border-b border-r border-slate-200 px-2 py-1.5 min-w-0">
                  <ValueEditor
                    value={item}
                    path={[...path, actualIndex]}
                    onUpdate={onUpdate}
                    fontSize={fontSize}
                  />
                </td>
                <td className="border-b border-slate-200 px-2 py-1.5 whitespace-nowrap">
                  <div className="flex gap-1">
                    <button
                      onClick={() => onInsert(path, actualIndex + 1, null)}
                      className="btn btn-success btn-row-action"
                      title="在下方插入项"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onRemove(path, actualIndex)}
                      className="btn btn-danger btn-row-action"
                      title="删除此项"
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
      {useVirtualScrolling ? (
        hasMore && (
          <div
            onClick={loadNextPage}
            className="text-center py-2 text-slate-400 text-xs cursor-pointer hover:bg-slate-100 hover:text-slate-600"
          >
            点击加载下一页... (显示 {startIndex} - {endIndex} / {value.length} 项)
          </div>
        )
      ) : (
        hasMore && (
          <div ref={loadMoreRef} className="text-center py-2 text-slate-400 text-xs">
            已加载 {visibleCount} / {value.length} 项，下拉加载更多...
          </div>
        )
      )}
      <button
        onClick={() => onInsert(path, value.length, null)}
        className="btn btn-success mt-2"
      >
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Item
      </button>
    </div>
  );
}

export const EditorPanel = memo(function EditorPanel({ rootValue, selectedPath, onUpdate, onInsert, onRemove, onAddProperty, onRemoveProperty, fontSize = 14 }: EditorPanelProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>(lastEditorMode);
  const [copied, setCopied] = useState<'none' | 'copy' | 'compress'>('none');
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

  const handleCopy = async (value: JsonValue) => {
    try {
      const content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      await writeText(content);
      setCopied('copy');
      setTimeout(() => setCopied('none'), 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleCopyCompressed = async (value: JsonValue) => {
    try {
      const content = typeof value === 'string' ? value : JSON.stringify(value);
      await writeText(content);
      setCopied('compress');
      setTimeout(() => setCopied('none'), 1500);
    } catch (error) {
      console.error('Failed to copy compressed:', error);
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

      try {
        // Helper functions for statistics
        const sum = (arr: (number | string)[]) => arr.reduce((a: number, b) => {
          const num = typeof b === 'number' ? b : (typeof b === 'string' && !isNaN(Number(b)) ? Number(b) : 0);
          return a + num;
        }, 0);
        const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const count = (arr: unknown[]) => arr.length;
        const min = (arr: number[]) => arr.length ? Math.min(...arr) : 0;
        const max = (arr: number[]) => arr.length ? Math.max(...arr) : 0;
        const unique = (arr: unknown[]) => [...new Set(arr)];
        const groupBy = (arr: Record<string, unknown>[], key: string | ((item: Record<string, unknown>) => string)) => {
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

        // Try to serialize to validate it's valid JSON
        const serialized = JSON.stringify(result);
        if (serialized === undefined) {
          return { result: null, error: 'Result cannot be serialized to JSON' };
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
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm">No JSON loaded</span>
      </div>
    );
  }

  if (selectedValue === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
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
    <div className="h-full flex flex-col overflow-hidden bg-white" style={{ fontSize: `${fontSize}px` }}>
      <div className="flex items-center justify-between px-3 py-1 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white gap-2">
        <div className="flex items-center gap-2 text-slate-600 truncate flex-1">
          <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          <span className="text-xs font-medium">Path:</span>
          <span className="text-xs font-mono text-blue-600">
            {selectedPath.length === 0 ? 'root' : selectedPath.join(' → ')}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => handleCopyCompressed(selectedValue)}
            className={`btn ${copied === 'compress' ? 'btn-primary' : 'btn-default'}`}
            title="复制压缩格式"
          >
            {copied === 'compress' ? 'Copied!' : 'Compress'}
          </button>
          <button
            onClick={() => handleCopy(selectedValue)}
            className={`btn ${copied === 'copy' ? 'btn-primary' : 'btn-default'}`}
            title="复制格式化JSON"
          >
            {copied === 'copy' ? 'Copied!' : 'Copy'}
          </button>
          <div className="w-px h-4 bg-slate-300" />
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
        <div className="px-3 py-1 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium flex-shrink-0">Filter:</span>
            <input
              type="text"
              value={filterExpr}
              onChange={(e) => setFilterExpr(e.target.value.trimStart())}
              placeholder="e.g. root.filter(x => x.active), sum(root.map(x => x.price))"
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
      <div className="flex-1 overflow-auto p-3">
        {mode === 'preview' ? (
          isComplex ? (
            (() => {
              try {
                if (displayValue === null) {
                  return <div className="text-gray-400 italic">No result</div>;
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
                return <div className="text-gray-400 italic">Result cannot be displayed</div>;
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
                <span className="font-medium text-blue-600">Value:</span>
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
