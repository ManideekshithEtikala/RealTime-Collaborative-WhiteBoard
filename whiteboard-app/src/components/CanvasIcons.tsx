import type { SVGProps } from 'react';

const paths = {
  pen: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15v5Z',
  eraser: 'm14 3 7 7-10 10H6l-4-4L14 3ZM8 10l7 7M11 20h11',
  rectangle: 'M4 5h16v14H4z',
  ellipse: 'M21 12a9 7 0 1 1-18 0 9 7 0 1 1 18 0Z',
  text: 'M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3',
  undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12',
  redo: 'm16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  share: 'M12 16V3m-5 5 5-5 5 5M5 12v9h14v-9',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  link: 'm10 13 4-4M8 16l-2 2a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0m4-1 2-2a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M12 7a4 4 0 1 1-8 0 4 4 0 1 1 8 0Zm5-3a4 4 0 0 1 0 8',
  chat: 'M21 11a9 8 0 0 1-9 8H5l-3 3V11a9 8 0 0 1 19 0ZM7 10h10M7 14h6',
  send: 'm22 2-7 20-4-9-9-4L22 2ZM11 13 22 2',
  close: 'm6 6 12 12M6 18 18 6',
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  image: 'M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4M17 7h.01',
  check: 'm5 12 4 4L19 6',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0ZM12 7v5l3 2',
  home: 'm3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8',
  copy: 'M9 9h12v12H9zM15 9V3H3v12h6',
} as const;

export type IconName = keyof typeof paths;
export default function CanvasIcon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d={paths[name]} />
  </svg>;
}

export function CanvasBrand({ compact = false }: { compact?: boolean }) {
  return <span className={`canvas-brand${compact ? ' compact' : ''}`}>
    <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
    <span>Canvas<span className="brand-light"> Together</span></span>
  </span>;
}
