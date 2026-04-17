import { useState, memo, useMemo, useRef, useEffect, useCallback } from 'react';
import type { JsonValue } from '../utils/jsonUtils';
import { getValueType } from '../utils/jsonUtils';

interface JsonTreeProps {
  value: JsonValue | null;
  selectedPath: (string | number)[];
  onSelect: (path: (string | number)[]) => void;
}

interface TreeNodeProps {
  nodeKey: string;
  value: JsonValue;
  path: (string | number)[];
  depth: number;
  selectedPath: (string | number)[];
  onSelect: (path: (string | number)[]) => void;
  expandedMap: Map<string, boolean>;
  toggleExpand: (path: string) => void;
  collapseAll: (path: (string | number)[], value: JsonValue) => void;
  searchTerm: string;
  matchedPaths: Set<string>;
  selectedNodeRef: React.RefObject<HTMLDivElement | null>;
}

// Helper to collect all paths under a value
function collectAllPaths(value: JsonValue, basePath: (string | number)[]): string[] {
  const type = getValueType(value);
  if (type !== 'object' && type !== 'array') return [];

  const paths: string[] = [];
  const entries: [string, JsonValue][] = type === 'object'
    ? Object.entries(value as Record<string, JsonValue>)
    : (value as JsonValue[]).map((v, i) => [i.toString(), v]);

  for (const [key, val] of entries) {
    const childPath = [...basePath, type === 'array' ? parseInt(key) : key];
    const pathKey = childPath.join('.');
    paths.push(pathKey);
    paths.push(...collectAllPaths(val, childPath));
  }

  return paths;
}

