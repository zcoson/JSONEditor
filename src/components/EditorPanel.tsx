import { memo, useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { JsonValue } from '../utils/jsonUtils';
import { getValueType, getValueAtPath } from '../utils/jsonUtils';
import { AutoResizeTextarea } from './AutoResizeTextarea';

// JSON syntax highlighter
function highlightJson(json: string): ReactNode {
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

  return parts;
}

// Module-level variable to remember the last mode in this session
let lastEditorMode: 'edit' | 'preview' = 'preview';

interface EditorPanelProps {
  rootValue: JsonValue | null;
  selectedPath: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  fontSize?: number;
}

interface ObjectEditorProps {
  value: Record<string, JsonValue>;
  path: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  fontSize?: number;
}

interface ArrayEditorProps {
  value: JsonValue[];
  path: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  fontSize?: number;
}

function ValueEditor({
  value,
  path,
  onUpdate,
  fontSize,
}: {
  value: JsonValue;
  path: (string | number)[];
  onUpdate: (path: (string | number)[], newValue: JsonValue) => void;
  fontSize?: number;
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
        value={strValue}
        onChange={(newValue) => onUpdate(path, newValue)}
        fontSize={fontSize}
      />
    );
  }

  return (
    <input
      type="number"
      value={strValue}
      onChange={handleChange}
      className="w-full max-w-md px-1 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

function ObjectEditor({ value, path, onUpdate, fontSize }: ObjectEditorProps) {
  const entries = Object.entries(value);

  if (entries.length === 0) {
    return <div className="text-gray-400 italic">Empty object</div>;
  }

  return (
    <div className="space-y-1 overflow-x-auto max-w-full">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-1 min-w-0">
          <span className="font-medium text-blue-600 w-28 truncate flex-shrink-0">
            {key}
          </span>
          <span className="text-gray-500">:</span>
          <div className="flex-1 min-w-0">
            <ValueEditor
              value={val}
              path={[...path, key]}
              onUpdate={onUpdate}
              fontSize={fontSize}
            />
          </div>
          <button
            onClick={() => onUpdate([...path, key], null)}
            className="px-1 py-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
            style={{ fontSize: '1.5em' }}
            title="Set to null"
          >
            ⊘
          </button>
        </div>
      ))}
    </div>
  );
}

