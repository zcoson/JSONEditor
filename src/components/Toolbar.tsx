import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

interface ToolbarProps {
  rawContent: string;
  filePath: string | null;
  onLoadJson: (content: string, path?: string) => void;
  onClear: () => void;
  onReset: () => void;
  onUndo: () => void;
  canUndo: boolean;
  hasOriginal: boolean;
  layout: 'horizontal' | 'vertical';
  onLayoutChange: (layout: 'horizontal' | 'vertical') => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export function Toolbar({ rawContent, filePath, onLoadJson, onClear, onReset, onUndo, canUndo, hasOriginal, layout, onLayoutChange, fontSize, onFontSizeChange }: ToolbarProps) {
  const [copied, setCopied] = useState<'none' | 'compress' | 'copy'>('none');
  const handlePaste = async () => {
    try {
      const text = await readText();
      if (text) {
        onLoadJson(text);
      }
    } catch (error) {
      console.error('Failed to paste:', error);
    }
  };

  const handleCopyCompressed = async () => {
    try {
      const compressed = await invoke<string>('compress_json', { content: rawContent });
      await writeText(compressed);
      setCopied('compress');
      setTimeout(() => setCopied('none'), 1500);
    } catch (error) {
      console.error('Failed to copy compressed:', error);
    }
  };

  const handleCopyContent = async () => {
    try {
      await writeText(rawContent);
      setCopied('copy');
      setTimeout(() => setCopied('none'), 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleZoomIn = () => {
    onFontSizeChange(Math.min(fontSize + 1, 24));
  };

  const handleZoomOut = () => {
    onFontSizeChange(Math.max(fontSize - 1, 10));
  };

  const handleZoomReset = () => {
    onFontSizeChange(16);
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 border-b">
      <button
        onClick={handlePaste}
        className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
      >
        Paste
      </button>
      <button
        onClick={onReset}
        className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
        disabled={!hasOriginal}
      >
        Reset
      </button>
      <button
        onClick={onUndo}
        className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
        disabled={!canUndo}
      >
        Undo
      </button>
      <button
        onClick={onClear}
        className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
        disabled={!rawContent}
      >
        Clear
      </button>
      <div className="w-px h-4 bg-gray-300" />
      <button
        onClick={handleCopyCompressed}
        className={`px-2 py-1 rounded text-xs ${copied === 'compress' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        disabled={!rawContent}
      >
        {copied === 'compress' ? 'Copied' : 'Compress'}
      </button>
      <button
        onClick={handleCopyContent}
        className={`px-2 py-1 rounded text-xs ${copied === 'copy' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        disabled={!rawContent}
      >
        {copied === 'copy' ? 'Copied' : 'Copy'}
      </button>
      <div className="flex-1 flex items-center justify-center">
        {filePath && (
          <span className="text-xs text-gray-500 truncate max-w-md" title={filePath}>
            {filePath}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={handleZoomOut}
          className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
          title="Zoom Out"
        >
          A-
        </button>
        <button
          onClick={handleZoomReset}
          className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
          title="Reset Font Size"
        >
          {fontSize}
        </button>
        <button
          onClick={handleZoomIn}
          className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
          title="Zoom In"
        >
          A+
        </button>
      </div>
      <div className="w-px h-4 bg-gray-300" />
      <button
        onClick={() => onLayoutChange(layout === 'horizontal' ? 'vertical' : 'horizontal')}
        className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
      >
        {layout === 'horizontal' ? '↕' : '↔'}
      </button>
    </div>
  );
}
