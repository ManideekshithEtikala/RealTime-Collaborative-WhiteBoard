import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CanvasIcon, { CanvasBrand } from './CanvasIcons';
import type { IconName } from './CanvasIcons';
import { getGuestProfile, getRecentBoards, initials, isGuestName, parseSessionInput, saveGuestName } from '../lib/board';
import '../App.css';

const FEATURES: { icon: IconName; title: string; description: string; color: string }[] = [
  { icon: 'pen', title: 'Room for every kind of idea', description: 'Sketch freely, add shapes, write a thought. A simple toolkit that gets out of your way.', color: 'indigo' },
  { icon: 'people', title: 'A little closer, in real time', description: 'See your teammates’ cursors and ideas as they happen. Different places, the same page.', color: 'rose' },
  { icon: 'chat', title: 'Keep the conversation flowing', description: 'Talk it through in built-in chat. Share a link, bring your people, and find your flow.', color: 'mint' },
];

function HeroPreview() {
  return <div className="preview-scene" role="img" aria-label="An example collaborative canvas with sketches, sticky notes, and colorful participant cursors">
    <div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" />
    <div className="preview-float"><CanvasIcon name="sparkle" width="16" height="16" /> A spark is all it takes.</div>
    <div className="hero-preview">
      <div className="preview-topbar"><span className="preview-dots"><i /><i /><i /></span><span>Our next big idea</span><span className="preview-live"><i /> Live</span></div>
      <div className="preview-paper">
        <div className="preview-toolrail">{(['pen', 'rectangle', 'ellipse', 'text', 'eraser'] as IconName[]).map((name, i) =>
          <span className={i === 0 ? 'active' : ''} key={name}><CanvasIcon name={name} width="17" height="17" /></span>)}<i /><span className="preview-color" /></div>
        <svg className="preview-drawing" viewBox="0 0 500 340" fill="none" aria-hidden="true">
          <defs><pattern id="preview-grid" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.6" fill="#e7eaf1" /></pattern></defs>
          <rect width="500" height="340" fill="url(#preview-grid)" />
          <path d="M215 91c45-10 76-5 101 24m-5-14 6 15-17-3M228 174c47 13 61 31 67 49m-10-9 10 11 8-12M153 171c-13 17-23 30-37 39" stroke="#b1b6cb" strokeWidth="2" strokeLinecap="round" />
          <g transform="translate(87 40) rotate(-5)"><rect width="152" height="118" rx="3" fill="#fff0bb" /><path d="M15 18h30" stroke="#d8ba6b" strokeWidth="3" strokeLinecap="round" />
            <text x="17" y="47" fill="#625139" fontSize="16" fontFamily="Arial, sans-serif" fontWeight="700">What if we made</text><text x="17" y="71" fill="#625139" fontSize="16" fontFamily="Arial, sans-serif" fontWeight="700">something great?</text>
            <path d="m108 93 5 5 11-14" stroke="#b49447" strokeWidth="2.5" strokeLinecap="round" /></g>
          <g transform="translate(300 91) rotate(4)"><rect width="152" height="102" rx="12" fill="#efedff" stroke="#b9aff6" strokeWidth="1.5" />
            <text x="21" y="37" fill="#6556ac" fontSize="13" fontFamily="Arial, sans-serif">LESS FRICTION.</text><text x="21" y="61" fill="#514291" fontSize="19" fontFamily="Arial, sans-serif" fontWeight="700">More possibility.</text><path d="M23 73h90" stroke="#b7a5ec" strokeWidth="2" strokeLinecap="round" /></g>
          <g transform="translate(64 230) rotate(-3)"><rect width="144" height="75" rx="3" fill="#ddf3e9" />
            <text x="16" y="30" fill="#397969" fontSize="17" fontFamily="Arial, sans-serif" fontWeight="700">Start small.</text><text x="16" y="54" fill="#397969" fontSize="17" fontFamily="Arial, sans-serif" fontWeight="700">Dream together.</text></g>
          <ellipse cx="339" cy="263" rx="72" ry="36" stroke="#e69cab" strokeWidth="2.2" strokeDasharray="5 4" />
          <text x="294" y="269" fill="#b46d7f" fontFamily="Arial, sans-serif" fontSize="15">Let’s try it!</text>
          <path d="m239 273 14 4-6-14m-22 24c-6-18 4-27 23-15" stroke="#e69cab" strokeWidth="2" strokeLinecap="round" />
          <path d="m444 43 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-7Z" stroke="#e9bc5b" strokeWidth="1.8" />
        </svg>
        <div className="mock-cursor cursor-maya"><svg width="17" height="20" viewBox="0 0 17 20"><path d="m1 1 1 15 4-4 4 7 3-2-4-7h7Z" fill="currentColor" stroke="white" /></svg><span>Maya</span></div>
        <div className="mock-cursor cursor-alex"><svg width="17" height="20" viewBox="0 0 17 20"><path d="m1 1 1 15 4-4 4 7 3-2-4-7h7Z" fill="currentColor" stroke="white" /></svg><span>Alex</span></div>
      </div>
      <div className="preview-bottombar"><div className="preview-avatars"><span>M</span><span>A</span><span>Y</span></div><span>3 minds. One canvas.</span><span className="preview-saved"><CanvasIcon name="check" width="13" height="13" /> All in sync</span></div>
    </div>
    <div className="preview-caption"><span className="caption-spark">✳</span> A blank canvas. Endless possibilities.</div>
  </div>;
}

