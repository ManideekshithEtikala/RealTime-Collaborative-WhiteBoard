import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import CanvasIcon from './CanvasIcons';

export default function CanvasDialog({ title, description, onClose, children }: {
  title: string; description?: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const target = ref.current?.querySelector<HTMLElement>('[data-autofocus]');
      (target || ref.current)?.focus();
    });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]');
      if (!elements?.length) { event.preventDefault(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, []);
  return <div className="dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="canvas-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined} ref={ref} tabIndex={-1}>
      <button type="button" className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose}>
        <CanvasIcon name="close" />
      </button>
      <span className="dialog-symbol"><CanvasIcon name="sparkle" width="26" height="26" /></span>
      <h2 id={`${id}-title`}>{title}</h2>
      {description && <p id={`${id}-description`}>{description}</p>}
      {children}
    </div>
  </div>;
}
