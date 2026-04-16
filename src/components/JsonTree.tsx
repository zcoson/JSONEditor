import { useState } from 'react';
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

function TreeNode({
  nodeKey,
  value,
  path,
  depth,
  selectedPath,
  onSelect,
  expandedMap,
  toggleExpand,
  collapseAll,
}: TreeNodeProps) {
  const type = getValueType(value);
  const pathKey = path.join('.');
  const isExpanded = expandedMap.get(pathKey) ?? true;
  const isSelected = JSON.stringify(path) === JSON.stringify(selectedPath);

  const isExpandable = type === 'object' || type === 'array';
  const entries: [string, JsonValue][] = isExpandable
    ? type === 'object'
      ? Object.entries(value as Record<string, JsonValue>)
      : (value as JsonValue[]).map((v, i) => [i.toString(), v])
    : [];

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
        className={`flex items-center py-1 px-2 rounded-md cursor-pointer whitespace-nowrap transition-colors ${
          isSelected
            ? 'bg-blue-50 border border-blue-200'
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
        <span className="font-semibold text-blue-600 truncate">{nodeKey}</span>
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
          {getValuePreview()}
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
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ value, selectedPath, onSelect }: JsonTreeProps) {
  const [expandedMap, setExpandedMap] = useState<Map<string, boolean>>(new Map());

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
    <div
      className="font-mono overflow-auto h-full"
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
      />
    </div>
  );
}
