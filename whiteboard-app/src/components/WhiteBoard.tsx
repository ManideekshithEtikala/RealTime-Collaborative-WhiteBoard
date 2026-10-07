import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import InviteModal from './Invitationsystem';
import CanvasIcon, { CanvasBrand } from './CanvasIcons';
import CanvasDialog from './CanvasDialog';
import CanvasSurface from './CanvasSurface';
import CanvasChat from './CanvasChat';
import useBoardSocket from './useBoardSocket';
import useCanvasDrawing from './useCanvasDrawing';
import { COLORS, getGuestProfile, initials } from '../lib/board';
import type { Tool } from '../lib/board';
import { exportBoard } from '../lib/canvasExport';
import '../App.css';

const TOOLS: { tool: Tool; label: string; shortcut: string }[] = [
  { tool: 'pen', label: 'Pen', shortcut: 'P' }, { tool: 'eraser', label: 'Eraser', shortcut: 'E' },
  { tool: 'rectangle', label: 'Rectangle', shortcut: 'R' }, { tool: 'ellipse', label: 'Ellipse', shortcut: 'O' },
  { tool: 'text', label: 'Text', shortcut: 'T' },
];
const STATUS_LABELS = { connecting: 'Connecting', joining: 'Loading board', connected: 'Live & connected', offline: 'Reconnecting', error: 'Not connected' };
const COLOR_NAMES = ['Navy', 'Indigo', 'Rose', 'Amber', 'Mint', 'Blue'];

