import { useState, useRef, useCallback, useEffect } from 'react';

interface ResizablePanelsProps {
  layout: 'horizontal' | 'vertical';
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export function ResizablePanels({ layout, leftPanel, rightPanel }: ResizablePanelsProps) {
  const [leftSize, setLeftSize] = useState(30);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    if (layout === 'horizontal') {
      const newLeftSize = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftSize(Math.min(Math.max(newLeftSize, 10), 90));
    } else {
      const newLeftSize = ((e.clientY - rect.top) / rect.height) * 100;
      setLeftSize(Math.min(Math.max(newLeftSize, 10), 90));
    }
  }, [layout]);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const rightSize = 100 - leftSize;

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex ${
        layout === 'vertical' ? 'flex-col' : 'flex-row'
      } overflow-hidden`}
    >
      {/* Left Panel */}
      <div
        className={`flex flex-col overflow-hidden ${
          layout === 'vertical' ? 'border-b' : 'border-r'
        }`}
        style={{
          [layout === 'vertical' ? 'height' : 'width']: `${leftSize}%`,
        }}
      >
        {leftPanel}
      </div>

      {/* Resizer */}
      <div
        className={`${
          layout === 'vertical'
            ? 'h-1 cursor-row-resize'
            : 'w-1 cursor-col-resize'
        } bg-gray-200 hover:bg-blue-400 transition-colors flex-shrink-0`}
        onMouseDown={handleMouseDown}
      />

      {/* Right Panel */}
      <div
        className="flex flex-col overflow-hidden flex-1"
        style={{
          [layout === 'vertical' ? 'height' : 'width']: `${rightSize}%`,
        }}
      >
        {rightPanel}
      </div>
    </div>
  );
}