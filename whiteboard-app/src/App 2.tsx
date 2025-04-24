import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';

import Whiteboard from './components/WhiteBoard';
import ImageClassifier from './components/ImageClassifier';

function App() {
  return (
    <div className="App">
      {/* Header Section */}
      <header className="bg-dark text-white text-center py-4 shadow">
        <h1 className="display-5">Real-Time Collaborative Whiteboard</h1>
        <p className="lead">Collaborate, draw, and classify images seamlessly</p>
      </header>

      {/* Main Content */}
      <main className="container mt-4">
        {/* Authentication Section */}
        <section className="mb-5">
          <div className="card shadow-sm">
            <div className="card-header bg-info text-white">
              <h2 className="h4 mb-0">Authentication</h2>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Please <a href="/login" className="text-info">log in</a> or <a href="/signup" className="text-info">sign up</a> to access the whiteboard.
              </p>
            </div>
          </div>
        </section>

        {/* Whiteboard Section */}
        <section className="mb-5">
          <div className="card shadow-sm">
            <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
              <h2 className="h4 mb-0">Whiteboard</h2>
              <div>
                <button className="btn btn-light btn-sm me-2">New Session</button>
                <button className="btn btn-light btn-sm">Join Session</button>
              </div>
            </div>
            <div className="card-body">
              <Whiteboard />
              <div className="mt-3 d-flex justify-content-between">
                <button className="btn btn-secondary btn-sm">Undo</button>
                <button className="btn btn-secondary btn-sm">Redo</button>
                <button className="btn btn-success btn-sm">Save as Image</button>
                <button className="btn btn-success btn-sm">Save as PDF</button>
              </div>
            </div>
          </div>
        </section>

        {/* Image Classifier Section */}
        <section className="mb-5">
          <div className="card shadow-sm">
            <div className="card-header bg-success text-white">
              <h2 className="h4 mb-0">Image Classifier</h2>
            </div>
            <div className="card-body">
              <p className="text-muted">
                Upload an image to classify it using TensorFlow.js and MobileNet.
              </p>
              <ImageClassifier />
            </div>
          </div>
        </section>
      </main>

      {/* Footer Section */}
      <footer className="text-center py-3 bg-light mt-5 border-top">
        <small className="text-muted">
          Built with ❤️ using React, TypeScript, and Bootstrap
        </small>
      </footer>
    </div>
  );
}

export default App;