import { useRef, useLayoutEffect, useState, useEffect } from 'react';

interface AutoResizeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
}

export function AutoResizeTextarea({ value, onChange, fontSize }: AutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const isEditingRef = useRef(false);

  // Calculate initial height based on content
  useEffect(() => {
    if (!isEditingRef.current && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      const calculatedHeight = Math.min(el.scrollHeight, 300);
      setHeight(calculatedHeight);
    }
  }, [value]);

  // Restore cursor position after render
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el && selectionRef.current) {
      el.selectionStart = selectionRef.current.start;
      el.selectionEnd = selectionRef.current.end;
    }
  });

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        const el = e.target;
        isEditingRef.current = true;
        // Save cursor position before onChange triggers re-render
        selectionRef.current = {
          start: el.selectionStart,
          end: el.selectionEnd,
        };
        onChange(el.value);
      }}
      onBlur={() => {
        isEditingRef.current = false;
      }}
      className="w-full px-1 py-0.5 border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono overflow-auto"
      style={{ height: height ? `${height}px` : 'auto', minHeight: '22px', maxHeight: '300px', fontSize: fontSize ? `${fontSize}px` : undefined }}
    />
  );
}