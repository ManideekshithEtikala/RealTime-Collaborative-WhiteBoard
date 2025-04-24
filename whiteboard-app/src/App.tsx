import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Whiteboard from './components/WhiteBoard';
import ImageClassifier from './components/ImageClassifier';
import Home from './components/Home';
import { useKeycloak } from '@react-keycloak/web';


function App() {
  const { keycloak, initialized } = useKeycloak();


  if (!initialized) {
    return <div className="text-center mt-5">Initializing...</div>;
  }
  
  if (!keycloak.authenticated) {
    return <div className="text-center mt-5">Redirecting to login...</div>; // no manual login call here
  }

  return (
    <div className="App">
      <header className="bg-dark text-white text-center py-4 shadow">
        <div className="container">
          <h1 className="display-5">Real-Time Collaborative Whiteboard</h1>
          <p className="lead">Collaborate, draw, and classify images seamlessly</p>
        </div>
      </header>

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

      <footer className="bg-dark text-white text-center py-3 mt-4">
        <div className="container">
          <p className="mb-0">© 2025 Collaborative Whiteboard. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
