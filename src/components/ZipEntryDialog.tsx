import { useMemo } from 'react';

interface ZipEntry {
  name: string;
  original_name: string;
  index: number;
  is_json: boolean;
}

interface ZipEntryDialogProps {
  isOpen: boolean;
  entries: ZipEntry[];
  onSelect: (entryName: string, index: number) => void;
  onCancel: () => void;
}

export function ZipEntryDialog({ isOpen, entries, onSelect, onCancel }: ZipEntryDialogProps) {
  // Sort entries: JSON files first, then alphabetically
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.is_json !== b.is_json) {
        return a.is_json ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [entries]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-primary)] rounded-lg shadow-xl border border-[var(--border-default)] w-[500px] max-h-[400px] overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-[var(--gradient-from)] to-[var(--gradient-to)] border-b border-[var(--border-light)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Select file from ZIP</h2>
          <button
            onClick={onCancel}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-2 overflow-auto max-h-[300px]">
          {sortedEntries.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">
              No files found in ZIP
            </div>
          ) : (
            <div className="space-y-1">
              {sortedEntries.map((entry) => (
                <button
                  key={entry.index}
                  onClick={() => onSelect(entry.name, entry.index)}
                  className={`w-full px-3 py-2 rounded text-left text-sm transition-colors flex items-center gap-2 ${
                    entry.is_json
                      ? 'bg-[var(--bg-tertiary)] hover:bg-[var(--primary)]/10 text-[var(--text-primary)]'
                      : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
                  }`}
                >
                  {entry.is_json ? (
                    <svg className="w-4 h-4 text-[var(--primary)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  )}
                  <span className="truncate">{entry.name}</span>
                  {entry.is_json && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--primary)]/20 text-[var(--primary)]">JSON</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[var(--border-light)] flex justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}