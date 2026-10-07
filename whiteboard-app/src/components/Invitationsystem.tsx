import { useRef, useState } from 'react';
import CanvasDialog from './CanvasDialog';
import CanvasIcon from './CanvasIcons';
import { SESSION_PATTERN } from '../lib/board';

export default function InviteModal({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const url = `${window.location.origin}/session/${encodeURIComponent(sessionId)}`;
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setMessage('Link copied. Send it to someone you’d love to create with.');
    } catch {
      input.current?.focus();
      input.current?.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* The selected link remains available for manual copying. */ }
      setMessage(copied ? 'Link copied. You’re ready to invite your team.' : 'The link is selected. Press Ctrl+C or ⌘C, or long-press to copy it.');
    }
  };
  const share = async () => {
    try { await navigator.share({ title: 'Create with me on Canvas Together', text: 'A little space for our next big idea.', url }); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Sharing is unavailable right now. Copy the invitation link instead.');
    }
  };
  return <>
    <button className="button button-primary share-button" disabled={!SESSION_PATTERN.test(sessionId)} onClick={() => { setMessage(''); setOpen(true); }}>
      <CanvasIcon name="share" width="17" height="17" /><span>Share board</span></button>
    {open && <CanvasDialog title="Better ideas, together." description="Invite anyone into your space. They can join as a guest and start creating right away." onClose={() => setOpen(false)}>
      <label className="field-label" htmlFor="invitation-url">Invitation link</label>
      <div className="invite-url-field"><input id="invitation-url" ref={input} className="text-field" value={url} readOnly data-autofocus
        onFocus={event => event.currentTarget.select()} aria-describedby="invite-instructions" />
        <button className="button button-primary" onClick={() => void copy()}><CanvasIcon name="copy" width="17" height="17" /> Copy link</button></div>
      <p className="field-hint" id="invite-instructions">Anyone with this link can draw, chat, and collaborate on this board.</p>
      <div className="invite-room"><span>BOARD ID</span><code>{sessionId}</code></div>
      <p className="invite-status" role="status">{message || 'A shared link. A shared canvas. No sign-up needed.'}</p>
      <div className="dialog-actions"><button className="button button-secondary" onClick={() => setOpen(false)}>Done</button>
        {typeof navigator.share === 'function' && <button className="button button-primary" onClick={() => void share()}><CanvasIcon name="share" width="17" height="17" /> Share invitation</button>}</div>
    </CanvasDialog>}
  </>;
}
