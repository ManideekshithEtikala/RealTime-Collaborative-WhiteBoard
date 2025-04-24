import React, { useEffect, useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import keycloak from './keycloak'; // Keycloak configuration
import Whiteboard from './components/WhiteBoard';
import ImageClassifier from './components/ImageClassifier';
import Home from './components/Home';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Ensure Keycloak is initialized only once
    if (!keycloak.authenticated) {
      keycloak.init({ onLoad: 'login-required' }).then((authenticated: boolean) => {
        setIsAuthenticated(authenticated);
      });
    }
  }, []);

  // Show a loading screen while Keycloak initializes
  if (!isAuthenticated) {
    return <div className="text-center mt-5">Loading...</div>;
  }

  return (
    <div className="App">
      {/* Header Section */}
      <header className="bg-dark text-white text-center py-4 shadow">
        <div className="container">
          <h1 className="display-5">Real-Time Collaborative Whiteboard</h1>
          <p className="lead">Collaborate, draw, and classify images seamlessly</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="container-fluid mt-4">
        <Router>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/session/:id" element={<Whiteboard />} />
            <Route path="/image-classifier" element={<ImageClassifier />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Router>
      </main>

      {/* Footer Section */}
      <footer className="bg-dark text-white text-center py-3 mt-4">
        <div className="container">
          <p className="mb-0">© 2025 Collaborative Whiteboard. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;