import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useJsonState } from './hooks/useJsonState';
import { useTheme } from './hooks/useTheme';
import { JsonTree } from './components/JsonTree';
import { EditorPanel } from './components/EditorPanel';
import { Toolbar } from './components/Toolbar';
import { ZipEntryDialog } from './components/ZipEntryDialog';
import { parseJson, getValueAtPath, setValueAtPath } from './utils/jsonUtils';
import type { JsonValue } from './utils/jsonUtils';

interface Column {
  path: (string | number)[];  // Path within this column's JSON
  value: JsonValue | null;     // The JSON value for this column
  titlePath: string;           // Full path for display in title
}

interface ZipEntry {
  name: string;
  original_name: string;
  index: number;
  is_json: boolean;
}

function App() {
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const [fontSize, setFontSize] = useState(16);
  const { theme, setTheme } = useTheme();
  const {
    rawContent,
    jsonValue,
    selectedPath,
    error,
    filePath,
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
    hasOriginal,
  } = useJsonState();

  // Zip file handling state
  const [zipDialogOpen, setZipDialogOpen] = useState(false);
  const [zipEntries, setZipEntries] = useState<ZipEntry[]>([]);
  const [currentZipPath, setCurrentZipPath] = useState<string | null>(null);

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
          if (path.toLowerCase().endsWith('.zip')) {
            const entries = await invoke<ZipEntry[]>('list_zip_entries', { path });
            setZipEntries(entries);
            setCurrentZipPath(path);
            setZipDialogOpen(true);
          } else {
            const content = await invoke<string>('read_file', { path });
            loadJson(content, path);
          }
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

    // Get current window label and check for pending file
    import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
      const currentWindow = WebviewWindow.getCurrent();
      const windowLabel = currentWindow.label;

      invoke<string | null>('get_pending_file', { windowLabel }).then(async (pendingPath) => {
        if (pendingPath) {
          console.log('Found pending file for window:', windowLabel, pendingPath);
          try {
            if (pendingPath.toLowerCase().endsWith('.zip')) {
              const entries = await invoke<ZipEntry[]>('list_zip_entries', { path: pendingPath });
              setZipEntries(entries);
              setCurrentZipPath(pendingPath);
              setZipDialogOpen(true);
            } else {
              const content = await invoke<string>('read_file', { path: pendingPath });
              console.log('Pending file content loaded, length:', content.length);
              loadJson(content, pendingPath);
            }
          } catch (error) {
            console.error('Failed to read pending file:', error);
          }
        }
      }).catch((error) => {
        console.error('Failed to get pending file:', error);
      });
    }).catch((error) => {
      console.error('Failed to get current window:', error);
    });

    const unlisten = listen<string>('file-opened', async (event) => {
      console.log('file-opened event received:', event.payload);
      const path = event.payload;
      try {
        if (path.toLowerCase().endsWith('.zip')) {
          const entries = await invoke<ZipEntry[]>('list_zip_entries', { path });
          setZipEntries(entries);
          setCurrentZipPath(path);
          setZipDialogOpen(true);
        } else {
          const content = await invoke<string>('read_file', { path });
          console.log('File content loaded, length:', content.length);
          loadJson(content, path);
        }
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
    if (!rawContent) return false;

    try {
      // Check if file is from a zip file or HTTP URL - always open save dialog
      const isFromZip = filePath?.includes('#');
      const isHttp = filePath?.startsWith('http://') || filePath?.startsWith('https://');

      // Extract default filename for save dialog
      let defaultPath: string | undefined;
      if (isFromZip && filePath) {
        // For zip files, extract the entry name (after #)
        const entryName = filePath.split('#')[1];
        if (entryName) {
          defaultPath = entryName;
        }
      } else if (isHttp && filePath) {
        // For HTTP URLs, extract filename from URL
        try {
          const url = new URL(filePath);
          const pathname = url.pathname;
          const filename = pathname.split('/').pop();
          if (filename && filename.includes('.')) {
            defaultPath = filename;
          }
        } catch {
          // Invalid URL, ignore
        }
      }

      const path = (!isFromZip && !isHttp && filePath) || await save({
        defaultPath,
        filters: [
          { name: 'JSON', extensions: ['json'] },
        ],
      });

      if (path) {
        await invoke('write_file', { path, content: rawContent });
        // Update filePath to the local save path (especially after saving from HTTP or zip)
        if (isHttp || isFromZip || !filePath) {
          loadJson(rawContent, path);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save file:', error);
      return false;
    }
  }, [rawContent, filePath, loadJson]);

  // Handle open file from menu
  const handleOpenFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
      });

      if (selected) {
        // Check if it's a zip file
        if (selected.toLowerCase().endsWith('.zip')) {
          const entries = await invoke<ZipEntry[]>('list_zip_entries', { path: selected });
          setZipEntries(entries);
          setCurrentZipPath(selected);
          setZipDialogOpen(true);
        } else {
          const content = await invoke<string>('read_file', { path: selected });
          loadJson(content, selected);
        }
      }
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  }, [loadJson]);

  // Handle selecting a zip entry
  const handleZipEntrySelect = useCallback(async (entryName: string, index: number) => {
    if (!currentZipPath) return;
    try {
      const content = await invoke<string>('read_zip_entry_by_index', {
        path: currentZipPath,
        index
      });
      // Store zip path with entry name for reference, but mark it as zip file
      loadJson(content, `${currentZipPath}#${entryName}`);
      setZipDialogOpen(false);
      setZipEntries([]);
    } catch (error) {
      console.error('Failed to read zip entry:', error);
    }
  }, [currentZipPath, loadJson]);

  // Handle canceling zip entry selection
  const handleZipEntryCancel = useCallback(() => {
    setZipDialogOpen(false);
    setZipEntries([]);
    setCurrentZipPath(null);
  }, []);

  // Handle reset - reset to original content
  const handleReset = useCallback(() => {
    reset();
    setSelectedPath([]);
    setNestedPaths([]);
  }, [reset, setSelectedPath]);

  // Handle clear - reset all state to initial
  const handleClear = useCallback(() => {
    clear();
    setNestedPaths([]);
    setColumns([]);
  }, [clear]);

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
    if (jsonValue === null) {
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
    if (jsonValue === null || nestedPaths.length === 0) return;

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
  const insertItemRef = useRef(insertItem);
  const removeItemRef = useRef(removeItem);
  const addPropertyRef = useRef(addProperty);
  const removePropertyRef = useRef(removeProperty);

  columnsRef.current = columns;
  selectedPathRef.current = selectedPath;
  updateValueRef.current = updateValue;
  insertItemRef.current = insertItem;
  removeItemRef.current = removeItem;
  addPropertyRef.current = addProperty;
  removePropertyRef.current = removeProperty;

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

  // Insert item in array - stable callback
  const handleInsert = useCallback((columnIndex: number, path: (string | number)[], index: number, newItem: JsonValue) => {
    const cols = columnsRef.current;
    const selPath = selectedPathRef.current;
    const nestPaths = nestedPathsRef.current;
    const insert = insertItemRef.current;
    const updateVal = updateValueRef.current;

    isEditingRef.current = true;

    if (columnIndex === 0) {
      insert(path, index, newItem);
    } else {
      const column = cols[columnIndex];
      if (!column?.value) return;

      // Get the array to insert into
      const arr = path.length === 0 ? column.value : getValueAtPath(column.value, path);
      if (!Array.isArray(arr)) return;

      const newArr = [...arr];
      newArr.splice(index, 0, newItem);

      const updated = path.length === 0
        ? newArr
        : setValueAtPath(column.value, path, newArr);

      const updateChain: { index: number; value: JsonValue }[] = [{ index: columnIndex, value: updated }];
      let currentStringValue = JSON.stringify(updated);
      let currentColumnIndex = columnIndex;

      while (currentColumnIndex > 0) {
        currentColumnIndex--;

        if (currentColumnIndex === 0) {
          updateChain.push({ index: 0, value: setValueAtPath(cols[0].value!, selPath, currentStringValue) });
          updateVal(selPath, currentStringValue);
        } else {
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

  // Remove item from array - stable callback
  const handleRemove = useCallback((columnIndex: number, path: (string | number)[], index: number) => {
    const cols = columnsRef.current;
    const selPath = selectedPathRef.current;
    const nestPaths = nestedPathsRef.current;
    const remove = removeItemRef.current;
    const updateVal = updateValueRef.current;

    isEditingRef.current = true;

    if (columnIndex === 0) {
      remove(path, index);
    } else {
      const column = cols[columnIndex];
      if (!column?.value) return;

      const arr = path.length === 0 ? column.value : getValueAtPath(column.value, path);
      if (!Array.isArray(arr)) return;

      const newArr = [...arr];
      newArr.splice(index, 1);

      const updated = path.length === 0
        ? newArr
        : setValueAtPath(column.value, path, newArr);

      const updateChain: { index: number; value: JsonValue }[] = [{ index: columnIndex, value: updated }];
      let currentStringValue = JSON.stringify(updated);
      let currentColumnIndex = columnIndex;

      while (currentColumnIndex > 0) {
        currentColumnIndex--;

        if (currentColumnIndex === 0) {
          updateChain.push({ index: 0, value: setValueAtPath(cols[0].value!, selPath, currentStringValue) });
          updateVal(selPath, currentStringValue);
        } else {
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

  // Add property to object - stable callback
  const handleAddProperty = useCallback((columnIndex: number, path: (string | number)[], key: string, value: JsonValue) => {
    const cols = columnsRef.current;
    const selPath = selectedPathRef.current;
    const nestPaths = nestedPathsRef.current;
    const add = addPropertyRef.current;
    const updateVal = updateValueRef.current;

    isEditingRef.current = true;

    if (columnIndex === 0) {
      add(path, key, value);
    } else {
      const column = cols[columnIndex];
      if (!column?.value) return;

      const obj = path.length === 0 ? column.value : getValueAtPath(column.value, path);
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return;

      const newObj = { ...obj, [key]: value };

      const updated = path.length === 0
        ? newObj
        : setValueAtPath(column.value, path, newObj);

      const updateChain: { index: number; value: JsonValue }[] = [{ index: columnIndex, value: updated }];
      let currentStringValue = JSON.stringify(updated);
      let currentColumnIndex = columnIndex;

      while (currentColumnIndex > 0) {
        currentColumnIndex--;

        if (currentColumnIndex === 0) {
          updateChain.push({ index: 0, value: setValueAtPath(cols[0].value!, selPath, currentStringValue) });
          updateVal(selPath, currentStringValue);
        } else {
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

  // Remove property from object - stable callback
  const handleRemoveProperty = useCallback((columnIndex: number, path: (string | number)[], key: string) => {
    const cols = columnsRef.current;
    const selPath = selectedPathRef.current;
    const nestPaths = nestedPathsRef.current;
    const remove = removePropertyRef.current;
    const updateVal = updateValueRef.current;

    isEditingRef.current = true;

    if (columnIndex === 0) {
      remove(path, key);
    } else {
      const column = cols[columnIndex];
      if (!column?.value) return;

      const obj = path.length === 0 ? column.value : getValueAtPath(column.value, path);
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return;

      const newObj = { ...obj };
      delete newObj[key];

      const updated = path.length === 0
        ? newObj
        : setValueAtPath(column.value, path, newObj);

      const updateChain: { index: number; value: JsonValue }[] = [{ index: columnIndex, value: updated }];
      let currentStringValue = JSON.stringify(updated);
      let currentColumnIndex = columnIndex;

      while (currentColumnIndex > 0) {
        currentColumnIndex--;

        if (currentColumnIndex === 0) {
          updateChain.push({ index: 0, value: setValueAtPath(cols[0].value!, selPath, currentStringValue) });
          updateVal(selPath, currentStringValue);
        } else {
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
        <div key={index} className="flex flex-col overflow-hidden h-full bg-[var(--bg-primary)]">
          <div className="px-3 py-1 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] border-b border-[var(--border-light)] text-xs font-semibold text-[var(--text-secondary)] truncate flex items-center gap-2" title={column.titlePath}>
            <svg className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span className="truncate">{column.titlePath}</span>
          </div>
          <div className="flex-1 overflow-auto">
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
      <div className="px-3 py-1 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] border-b border-[var(--border-light)] text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-2">
        <svg className="w-3.5 h-3.5 text-[var(--primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Editor
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorPanel
          rootValue={lastColumnValue}
          selectedPath={editPath}
          onUpdate={(path, newValue) => handleUpdate(lastColumnIndex, path, newValue)}
          onInsert={(path, index, newItem) => handleInsert(lastColumnIndex, path, index, newItem)}
          onRemove={(path, index) => handleRemove(lastColumnIndex, path, index)}
          onAddProperty={(path, key, value) => handleAddProperty(lastColumnIndex, path, key, value)}
          onRemoveProperty={(path, key) => handleRemoveProperty(lastColumnIndex, path, key)}
          fontSize={fontSize}
        />
      </div>
    </div>
  );

  // Handle opening a zip file (from toolbar path input)
  const handleOpenZipFile = useCallback(async (path: string) => {
    try {
      const entries = await invoke<ZipEntry[]>('list_zip_entries', { path });
      setZipEntries(entries);
      setCurrentZipPath(path);
      setZipDialogOpen(true);
    } catch (error) {
      console.error('Failed to open zip file:', error);
    }
  }, []);

  return (
    <div className="h-screen flex flex-col bg-[var(--bg-primary)]">
      <Toolbar
        rawContent={rawContent}
        filePath={filePath}
        onLoadJson={loadJson}
        onOpenFile={handleOpenFile}
        onSave={handleSave}
        onClear={handleClear}
        onReset={handleReset}
        onUndo={undo}
        canUndo={canUndo}
        hasOriginal={hasOriginal}
        layout={layout}
        onLayoutChange={setLayout}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        theme={theme}
        onThemeChange={setTheme}
        onOpenZipFile={handleOpenZipFile}
      />

      {error && (
        <div className="px-3 py-1 bg-[var(--bg-tertiary)] border-b border-[var(--border-light)] text-[var(--danger)] text-xs flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}

      <MultiColumnPanels
        layout={layout}
        panels={panels}
        editorPanel={editorPanel}
      />

      <ZipEntryDialog
        isOpen={zipDialogOpen}
        entries={zipEntries}
        onSelect={handleZipEntrySelect}
        onCancel={handleZipEntryCancel}
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
              className={`${layout === 'vertical' ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'} bg-[var(--border-light)] hover:bg-[var(--primary)] active:bg-[var(--primary-hover)] transition-colors flex-shrink-0`}
              onMouseDown={(e) => handleMouseDown(e, index)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default App;