export default function Home() {
  const navigate = useNavigate();
  const [profile] = useState(getGuestProfile);
  const [name, setName] = useState(profile.name);
  const [sessionInput, setSessionInput] = useState('');
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');
  const [recent] = useState(getRecentBoards);
  const joinInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const previous = document.title;
    document.title = 'Canvas Together · A little space for your next big idea';
    return () => { document.title = previous; };
  }, []);
  const enter = (id: string) => {
    if (name.trim() && !isGuestName(name)) {
      setNameError('Use letters, numbers, spaces, or simple punctuation for your name.');
      document.getElementById('guest-name')?.focus();
      return;
    }
    saveGuestName(name);
    navigate(`/session/${id}`);
  };
  const create = () => {
    try { enter(crypto.randomUUID()); }
    catch { setError('We could not create your board. Please refresh and try again.'); }
  };
  const join = (event: FormEvent) => {
    event.preventDefault();
    const id = parseSessionInput(sessionInput);
    if (!id) {
      setError('Enter a valid board ID or invitation link. IDs use 6–80 letters, numbers, dashes, or underscores.');
      joinInput.current?.focus();
      return;
    }
    setError('');
    enter(id);
  };
  const focusJoin = () => {
    document.getElementById('join-a-board')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    joinInput.current?.focus({ preventScroll: true });
  };

  return <div className="landing-page">
    <nav className="landing-nav" aria-label="Main navigation"><Link to="/" className="brand-link"><CanvasBrand /></Link>
      <div className="landing-nav-links"><a href="#made-for-together">Why together?</a><Link to="/image-classifier"><CanvasIcon name="sparkle" width="16" height="16" /> Image classifier</Link>
        <button className="button button-secondary nav-create" onClick={create}>Open a canvas <CanvasIcon name="arrow" width="16" height="16" /></button></div>
    </nav>
    <main className="landing-main">
      <section className="hero" aria-labelledby="hero-title"><div className="hero-copy">
        <span className="hero-eyebrow"><span /> BIG IDEAS. BETTER TOGETHER.</span>
        <h1 id="hero-title">A little space.<br />For your next<br /><span className="hero-highlight">big idea<svg viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true"><path d="M3 11C75 0 202 2 296 9M29 15c67-7 164-8 222-3" /></svg></span><span className="heading-dot">.</span></h1>
        <p className="hero-description">A shared canvas for your sketches, lightbulb moments, and beautifully unfinished thoughts. Bring your people. Make something together.</p>
        <div className="guest-identity"><span className="guest-avatar" aria-hidden="true">{initials(name)}</span><label htmlFor="guest-name"><span>YOU’RE JOINING AS</span>
          <input id="guest-name" value={name} maxLength={30} onChange={event => { setName(event.target.value); setNameError(''); }}
            onBlur={() => { if (!name.trim() || isGuestName(name)) setName(saveGuestName(name).name); }}
            onFocus={event => event.currentTarget.select()} aria-label="Your guest display name" placeholder="Your name" autoComplete="nickname"
            aria-invalid={!!nameError} aria-describedby={nameError ? 'guest-name-error' : undefined} /></label><span className="guest-badge">Guest</span></div>
        {nameError && <p className="form-error guest-name-error" id="guest-name-error" role="alert">{nameError}</p>}
        <div className="hero-actions"><button className="button button-primary button-large" onClick={create}><CanvasIcon name="plus" /> Start a fresh canvas</button>
          <button className="button button-quiet" onClick={focusJoin}>Join a board <CanvasIcon name="arrow" width="17" height="17" /></button></div>
        <p className="hero-reassurance"><CanvasIcon name="check" width="15" height="15" /> No sign-up. No setup. Just a spark.</p>
      </div><HeroPreview /></section>

      <section className="join-section" id="join-a-board" aria-labelledby="join-title"><div className="join-copy"><span className="join-icon"><CanvasIcon name="link" width="24" height="24" /></span>
        <div><h2 id="join-title">Already have a place to meet?</h2><p>Drop in with a board ID or an invitation link.</p></div></div>
        <form className="join-form" onSubmit={join}><label className="sr-only" htmlFor="session-input">Board ID or invitation URL</label>
          <div className="join-input-wrap"><input id="session-input" className="text-field" ref={joinInput} value={sessionInput}
            onChange={event => { setSessionInput(event.target.value); setError(''); }} placeholder="Paste a board ID or invitation link" maxLength={2000}
            autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? 'join-error' : undefined} />
            <button type="submit" className="button button-primary">Join board <CanvasIcon name="arrow" width="17" height="17" /></button></div>
          {error && <p className="form-error" id="join-error" role="alert">{error}</p>}
        </form>
      </section>

      {recent.length > 0 && <section className="recent-section" aria-labelledby="recent-title"><div className="section-header"><h2 id="recent-title">Pick up where you left off</h2><span>YOUR RECENT SPACES</span></div>
        <div className="recent-boards">{recent.map(board => <button className="recent-board" key={board.id} onClick={() => enter(board.id)}>
          <span className="recent-icon"><CanvasIcon name="rectangle" /></span><span><strong>Board {board.id.slice(0, 8)}</strong><small><CanvasIcon name="clock" width="12" height="12" /> {new Date(board.visitedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span>
          <CanvasIcon name="arrow" width="17" height="17" /></button>)}</div></section>}

      <section className="features-section" id="made-for-together" aria-labelledby="features-title"><div className="features-heading"><span className="eyebrow">LESS FRICTION. MORE FLOW.</span>
        <h2 id="features-title">Made for the way ideas happen.</h2><p>Not always in a straight line. Always better with company.</p></div>
        <div className="feature-grid">{FEATURES.map(feature => <article className="feature-card" key={feature.title}><span className={`feature-icon ${feature.color}`}><CanvasIcon name={feature.icon} width="24" height="24" /></span>
          <h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
      </section>
      <section className="landing-callout"><span className="callout-spark" aria-hidden="true">✳</span><div><h2>Your next “what if?” starts here.</h2><p>One link, a few curious minds, and room to explore.</p></div>
        <button className="button button-primary" onClick={create}>Let’s make something <CanvasIcon name="arrow" width="17" height="17" /></button></section>
    </main>
    <footer className="landing-footer"><CanvasBrand compact /><span>A shared space for beautifully human ideas.</span><span className="footer-note"><i /> Made for together.</span></footer>
  </div>;
}