function ArrayEditor({ value, path, onUpdate, fontSize }: ArrayEditorProps) {
  if (value.length === 0) {
    return <div className="text-gray-400 italic">Empty array</div>;
  }

  // Check if all items are objects with same keys for table view
  const isTableMode = value.every(
    (item) => typeof item === 'object' && item !== null && !Array.isArray(item)
  );

  if (isTableMode) {
    const allKeys = new Set<string>();
    value.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        Object.keys(item).forEach((k) => allKeys.add(k));
      }
    });
    const keys = Array.from(allKeys);

    return (
      <div className="overflow-auto max-w-full">
        <table className="border-collapse" style={{ minWidth: 'max-content' }}>
          <thead>
            <tr className="bg-gray-100">
              <th className="border-b border-r border-gray-300 px-1 py-0.5 text-left font-medium whitespace-nowrap">#</th>
              {keys.map((key, keyIndex) => (
                <th key={key} className={`border-b border-gray-300 px-1 py-0.5 text-left font-medium text-blue-600 whitespace-nowrap ${keyIndex < keys.length - 1 ? 'border-r' : ''}`}>
                  {key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="border-b border-r border-gray-300 px-1 py-0.5 text-gray-500 whitespace-nowrap">{index}</td>
                {keys.map((key, keyIndex) => (
                  <td key={key} className={`border-b border-gray-300 px-1 py-0.5 min-w-0 ${keyIndex < keys.length - 1 ? 'border-r' : ''}`}>
                    <ValueEditor
                      value={(item as Record<string, JsonValue>)[key]}
                      path={[...path, index, key]}
                      onUpdate={onUpdate}
                      fontSize={fontSize}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Simple array view
  return (
    <div className="overflow-auto max-w-full">
      <table className="border-collapse" style={{ minWidth: 'max-content' }}>
        <thead>
          <tr className="bg-gray-100">
            <th className="border-b border-r border-gray-300 px-1 py-0.5 text-left font-medium whitespace-nowrap">#</th>
            <th className="border-b border-gray-300 px-1 py-0.5 text-left font-medium whitespace-nowrap">Value</th>
          </tr>
        </thead>
        <tbody>
          {value.map((item, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="border-b border-r border-gray-300 px-1 py-0.5 text-gray-500 whitespace-nowrap">{index}</td>
              <td className="border-b border-gray-300 px-1 py-0.5 min-w-0">
                <ValueEditor
                  value={item}
                  path={[...path, index]}
                  onUpdate={onUpdate}
                  fontSize={fontSize}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const EditorPanel = memo(function EditorPanel({ rootValue, selectedPath, onUpdate, fontSize = 14 }: EditorPanelProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>(lastEditorMode);
  const [copied, setCopied] = useState<'none' | 'copy' | 'compress'>('none');
  const [filterExpr, setFilterExpr] = useState('');
  const previewRef = useRef<HTMLPreElement>(null);

  // Handle Cmd/Ctrl + A to select all in preview mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        const target = e.target as HTMLElement;
        // Only handle if not in an input/textarea and in preview mode
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          const pre = previewRef.current;
          if (pre && mode === 'preview') {
            e.preventDefault();
            const range = document.createRange();
            range.selectNodeContents(pre);
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode]);

  const handleSetMode = (newMode: 'edit' | 'preview') => {
    lastEditorMode = newMode;
    setMode(newMode);
  };

  const handleCopy = async (value: JsonValue) => {
    try {
      const content = JSON.stringify(value, null, 2);
      await writeText(content);
      setCopied('copy');
      setTimeout(() => setCopied('none'), 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleCopyCompressed = async (value: JsonValue) => {
    try {
      const content = JSON.stringify(value);
      await writeText(content);
      setCopied('compress');
      setTimeout(() => setCopied('none'), 1500);
    } catch (error) {
      console.error('Failed to copy compressed:', error);
    }
  };

  if (rootValue === null) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No JSON loaded
      </div>
    );
  }

  const selectedValue = selectedPath.length === 0
    ? rootValue
    : getValueAtPath(rootValue, selectedPath);

  if (selectedValue === undefined) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Select a node to edit
      </div>
    );
  }

  const type = getValueType(selectedValue);
  const isComplex = type === 'object' || type === 'array';

  // Apply filter expression to the data
  const getFilteredValue = (value: JsonValue): { result: JsonValue | null; error: string | null } => {
    if (!filterExpr.trim()) {
      return { result: value, error: null };
    }

    try {
      // Helper functions for statistics
      const sum = (arr: (number | string)[]) => arr.reduce((a: number, b) => {
        const num = typeof b === 'number' ? b : (typeof b === 'string' && !isNaN(Number(b)) ? Number(b) : 0);
        return a + num;
      }, 0);
      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const count = (arr: unknown[]) => arr.length;
      const min = (arr: number[]) => Math.min(...arr);
      const max = (arr: number[]) => Math.max(...arr);
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
      const func = new Function('root', 'sum', 'avg', 'count', 'min', 'max', 'unique', 'groupBy', `
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

  const filteredResult = mode === 'preview' && isComplex ? getFilteredValue(selectedValue) : { result: selectedValue, error: null };
  const displayValue = filteredResult.error ? selectedValue : filteredResult.result;

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ fontSize: `${fontSize}px` }}>
      <div className="flex items-center justify-between px-2 py-1 border-b bg-gray-50 gap-2">
        <div className="text-gray-500 truncate flex-1">
          Path: {selectedPath.length === 0 ? 'root' : selectedPath.join(' → ')}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => handleCopyCompressed(selectedValue)}
            className={`px-1.5 py-0.5 rounded ${copied === 'compress' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            {copied === 'compress' ? 'Copied' : 'Compress'}
          </button>
          <button
            onClick={() => handleCopy(selectedValue)}
            className={`px-1.5 py-0.5 rounded ${copied === 'copy' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            {copied === 'copy' ? 'Copied' : 'Copy'}
          </button>
          {isComplex && (
            <>
              <div className="w-px h-3 bg-gray-300" />
              <button
                onClick={() => handleSetMode('edit')}
                className={`px-1.5 py-0.5 rounded ${mode === 'edit' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                Edit
              </button>
              <button
                onClick={() => handleSetMode('preview')}
                className={`px-1.5 py-0.5 rounded ${mode === 'preview' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                Preview
              </button>
            </>
          )}
        </div>
      </div>
      {mode === 'preview' && isComplex && (
        <div className="px-2 py-1 border-b bg-gray-50">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 flex-shrink-0">Filter:</span>
            <input
              type="text"
              value={filterExpr}
              onChange={(e) => setFilterExpr(e.target.value.trimStart())}
              placeholder="e.g. root.filter(x => x.active), sum(root.map(x => x.price)), avg(root.map(x => x.score))"
              className="flex-1 px-1.5 py-0.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>
          {filteredResult.error && (
            <div className="text-xs text-red-500 mt-0.5">{filteredResult.error}</div>
          )}
          {filterExpr.trim() && !filteredResult.error && filteredResult.result !== null && (
            <div className="text-xs text-green-600 mt-0.5">
              Filter applied. Result: {Array.isArray(filteredResult.result) ? `${filteredResult.result.length} items` : typeof filteredResult.result === 'object' ? `${Object.keys(filteredResult.result as object).length} keys` : 'value'}
            </div>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto p-2">
        {mode === 'preview' && isComplex ? (
          (() => {
            try {
              if (displayValue === null) {
                return <div className="text-gray-400 italic">No result</div>;
              }
              const jsonStr = JSON.stringify(displayValue, null, 2);
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
          <>
            {type === 'object' && (
              <ObjectEditor
                value={selectedValue as Record<string, JsonValue>}
                path={selectedPath}
                onUpdate={onUpdate}
                fontSize={fontSize}
              />
            )}
            {type === 'array' && (
              <ArrayEditor
                value={selectedValue as JsonValue[]}
                path={selectedPath}
                onUpdate={onUpdate}
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
                  />
                </div>
                <button
                  onClick={() => onUpdate(selectedPath, null)}
                  className="px-1 py-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
                  style={{ fontSize: '1.5em' }}
                  title="Set to null"
                >
                  ⊘
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
