import { Component, lazy, Suspense } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Home from './components/Home';
import './App.css';

const Whiteboard = lazy(() => import('./components/WhiteBoard'));
const ImageClassifier = lazy(() => import('./components/ImageClassifier'));

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Application error', error, info.componentStack); }
  render() {
    if (this.state.failed) return <main className="app-fallback" role="alert">
      <h1>Let’s get you back to your canvas.</h1>
      <p>The page could not load. Refresh to reconnect to your saved board.</p>
      <button className="button button-primary" onClick={() => window.location.reload()}>Reload page</button>
      <a className="button button-secondary" href="/">Go home</a>
    </main>;
    return this.props.children;
  }
}

export default function App() {
  return <AppBoundary><BrowserRouter><Suspense fallback={<main className="app-fallback" role="status">Opening your space…</main>}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/session/:id" element={<Whiteboard />} />
      <Route path="/image-classifier" element={<ImageClassifier />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense></BrowserRouter></AppBoundary>;
}
