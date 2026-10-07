import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { initials } from '../lib/board';
import type { ChatMessage } from '../lib/board';
import CanvasIcon from './CanvasIcons';

export default function CanvasChat({ messages, clientId, ready, send }: {
  messages: ChatMessage[]; clientId: string; ready: boolean; send: (message: string) => Promise<boolean>;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [messages]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || !input.trim() || sending) return;
    const message = input.trim();
    setSending(true);
    try { if (await send(message)) setInput(''); }
    finally { setSending(false); }
  };
  return <section className="board-chat" aria-labelledby="chat-title">
    <div className="chat-heading"><h2 id="chat-title"><CanvasIcon name="chat" /> Team chat</h2><span className="subtle-tag">LIVE</span></div>
    <div className="chat-history" ref={history} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Board chat messages">
      {!messages.length && <div className="chat-empty"><span><CanvasIcon name="chat" width="28" height="28" /></span>
        <strong>Ideas start with a hello.</strong><p>Plan, share feedback, or just say hi to your collaborators.</p></div>}
      {messages.map(message => <div className={`chat-message${message.userId === clientId ? ' own' : ''}`} key={message.id}>
        <span className="chat-avatar" aria-hidden="true">{initials(message.name)}</span>
        <div className="message-content"><div className="message-byline"><strong>{message.userId === clientId ? 'You' : message.name}</strong>
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
          <p>{message.message}</p></div>
      </div>)}
    </div>
    <form className="chat-compose" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-message">Message your collaborators</label>
      <input id="chat-message" value={input} onChange={event => setInput(event.target.value)} maxLength={1000}
        placeholder={ready ? 'Send a message…' : 'Waiting for connection…'} disabled={!ready || sending} autoComplete="off" />
      <button type="submit" className="chat-send" aria-label="Send message" disabled={!ready || !input.trim() || sending}>
        <CanvasIcon name="send" width="18" height="18" /></button>
    </form>
    <p className="chat-footnote">A shared conversation, a shared canvas.</p>
  </section>;
}