// Helper function to compare paths without JSON.stringify
function pathsEqual(a: (string | number)[], b: (string | number)[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Search JSON and collect matching paths
function searchJson(value: JsonValue, searchTerm: string, basePath: (string | number)[]): Set<string> {
  const matches = new Set<string>();
  if (!searchTerm) return matches;

  const term = searchTerm.toLowerCase();

  // Check value preview
  const type = getValueType(value);
  if (type === 'object') {
    const keys = Object.keys(value as object);
    if (`{ ${keys.length} keys }`.toLowerCase().includes(term)) {
      matches.add(basePath.join('.'));
    }
  } else if (type === 'array') {
    if (`[ ${(value as JsonValue[]).length} items ]`.toLowerCase().includes(term)) {
      matches.add(basePath.join('.'));
    }
  } else if (type === 'string') {
    const str = value as string;
    if (str.toLowerCase().includes(term)) {
      matches.add(basePath.join('.'));
    }
  } else if (type === 'number' || type === 'boolean') {
    if (String(value).toLowerCase().includes(term)) {
      matches.add(basePath.join('.'));
    }
  } else if (type === 'null') {
    if ('null'.includes(term)) {
      matches.add(basePath.join('.'));
    }
  }

  // Recursively search children
  if (type === 'object' || type === 'array') {
    const entries: [string, JsonValue][] = type === 'object'
      ? Object.entries(value as Record<string, JsonValue>)
      : (value as JsonValue[]).map((v, i) => [i.toString(), v]);

    for (const [key, val] of entries) {
      // Check key matches
      if (key.toLowerCase().includes(term)) {
        const childPath = [...basePath, type === 'array' ? parseInt(key) : key];
        matches.add(childPath.join('.'));
      }
      // Check value matches recursively
      const childPath = [...basePath, type === 'array' ? parseInt(key) : key];
      const childMatches = searchJson(val, searchTerm, childPath);
      childMatches.forEach(p => matches.add(p));
    }
  }

  return matches;
}

// Highlight text with search match
function highlightText(text: string, searchTerm: string): React.ReactNode {
  if (!searchTerm) return text;

  const lowerText = text.toLowerCase();
  const term = searchTerm.toLowerCase();
  const index = lowerText.indexOf(term);

  if (index === -1) return text;

  const before = text.slice(0, index);
  const match = text.slice(index, index + searchTerm.length);
  const after = text.slice(index + searchTerm.length);

  return (
    <>
      {before}
      <span className="bg-yellow-200 text-yellow-900 rounded px-0.5">{match}</span>
      {after}
    </>
  );
}

const TreeNode = memo(function TreeNode({
  nodeKey,
  value,
  path,
  depth,
  selectedPath,
  onSelect,
  expandedMap,
  toggleExpand,
  collapseAll,
  searchTerm,
  matchedPaths,
  selectedNodeRef,
}: TreeNodeProps) {
  const type = getValueType(value);
  const pathKey = path.join('.');
  const isExpanded = expandedMap.get(pathKey) ?? true;
  const isSelected = pathsEqual(path, selectedPath);
  const isMatched = matchedPaths.has(pathKey);

  const isExpandable = type === 'object' || type === 'array';
  const entries: [string, JsonValue][] = useMemo(() => {
    if (!isExpandable) return [];
    return type === 'object'
      ? Object.entries(value as Record<string, JsonValue>)
      : (value as JsonValue[]).map((v, i) => [i.toString(), v]);
  }, [isExpandable, type, value]);

  const handleClick = () => {
    onSelect(path);
    // If node is expandable and collapsed, expand it
    if (isExpandable && !isExpanded) {
      toggleExpand(pathKey);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isExpanded) {
      // Collapsing: collapse this node and all children
      collapseAll(path, value);
    } else {
      // Expanding: just expand this node
      toggleExpand(pathKey);
    }
  };

  const getValuePreview = () => {
    if (type === 'object') {
      const keys = Object.keys(value as object);
      return `{ ${keys.length} keys }`;
    }
    if (type === 'array') {
      return `[ ${(value as JsonValue[]).length} items ]`;
    }
    if (type === 'string') {
      const str = value as string;
      return `"${str.length > 30 ? str.slice(0, 30) + '...' : str}"`;
    }
    return String(value);
  };

  return (
    <div className="select-none">
      <div
        ref={isSelected ? selectedNodeRef : null}
        className={`flex items-center py-1 px-2 rounded-md cursor-pointer whitespace-nowrap transition-colors ${
          isSelected
            ? 'bg-blue-50 border border-blue-200'
            : isMatched
            ? 'bg-yellow-50 hover:bg-yellow-100'
            : 'hover:bg-slate-50'
        }`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
      >
        {isExpandable && (
          <span
            className="w-4 h-4 flex-shrink-0 flex items-center justify-center text-slate-400 mr-1 cursor-pointer hover:bg-slate-200 rounded transition-colors"
            onClick={handleToggle}
          >
            {isExpanded ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </span>
        )}
        {!isExpandable && <span className="w-4 flex-shrink-0 mr-1" />}
        <span className="font-semibold text-blue-600 truncate">{highlightText(nodeKey, searchTerm)}</span>
        <span className="text-slate-400 mx-1 flex-shrink-0">:</span>
        <span
          className={`truncate ${
            type === 'string'
              ? 'text-green-600'
              : type === 'number'
              ? 'text-purple-600'
              : type === 'boolean'
              ? 'text-rose-600'
              : type === 'null'
              ? 'text-slate-400 italic'
              : 'text-slate-500'
          }`}
        >
          {highlightText(getValuePreview(), searchTerm)}
        </span>
      </div>
      {isExpandable && isExpanded && (
        <div>
          {entries.map(([key, val]) => {
            const pathKey = type === 'array' ? parseInt(key) : key;
            return (
              <TreeNode
                key={pathKey}
                nodeKey={key}
                value={val}
                path={[...path, pathKey]}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelect={onSelect}
                expandedMap={expandedMap}
                toggleExpand={toggleExpand}
                collapseAll={collapseAll}
                searchTerm={searchTerm}
                matchedPaths={matchedPaths}
                selectedNodeRef={selectedNodeRef}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});

export function JsonTree({ value, selectedPath, onSelect }: JsonTreeProps) {
  const [expandedMap, setExpandedMap] = useState<Map<string, boolean>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);
  const selectedNodeRef = useRef<HTMLDivElement>(null);

  // Compute matched paths based on search term (as ordered array)
  const matchedPathsArray = useMemo(() => {
    if (!value || !searchTerm) return [];
    const matches = searchJson(value, searchTerm, []);
    // Sort paths to maintain consistent order
    return Array.from(matches).sort();
  }, [value, searchTerm]);

  // For backward compatibility, also provide as Set
  const matchedPaths = useMemo(() => new Set(matchedPathsArray), [matchedPathsArray]);

  // Expand all matched paths when searching
  useEffect(() => {
    if (searchTerm && matchedPaths.size > 0) {
      setExpandedMap(prev => {
        const next = new Map(prev);
        // Expand all parent paths of matched nodes
        matchedPaths.forEach(pathStr => {
          const parts = pathStr.split('.');
          // Expand each parent path
          for (let i = 0; i < parts.length; i++) {
            const parentPath = parts.slice(0, i).join('.');
            if (parentPath) {
              next.set(parentPath, true);
            }
          }
        });
        return next;
      });
    }
  }, [searchTerm, matchedPaths]);

  // Navigate to next/previous match
  const navigateMatch = useCallback((direction: 'next' | 'prev') => {
    if (matchedPathsArray.length === 0) return;

    let newIndex = currentMatchIndex;
    if (direction === 'next') {
      newIndex = (currentMatchIndex + 1) % matchedPathsArray.length;
    } else {
      newIndex = (currentMatchIndex - 1 + matchedPathsArray.length) % matchedPathsArray.length;
    }
    setCurrentMatchIndex(newIndex);

    // Parse path and select
    const pathStr = matchedPathsArray[newIndex];
    const path = pathStr.split('.').map(p => {
      const num = parseInt(p);
      return isNaN(num) ? p : num;
    });
    onSelect(path);
  }, [matchedPathsArray, currentMatchIndex, onSelect]);

  // Keyboard shortcut to focus search and navigate matches
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchTerm('');
        setCurrentMatchIndex(0);
        searchInputRef.current?.blur();
      }
      // Enter key to navigate to next match
      if (e.key === 'Enter' && document.activeElement === searchInputRef.current) {
        e.preventDefault();
        if (e.shiftKey) {
          navigateMatch('prev');
        } else {
          navigateMatch('next');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigateMatch]);

  // Scroll selected node into view
  useEffect(() => {
    if (selectedNodeRef.current && treeContainerRef.current) {
      const container = treeContainerRef.current;
      const node = selectedNodeRef.current;

      const containerRect = container.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();

      // Check if node is out of view
      if (nodeRect.top < containerRect.top || nodeRect.bottom > containerRect.bottom) {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }, [selectedPath]);

  const toggleExpand = (pathKey: string) => {
    setExpandedMap((prev) => {
      const next = new Map(prev);
      next.set(pathKey, !(next.get(pathKey) ?? true));
      return next;
    });
  };

  const collapseAll = (path: (string | number)[], nodeValue: JsonValue) => {
    const allPaths = collectAllPaths(nodeValue, path);
    setExpandedMap((prev) => {
      const next = new Map(prev);
      // Collapse the clicked node
      next.set(path.join('.'), false);
      // Collapse all descendants
      for (const p of allPaths) {
        next.set(p, false);
      }
      return next;
    });
  };

  if (value === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm">No JSON loaded</span>
        <span className="text-xs text-slate-300">Paste or drop a JSON file to begin</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="flex items-center gap-2 py-1 px-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0">
        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search... (⌘F)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 text-xs bg-white border border-slate-200 rounded px-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 h-8"
        />
        {searchTerm && (
          <>
            <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
              {matchedPathsArray.length > 0
                ? `${currentMatchIndex + 1}/${matchedPathsArray.length}`
                : 'No match'}
            </span>
            <button
              onClick={() => {
                setSearchTerm('');
                setCurrentMatchIndex(0);
              }}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>
      {/* Tree content */}
      <div
        ref={treeContainerRef}
        className="font-mono overflow-auto flex-1 px-2"
        style={{
          minWidth: 'max-content',
          fontSize: '13px',
          lineHeight: 1.6,
        }}
      >
        <TreeNode
          nodeKey="root"
          value={value}
          path={[]}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
          expandedMap={expandedMap}
          toggleExpand={toggleExpand}
          collapseAll={collapseAll}
          searchTerm={searchTerm}
          matchedPaths={matchedPaths}
          selectedNodeRef={selectedNodeRef}
        />
      </div>
    </div>
  );
}