export default function Whiteboard() {
  const { id = '' } = useParams();
  const [profile] = useState(getGuestProfile);
  const board = useBoardSocket(id, profile);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [chatOpen, setChatOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [clearError, setClearError] = useState('');
  const [text, setText] = useState('');
  const [textBusy, setTextBusy] = useState(false);
  const [textError, setTextError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const canvasRef = useRef<HTMLDivElement>(null);
  const drawing = useCanvasDrawing({ container: canvasRef, ready: board.ready, tool, color, width,
    commit: board.commit, sendPreview: board.sendPreview, sendCursor: board.sendCursor });
  const canUndo = board.ready && !board.busy && board.lines.some(line => line.userId === profile.clientId);
  const canRedo = board.ready && !board.busy && board.redoStack.some(line => !line.userId || line.userId === profile.clientId);
  const people = board.participants;

  useEffect(() => {
    const previous = document.title;
    document.title = `Board ${id.slice(0, 8)} · Canvas Together`;
    return () => { document.title = previous; };
  }, [id]);
  useEffect(() => { setText(''); setTextError(''); }, [drawing.textPoint]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!board.ready || event.isComposing || target?.closest('input, textarea, select, [contenteditable="true"]') ||
        document.querySelector('[aria-modal="true"]')) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault();
        drawing.cancel();
        if (event.shiftKey && canRedo) void board.request('redo-action');
        else if (!event.shiftKey && canUndo) void board.request('undo-action');
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const selected = TOOLS.find(item => item.shortcut.toLowerCase() === key);
      if (selected) { event.preventDefault(); setTool(selected.tool); }
    };
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [board.ready, board.request, canRedo, canUndo, drawing.cancel]);

  const download = async (format: 'png' | 'pdf') => {
    setExporting(true);
    try {
      await exportBoard(board.lines, id, format);
      setNotice(`${format.toUpperCase()} exported. Ready to share your ideas.`);
    } catch {
      board.setError('We could not export your canvas. Please try again.');
    } finally { setExporting(false); }
  };
  const clear = async () => {
    if (!board.ready || clearBusy) return;
    setClearBusy(true);
    setClearError('');
    const ok = await board.request('clear-canvas');
    setClearBusy(false);
    if (ok) { setClearOpen(false); setNotice('Canvas cleared. A fresh start for everyone.'); }
    else setClearError('The canvas could not be cleared. Reconnect and try again.');
  };
  const submitText = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || textBusy || !board.ready) return;
    setTextBusy(true);
    setTextError('');
    const ok = await drawing.addText(text);
    setTextBusy(false);
    if (!ok) setTextError('We could not add your text. Please try again once connected.');
  };

  return <div className="board-page">
    <header className="board-header">
      <div className="board-heading">
        <Link to="/" className="brand-link" aria-label="Canvas Together home"><CanvasBrand compact /></Link>
        <span className="header-divider" />
        <div className="room-heading"><span className="room-eyebrow">SHARED WORKSPACE</span>
          <span className="room-id" title={id}>Board <span>{id}</span></span></div>
      </div>
      <div className="board-header-actions">
        <span className={`connection-status status-${board.status}`} role="status"><span />{STATUS_LABELS[board.status]}</span>
        <div className="header-avatars" aria-label={`${people.length} participants connected`}>
          {people.slice(0, 3).map(person => <span key={person.userId} className="avatar" title={person.name}
            style={{ backgroundColor: person.color }}>{initials(person.name)}</span>)}
          {people.length > 3 && <span className="avatar avatar-extra">+{people.length - 3}</span>}
        </div>
        <button className={`icon-button mobile-chat-toggle${chatOpen ? ' is-active' : ''}`} aria-label="Toggle team chat"
          aria-expanded={chatOpen} aria-controls="collaboration-panel" onClick={() => setChatOpen(value => !value)}><CanvasIcon name="chat" /></button>
        <InviteModal sessionId={id} />
      </div>
    </header>

    <div className="workspace-heading"><div><span className="eyebrow">GOOD IDEAS HAPPEN TOGETHER</span>
      <h1>Your shared canvas<span className="heading-dot">.</span></h1></div>
      <Link to="/image-classifier" className="classifier-link"><CanvasIcon name="sparkle" width="17" height="17" /> Image classifier <CanvasIcon name="arrow" width="16" height="16" /></Link>
    </div>
    {board.error && <div className="connection-banner" role="alert"><span>{board.error}</span>
      {!board.ready ? <button className="text-button" onClick={board.reconnect}>Reconnect</button> :
        <button className="icon-button" aria-label="Dismiss error" onClick={() => board.setError('')}><CanvasIcon name="close" /></button>}</div>}

    <div className="board-layout">
      <main className="canvas-workspace" aria-label="Whiteboard workspace">
        <div className="canvas-toolbar">
          <div className="tool-group" role="group" aria-label="Drawing tools">
            {TOOLS.map(item => <button key={item.tool} className={`tool-button${tool === item.tool ? ' selected' : ''}`}
              aria-pressed={tool === item.tool} aria-label={`${item.label} (${item.shortcut})`} title={`${item.label} (${item.shortcut})`}
              disabled={!board.ready} onClick={() => setTool(item.tool)}><CanvasIcon name={item.tool} /><span>{item.label}</span></button>)}
          </div>
          <span className="toolbar-divider" />
          <div className="history-controls" role="group" aria-label="Canvas history">
            <button className="icon-button" disabled={!canUndo} aria-label="Undo your last drawing (Ctrl or Command Z)"
              title="Undo your last drawing (⌘/Ctrl Z)" onClick={() => { drawing.cancel(); void board.request('undo-action'); }}><CanvasIcon name="undo" /></button>
            <button className="icon-button" disabled={!canRedo} aria-label="Redo your drawing (Ctrl or Command Shift Z)"
              title="Redo (⌘/Ctrl Shift Z)" onClick={() => void board.request('redo-action')}><CanvasIcon name="redo" /></button>
          </div>
          <div className="export-controls"><CanvasIcon name="download" width="17" height="17" /><span>Export</span>
            <button disabled={exporting || (!board.ready && !board.lines.length)} onClick={() => void download('png')} aria-label="Export canvas as PNG">PNG</button>
            <button disabled={exporting || (!board.ready && !board.lines.length)} onClick={() => void download('pdf')} aria-label="Export canvas as PDF">PDF</button></div>
        </div>
        <div className="canvas-options">
          <div className="color-controls" role="group" aria-label="Stroke color">
            <span className="option-label">Color</span>
            {COLORS.map((value, index) => <button key={value} className={`color-swatch${color === value ? ' selected' : ''}`}
              style={{ backgroundColor: value }} aria-label={`Use ${COLOR_NAMES[index]} color`} aria-pressed={color === value}
              disabled={!board.ready} onClick={() => setColor(value)}>{color === value && <CanvasIcon name="check" width="13" height="13" />}</button>)}
            <label className="custom-color" title="Custom stroke color"><input aria-label="Choose a custom stroke color" type="color"
              value={color} disabled={!board.ready} onChange={event => setColor(event.target.value)} /><span aria-hidden="true">+</span></label>
          </div>
          <span className="toolbar-divider" />
          <label className="brush-control"><span className="option-label">Size</span><input type="range" min="1" max="40" value={width}
            disabled={!board.ready} onChange={event => setWidth(Number(event.target.value))} aria-label="Stroke width" /><span>{width}<small>px</small></span></label>
          <button className="clear-button" disabled={!board.ready || board.busy || !board.lines.length}
            onClick={() => { setClearError(''); setClearOpen(true); }}><CanvasIcon name="trash" width="16" height="16" /><span>Clear canvas</span></button>
        </div>
        <CanvasSurface containerRef={canvasRef} lines={board.lines} pending={board.pending} previews={board.previews}
          draft={drawing.draft} cursors={board.cursors} ready={board.ready} tool={tool} pointerHandlers={drawing.pointerHandlers} />
        <div className="canvas-footer"><span className={`save-indicator${board.ready ? ' online' : ''}`}><span />
          {!board.ready ? 'Editing paused until connected' : board.pending.length ? 'Saving your drawing…' : 'Changes sync in real time'}</span>
          <span className="keyboard-hint"><kbd>P</kbd> pen <span>·</span> <kbd>⌘ / Ctrl Z</kbd> undo</span></div>
      </main>

      <aside className={`collaboration-panel${chatOpen ? ' is-open' : ''}`} id="collaboration-panel" aria-label="Collaborators and chat">
        <section className="participants-panel" aria-labelledby="participants-title">
          <div className="panel-heading"><h2 id="participants-title">In this space</h2><span className="participant-count">{people.length}</span></div>
          <div className="participant-list">
            {people.map(person => <div className="participant" key={person.userId}><span className="avatar" style={{ backgroundColor: person.color }}>{initials(person.name)}</span>
              <span className="participant-name">{person.name}{person.userId === board.socketId && <small> (you)</small>}</span><span className="participant-online" title="Connected" /></div>)}
            {!people.length && <div className="participant waiting"><span className="avatar">{initials(profile.name)}</span><span>{profile.name}<small> · connecting</small></span></div>}
          </div>
          <p className="invite-hint"><CanvasIcon name="link" width="14" height="14" /> Great company is one link away.</p>
        </section>
        <CanvasChat messages={board.messages} clientId={profile.clientId} ready={board.ready}
          send={message => board.request('chat-message', { message })} />
      </aside>
    </div>
    <footer className="board-bottom"><Link to="/"><CanvasIcon name="home" width="14" height="14" /> Back to your spaces</Link><span>Less friction. More possibility.</span></footer>
    {notice && <div className="canvas-toast" role="status"><CanvasIcon name="check" width="18" height="18" />{notice}</div>}

    {clearOpen && <CanvasDialog title="Make room for a fresh idea?" description="This clears the canvas for everyone, including undo history. Your conversation stays right here."
      onClose={() => { if (!clearBusy) setClearOpen(false); }}>
      {clearError && <p className="form-error" role="alert">{clearError}</p>}
      <div className="dialog-actions"><button className="button button-secondary" data-autofocus disabled={clearBusy} onClick={() => setClearOpen(false)}>Keep drawing</button>
        <button className="button button-danger" disabled={clearBusy || !board.ready} onClick={() => void clear()}>{clearBusy ? 'Clearing…' : 'Clear for everyone'}</button></div>
    </CanvasDialog>}
    {drawing.textPoint && <CanvasDialog title="Put your idea into words." description="Add a note, a title, or the start of something great." onClose={() => { if (!textBusy) drawing.closeText(); }}>
      <form onSubmit={submitText}><label className="field-label" htmlFor="canvas-text">Your text</label>
        <textarea id="canvas-text" className="text-field text-note" data-autofocus placeholder="What’s on your mind?" value={text}
          onChange={event => setText(event.target.value)} maxLength={500} rows={4} disabled={textBusy} />
        <span className="field-hint">{text.length}/500 characters · Click another spot to add more text.</span>
        {textError && <p className="form-error" role="alert">{textError}</p>}
        <div className="dialog-actions"><button type="button" className="button button-secondary" disabled={textBusy} onClick={drawing.closeText}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={!text.trim() || textBusy || !board.ready}>{textBusy ? 'Adding…' : 'Add to canvas'}</button></div>
      </form>
    </CanvasDialog>}
  </div>;
}
