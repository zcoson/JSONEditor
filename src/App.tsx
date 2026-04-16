import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useJsonState } from './hooks/useJsonState';
import { JsonTree } from './components/JsonTree';
import { EditorPanel } from './components/EditorPanel';
import { Toolbar } from './components/Toolbar';
import { parseJson, getValueAtPath, setValueAtPath } from './utils/jsonUtils';
import type { JsonValue } from './utils/jsonUtils';

interface Column {
  path: (string | number)[];  // Path within this column's JSON
  value: JsonValue | null;     // The JSON value for this column
  titlePath: string;           // Full path for display in title
}

function App() {
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const [fontSize, setFontSize] = useState(16);
  const {
    rawContent,
    jsonValue,
    selectedPath,
    error,
    filePath,
    setSelectedPath,
    updateValue,
    loadJson,
    clear,
    reset,
    undo,
    canUndo,
    hasOriginal,
  } = useJsonState();

  // Update CSS variable for font size
  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`);
  }, [fontSize]);

  // Listen for file drop events from Tauri
  useEffect(() => {
    const unlisten = listen<{ paths: string[] }>('tauri://drag-drop', async (event) => {
      const paths = event.payload.paths;
      if (paths.length > 0) {
        const path = paths[0];
        try {
          const content = await invoke<string>('read_file', { path });
          loadJson(content, path);
        } catch (error) {
          console.error('Failed to read dropped file:', error);
        }
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [loadJson]);

  // Listen for file-opened events (double-click to open)
  useEffect(() => {
    console.log('Setting up file-opened listener');
    const unlisten = listen<string>('file-opened', async (event) => {
      console.log('file-opened event received:', event.payload);
      const path = event.payload;
      try {
        const content = await invoke<string>('read_file', { path });
        console.log('File content loaded, length:', content.length);
        loadJson(content, path);
      } catch (error) {
        console.error('Failed to read opened file:', error);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [loadJson]);

  // Handle keyboard shortcut for save (Cmd+S on macOS, Ctrl+S on Windows/Linux)
  const handleSave = useCallback(async () => {
    if (!rawContent) return;

    try {
      const path = filePath || await save({
        filters: [
          { name: 'JSON', extensions: ['json'] },
        ],
      });

      if (path) {
        await invoke('write_file', { path, content: rawContent });
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [rawContent, filePath]);

  // Handle open file from menu
  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
      });

      if (selected) {
        const content = await invoke<string>('read_file', { path: selected });
        loadJson(content, selected);
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  }, [loadJson]);

  // Listen for menu events
  useEffect(() => {
    const unlistenOpen = listen('menu-open', async () => {
      await handleOpenFile();
    });

    const unlistenSave = listen('menu-save', async () => {
      await handleSave();
    });

    return () => {
      unlistenOpen.then(fn => fn());
      unlistenSave.then(fn => fn());
    };
  }, [handleOpenFile, handleSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + S: Save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Cmd/Ctrl + Z: Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Cmd/Ctrl + V: Paste (when not in an input/textarea)
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          // Import readText dynamically to avoid issues
          import('@tauri-apps/plugin-clipboard-manager').then(({ readText }) => {
            readText().then((text) => {
              if (text) {
                loadJson(text);
              }
            });
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, undo, loadJson]);

  // Columns state: first column is always the root JSON
  const [columns, setColumns] = useState<Column[]>([]);
  const isEditingRef = useRef(false);
  const prevJsonRef = useRef(jsonValue);
  const nestedPathsRef = useRef<(string | number)[][]>([]);

  // Update columns when root JSON or selection changes
  useEffect(() => {
    if (!jsonValue) {
      setColumns([]);
      return;
    }

    const jsonChanged = prevJsonRef.current !== jsonValue;
    prevJsonRef.current = jsonValue;

    // Reset editing flag when selection changes (not json change)
    if (!jsonChanged) {
      isEditingRef.current = false;
    }

    setColumns(() => {
      // Build columns from scratch with current jsonValue
      const newColumns: Column[] = [{ path: [], value: jsonValue, titlePath: 'root' }];

      // Build second column from selectedPath
      if (selectedPath.length > 0) {
        const selectedVal = getValueAtPath(jsonValue, selectedPath);
        if (typeof selectedVal === 'string') {
          const parsed = parseJson(selectedVal);
          if (parsed !== null && typeof parsed === 'object') {
            newColumns.push({ path: [], value: parsed, titlePath: selectedPath.join(' → ') });
          }
        }
      }

      // Build subsequent columns from nestedPaths
      const nestPaths = nestedPathsRef.current;
      for (let i = 0; i < nestPaths.length && newColumns.length > i + 1; i++) {
        const prevColumn = newColumns[i + 1];
        const nestPath = nestPaths[i];
        if (prevColumn?.value && nestPath.length > 0) {
          const selectedVal = getValueAtPath(prevColumn.value, nestPath);
          if (typeof selectedVal === 'string') {
            const parsed = parseJson(selectedVal);
            if (parsed !== null && typeof parsed === 'object') {
              const fullPath = prevColumn.titlePath + ' → ' + nestPath.join(' → ');
              newColumns.push({ path: [], value: parsed, titlePath: fullPath });
            }
          }
        }
      }

      return newColumns;
    });
  }, [jsonValue, selectedPath]);

  // Selected paths for each column (index 0 uses selectedPath from hook)
  const [nestedPaths, setNestedPaths] = useState<(string | number)[][]>([]);

  // Keep nestedPaths in sync with ref
  nestedPathsRef.current = nestedPaths;

  // Rebuild columns when nestedPaths changes
  useEffect(() => {
    if (!jsonValue || nestedPaths.length === 0) return;

    setColumns(prev => {
      if (prev.length <= 1) return prev;

      const newColumns = [...prev];

      // Rebuild columns based on nestedPaths
      for (let i = 0; i < nestedPaths.length && newColumns.length > i + 1; i++) {
        const prevColumn = newColumns[i + 1];
        const nestPath = nestedPaths[i];
        if (prevColumn?.value && nestPath.length > 0) {
          const selectedVal = getValueAtPath(prevColumn.value, nestPath);
          if (typeof selectedVal === 'string') {
            const parsed = parseJson(selectedVal);
            if (parsed !== null && typeof parsed === 'object') {
              const fullPath = prevColumn.titlePath + ' → ' + nestPath.join(' → ');
              if (newColumns.length <= i + 2) {
                newColumns.push({ path: [], value: parsed, titlePath: fullPath });
              } else {
                newColumns[i + 2] = { path: [], value: parsed, titlePath: fullPath };
              }
            }
          }
        }
      }

      // Trim columns if needed
      const expectedLength = 1 + (selectedPath.length > 0 ? 1 : 0) + nestedPaths.filter(p => p.length > 0).length;
      if (newColumns.length > expectedLength) {
        newColumns.splice(expectedLength);
      }

      return newColumns;
    });
  }, [nestedPaths, jsonValue, selectedPath]);

  // Handle selection in a specific column
  const handleSelect = useCallback((columnIndex: number, path: (string | number)[]) => {
    if (columnIndex === 0) {
      // First column uses the main hook
      setSelectedPath(path);
      // Reset nested paths
      setNestedPaths([]);
    } else {
      // Update nested path for this column
      setNestedPaths(prev => {
        const newPaths = [...prev];
        newPaths[columnIndex - 1] = path;
        // Clear paths for columns after this one
        for (let i = columnIndex; i < newPaths.length; i++) {
          newPaths[i] = [];
        }
        return newPaths;
      });

      // Check if this selection is a JSON string - add new column
      const columnValue = columns[columnIndex]?.value;
      const columnTitlePath = columns[columnIndex]?.titlePath;
      if (columnValue) {
        const selectedValue = path.length === 0 ? columnValue : getValueAtPath(columnValue, path);
        if (typeof selectedValue === 'string') {
          const parsed = parseJson(selectedValue);
          if (parsed !== null && typeof parsed === 'object') {
            // Build full path for title
            const fullPath = columnTitlePath + ' → ' + (path.length === 0 ? 'root' : path.join(' → '));

            // Check if this is the last column
            const isLastColumn = columnIndex === columns.length - 1;

            if (isLastColumn) {
              // Last column - add new column
              setColumns(prev => [...prev, { path: [], value: parsed, titlePath: fullPath }]);
            } else {
              // Not last column - replace the next column
              setColumns(prev => {
                const newColumns = [...prev];
                newColumns[columnIndex + 1] = { path: [], value: parsed, titlePath: fullPath };
                // Remove columns after the replaced one
                newColumns.splice(columnIndex + 2);
                return newColumns;
              });
              // Clear nested paths after current column
              setNestedPaths(prev => {
                const newPaths = [...prev];
                newPaths.splice(columnIndex);
                return newPaths;
              });
            }
          } else {
            // Not a valid JSON string - close panels after current column
            setColumns(prev => prev.slice(0, columnIndex + 1));
            setNestedPaths(prev => prev.slice(0, columnIndex));
          }
        } else {
          // Not a string - close panels after current column
          setColumns(prev => prev.slice(0, columnIndex + 1));
          setNestedPaths(prev => prev.slice(0, columnIndex));
        }
      }
    }
  }, [columns, setSelectedPath]);

  // Use refs to avoid recreating handleUpdate callback
  const columnsRef = useRef(columns);
  const selectedPathRef = useRef(selectedPath);
  const updateValueRef = useRef(updateValue);

  columnsRef.current = columns;
  selectedPathRef.current = selectedPath;
  updateValueRef.current = updateValue;

  // Update value in a specific column - stable callback
  const handleUpdate = useCallback((columnIndex: number, path: (string | number)[], newValue: JsonValue) => {
    const cols = columnsRef.current;
    const selPath = selectedPathRef.current;
    const nestPaths = nestedPathsRef.current;
    const updateVal = updateValueRef.current;

    // Mark as editing to prevent column reset
    isEditingRef.current = true;

    if (columnIndex === 0) {
      updateVal(path, newValue);
    } else {
      // Update nested JSON string
      const column = cols[columnIndex];
      if (!column?.value) return;

      const updated = path.length === 0
        ? newValue
        : setValueAtPath(column.value, path, newValue);

      // Build the chain of updated values from current column up to root
      const updateChain: { index: number; value: JsonValue }[] = [{ index: columnIndex, value: updated }];

      // Convert back to string for parent column
      let currentStringValue = JSON.stringify(updated);
      let currentColumnIndex = columnIndex;

      // Walk up the chain, updating each parent column
      while (currentColumnIndex > 0) {
        currentColumnIndex--;

        if (currentColumnIndex === 0) {
          // Update root via selectedPath
          updateChain.push({ index: 0, value: setValueAtPath(cols[0].value!, selPath, currentStringValue) });
          updateVal(selPath, currentStringValue);
        } else {
          // Update intermediate column
          const parentPath = nestPaths[currentColumnIndex - 1] || [];
          const parentColumn = cols[currentColumnIndex];
          if (!parentColumn?.value) break;

          const parentUpdated = parentPath.length === 0
            ? currentStringValue
            : setValueAtPath(parentColumn.value, parentPath, currentStringValue);

          updateChain.push({ index: currentColumnIndex, value: parentUpdated });
          currentStringValue = JSON.stringify(parentUpdated);
        }
      }

      // Apply all column updates at once
      setColumns(prev => {
        const newColumns = [...prev];
        for (const { index, value } of updateChain) {
          if (newColumns[index]) {
            newColumns[index] = { ...newColumns[index], value };
          }
        }
        return newColumns;
      });
    }
  }, []);

  // Build panels
  const panels = useMemo(() => {
    return columns.map((column, index) => {
      const isFirst = index === 0;
      const selectedPathForColumn = isFirst ? selectedPath : (nestedPaths[index - 1] || []);

      return (
        <div key={index} className="flex flex-col overflow-hidden h-full">
          <div className="px-2 py-1 bg-gray-50 border-b text-xs font-medium text-gray-600 truncate" title={column.titlePath}>
            {column.titlePath}
          </div>
          <div className="flex-1 overflow-auto p-1">
            <JsonTree
              value={column.value}
              selectedPath={selectedPathForColumn}
              onSelect={(path) => handleSelect(index, path)}
            />
          </div>
        </div>
      );
    });
  }, [columns, selectedPath, nestedPaths, handleSelect]);

  // Editor panel - don't use useMemo, let EditorPanel handle its own memoization
  const lastColumnIndex = columns.length - 1;
  const editPath = lastColumnIndex === 0 ? selectedPath : (nestedPaths[lastColumnIndex - 1] || []);
  const lastColumnValue = columns[lastColumnIndex]?.value ?? null;

  const editorPanel = columns.length === 0 ? null : (
    <div className="flex flex-col overflow-hidden h-full">
      <div className="px-2 py-1 bg-gray-50 border-b text-xs font-medium text-gray-600">
        Editor
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorPanel
          rootValue={lastColumnValue}
          selectedPath={editPath}
          onUpdate={(path, newValue) => handleUpdate(lastColumnIndex, path, newValue)}
          fontSize={fontSize}
        />
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-white">
      <Toolbar
        rawContent={rawContent}
        filePath={filePath}
        onLoadJson={loadJson}
        onClear={clear}
        onReset={reset}
        onUndo={undo}
        canUndo={canUndo}
        hasOriginal={hasOriginal}
        layout={layout}
        onLayoutChange={setLayout}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
      />

      {error && (
        <div className="px-2 py-1 bg-red-100 text-red-700 text-xs">
          {error}
        </div>
      )}

      <MultiColumnPanels
        layout={layout}
        panels={panels}
        editorPanel={editorPanel}
      />
    </div>
  );
}

// Multi-column resizable panels
function MultiColumnPanels({
  layout,
  panels,
  editorPanel,
}: {
  layout: 'horizontal' | 'vertical';
  panels: React.ReactNode[];
  editorPanel: React.ReactNode;
}) {
  // Editor panel (last) should take majority (70%), first panel takes 30%
  const [sizes, setSizes] = useState<number[]>([30, 70]);

  // Adjust sizes when panel count changes
  useEffect(() => {
    const newCount = panels.length + 1;
    if (sizes.length !== newCount) {
      setSizes(prev => {
        if (newCount > prev.length) {
          // New panel added - first panel smaller, editor takes majority
          const editorSize = 60;
          const firstPanelSize = 10; // First panel gets fixed small size
          const remainingForMiddle = 100 - editorSize - firstPanelSize;
          const middleCount = newCount - 2; // Panels between first and editor

          const newSizes: number[] = [];

          if (middleCount > 0) {
            // First panel: 10%, middle panels: split remaining, editor: 60%
            newSizes.push(firstPanelSize);
            const eachMiddleSize = remainingForMiddle / middleCount;
            for (let i = 0; i < middleCount; i++) {
              newSizes.push(eachMiddleSize);
            }
            newSizes.push(editorSize);
          } else {
            // Only first panel and editor
            newSizes.push(100 - editorSize);
            newSizes.push(editorSize);
          }

          return newSizes;
        } else {
          // Panel removed - editor gets 70%, remaining 30% split among others
          const editorSize = 70;
          const remainingForOthers = 100 - editorSize;
          const otherCount = newCount - 1;

          if (otherCount === 0) {
            return [100];
          }

          const eachOtherSize = remainingForOthers / otherCount;
          const newSizes = Array(newCount).fill(eachOtherSize);
          newSizes[newCount - 1] = editorSize;
          return newSizes;
        }
      });
    }
  }, [panels.length, sizes.length]);

  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef<number | null>(null);

  const handleMouseDown = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    isDragging.current = index;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging.current === null || !containerRef.current) return;
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const total = layout === 'horizontal' ? rect.width : rect.height;
    const pos = layout === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top;

    setSizes(prev => {
      const newSizes = [...prev];
      const dragIndex = isDragging.current!;

      // Calculate new size for the dragged panel
      let accumulated = 0;
      for (let i = 0; i < dragIndex; i++) {
        accumulated += prev[i];
      }

      const newSize = Math.min(Math.max((pos / total) * 100 - accumulated, 10), 80);
      const diff = newSize - prev[dragIndex];

      // Apply change
      newSizes[dragIndex] = newSize;
      if (dragIndex + 1 < newSizes.length) {
        newSizes[dragIndex + 1] = Math.max(10, prev[dragIndex + 1] - diff);
      }

      return newSizes;
    });
  }, [layout]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = null;
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const sizeProp = layout === 'vertical' ? 'height' : 'width';
  const allPanels = [...panels, editorPanel];

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex ${layout === 'vertical' ? 'flex-col' : 'flex-row'} overflow-hidden`}
    >
      {allPanels.map((panel, index) => (
        <div key={index} className="contents">
          <div
            className={`flex flex-col overflow-hidden ${index < allPanels.length - 1 ? (layout === 'vertical' ? 'border-b' : 'border-r') : ''}`}
            style={{ [sizeProp]: `${sizes[index]}%` }}
          >
            {panel}
          </div>
          {index < allPanels.length - 1 && (
            <div
              className={`${layout === 'vertical' ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'} bg-gray-200 hover:bg-blue-400 transition-colors flex-shrink-0`}
              onMouseDown={(e) => handleMouseDown(e, index)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default App;