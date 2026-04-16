import { useRef, useLayoutEffect, useState, useEffect, forwardRef, useCallback } from 'react';

interface AutoResizeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
}

export const AutoResizeTextarea = forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
  function AutoResizeTextarea({ value, onChange, fontSize }, forwardedRef) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const selectionRef = useRef<{ start: number; end: number } | null>(null);
    const [height, setHeight] = useState<number | null>(null);
    const isEditingRef = useRef(false);

    // Callback ref to sync both refs
    const setRefs = useCallback((el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (forwardedRef) {
        if (typeof forwardedRef === 'function') {
          forwardedRef(el);
        } else {
          forwardedRef.current = el;
        }
      }
    }, [forwardedRef]);

    // Calculate initial height based on content
    useEffect(() => {
      if (!isEditingRef.current && textareaRef.current) {
        const el = textareaRef.current;
        el.style.height = 'auto';
        const calculatedHeight = Math.min(el.scrollHeight, 300);
        setHeight(calculatedHeight);
      }
    }, [value]);

    // Restore cursor position after render - only when we have a saved position
    useLayoutEffect(() => {
      const el = textareaRef.current;
      const sel = selectionRef.current;
      if (el && sel) {
        el.selectionStart = sel.start;
        el.selectionEnd = sel.end;
      }
    });

    return (
      <textarea
        ref={setRefs}
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
);