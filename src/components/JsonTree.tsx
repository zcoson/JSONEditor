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
        className={`flex items-center py-0.5 px-1 hover:bg-gray-100 cursor-pointer whitespace-nowrap ${
          isSelected ? 'bg-blue-100' : ''
        }`}
        style={{ paddingLeft: depth * 12 + 4 }}
        onClick={handleClick}
      >
        {isExpandable && (
          <span
            className="w-3 h-3 flex-shrink-0 flex items-center justify-center text-gray-500 mr-0.5 cursor-pointer hover:bg-gray-200 rounded"
            onClick={handleToggle}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!isExpandable && <span className="w-3 flex-shrink-0 mr-0.5" />}
        <span className="font-medium text-blue-600 truncate">{nodeKey}</span>
        <span className="text-gray-500 mx-0.5 flex-shrink-0">:</span>
        <span
          className={`truncate ${
            type === 'string'
              ? 'text-green-600'
              : type === 'number'
              ? 'text-purple-600'
              : type === 'boolean'
              ? 'text-orange-600'
              : type === 'null'
              ? 'text-gray-400'
              : 'text-gray-600'
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
      <div className="flex items-center justify-center h-full text-gray-400">
        No JSON loaded
      </div>
    );
  }

  return (
    <div
      className="font-mono overflow-auto h-full"
      style={{
        minWidth: 'max-content',
        fontSize: '14px',
        lineHeight: 1.5,
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
