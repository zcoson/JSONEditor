import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

interface ToolbarProps {
  rawContent: string;
  filePath: string | null;
  onLoadJson: (content: string, path?: string) => void;
  onOpenFile: () => void;
  onSave: () => Promise<boolean>;
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

export function Toolbar({ rawContent, filePath, onLoadJson, onOpenFile, onSave, onClear, onReset, onUndo, canUndo, hasOriginal, layout, onLayoutChange, fontSize, onFontSizeChange }: ToolbarProps) {
  const [feedback, setFeedback] = useState<{ action: string; status: 'success' | 'error' } | null>(null);

  const showFeedback = (action: string, status: 'success' | 'error' = 'success') => {
    setFeedback({ action, status });
    setTimeout(() => setFeedback(null), 1500);
  };

  // 获取文件名
  const getFileName = (path: string) => {
    const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  };

  const handleSave = async () => {
    const success = await onSave();
    showFeedback('save', success ? 'success' : 'error');
  };

  const handlePaste = async () => {
    try {
      const text = await readText();
      if (text) {
        onLoadJson(text);
        showFeedback('paste');
      }
    } catch (error) {
      console.error('Failed to paste:', error);
      showFeedback('paste', 'error');
    }
  };

  const handleCopyCompressed = async () => {
    try {
      const compressed = await invoke<string>('compress_json', { content: rawContent });
      await writeText(compressed);
      showFeedback('compress');
    } catch (error) {
      console.error('Failed to copy compressed:', error);
      showFeedback('compress', 'error');
    }
  };

  const handleCopyContent = async () => {
    try {
      await writeText(rawContent);
      showFeedback('copy');
    } catch (error) {
      console.error('Failed to copy:', error);
      showFeedback('copy', 'error');
    }
  };

  const handleUndo = () => {
    onUndo();
    showFeedback('undo');
  };

  const handleReset = () => {
    onReset();
    showFeedback('reset');
  };

  const handleClear = () => {
    onClear();
    showFeedback('clear');
  };

  const handleLayoutToggle = () => {
    onLayoutChange(layout === 'horizontal' ? 'vertical' : 'horizontal');
    showFeedback('layout');
  };

  const handleZoomIn = () => {
    onFontSizeChange(Math.min(fontSize + 1, 24));
  };

  const handleZoomOut = () => {
    onFontSizeChange(Math.max(fontSize - 1, 10));
  };

  return (
    <div className="flex items-center gap-2 px-3 py-0.5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 shadow-sm">
      {/* File path and open button on the left */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-md border border-slate-200 text-xs text-slate-600 max-w-xs">
        <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {filePath ? (
          <span className="truncate flex-1" title={filePath}>{getFileName(filePath)}</span>
        ) : (
          <span className="text-slate-400 flex-1">No file</span>
        )}
        <button onClick={onOpenFile} className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0" title="Open file">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
        </button>
      </div>

      <div className="w-px h-5 bg-slate-300" />

      <button
        onClick={handlePaste}
        className={`btn ${feedback?.action === 'paste' ? (feedback.status === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'btn-default'}`}
        title="Paste from clipboard"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        {feedback?.action === 'paste' ? (feedback.status === 'success' ? 'Pasted!' : 'Failed') : 'Paste'}
      </button>
      <button
        onClick={handleUndo}
        className={`btn ${feedback?.action === 'undo' ? 'bg-green-500 text-white' : 'btn-default'}`}
        disabled={!canUndo}
        title="Undo (⌘Z)"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        {feedback?.action === 'undo' ? 'Done!' : 'Undo'}
      </button>
      <button
        onClick={handleReset}
        className={`btn ${feedback?.action === 'reset' ? 'bg-green-500 text-white' : 'btn-default'}`}
        disabled={!hasOriginal}
        title="Reset to original"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {feedback?.action === 'reset' ? 'Reset!' : 'Reset'}
      </button>
      <button
        onClick={handleClear}
        className={`btn ${feedback?.action === 'clear' ? 'bg-green-500 text-white' : 'btn-danger'}`}
        disabled={!rawContent}
        title="Clear content"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        {feedback?.action === 'clear' ? 'Cleared!' : 'Clear'}
      </button>

      <div className="w-px h-5 bg-slate-300" />

      <button
        onClick={handleCopyCompressed}
        className={`btn ${feedback?.action === 'compress' ? (feedback.status === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'btn-default'}`}
        disabled={!rawContent}
        title="Copy compressed JSON"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        {feedback?.action === 'compress' ? (feedback.status === 'success' ? 'Copied!' : 'Failed') : 'Compress'}
      </button>
      <button
        onClick={handleCopyContent}
        className={`btn ${feedback?.action === 'copy' ? (feedback.status === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'btn-default'}`}
        disabled={!rawContent}
        title="Copy formatted JSON"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {feedback?.action === 'copy' ? (feedback.status === 'success' ? 'Copied!' : 'Failed') : 'Copy'}
      </button>
      <button
        onClick={handleSave}
        className={`btn ${feedback?.action === 'save' ? (feedback.status === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'btn-primary'}`}
        disabled={!rawContent}
        title="Save file (⌘S)"
      >
        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h9.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm11 2v3a1 1 0 01-1 1H8a1 1 0 01-1-1V7h7z" />
        </svg>
        {feedback?.action === 'save' ? (feedback.status === 'success' ? 'Saved!' : 'Cancelled') : 'Save'}
      </button>

      <div className="flex-1" />

      <div className="flex items-center gap-1 bg-white rounded-md border border-slate-200 p-0.5">
        <button
          onClick={handleZoomOut}
          className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded text-xs transition-colors"
          title="Zoom out"
        >
          A−
        </button>
        <span className="px-1.5 text-xs font-medium text-slate-700 min-w-[2rem] text-center">{fontSize}</span>
        <button
          onClick={handleZoomIn}
          className="px-2 py-1 text-slate-600 hover:bg-slate-100 rounded text-xs transition-colors"
          title="Zoom in"
        >
          A+
        </button>
      </div>

      <div className="w-px h-5 bg-slate-300" />

      <button
        onClick={handleLayoutToggle}
        className={`btn ${feedback?.action === 'layout' ? 'bg-green-500 text-white' : 'btn-default'}`}
        title={layout === 'horizontal' ? 'Switch to vertical layout' : 'Switch to horizontal layout'}
      >
        {layout === 'horizontal' ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 4v16M12 4v16M18 4v16" />
          </svg>
        )}
      </button>
    </div>
  );
}
