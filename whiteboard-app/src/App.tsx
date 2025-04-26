import React, { useEffect, useState ,useRef} from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import Keycloak from 'keycloak-js';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Whiteboard from './components/WhiteBoard';
import ImageClassifier from './components/ImageClassifier';
import Home from './components/Home';
import Invitationsystem from './components/Invitationsystem';


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [keycloakInstance, setKeycloakInstance] = useState<Keycloak.KeycloakInstance | null>(null);
  const isRun=useRef(false);
  useEffect(() => {
    if(isRun.current)return;
    isRun.current=true
    const keycloak = new (Keycloak as any)({
      url: process.env.REACT_APP_KEYCLOAK_URL || 'http://localhost:8080/auth',
      realm: 'testyt',
      clientId: 'myclient',
    });

    keycloak.init({ onLoad: 'login-required', checkLoginIframe: false }) // disable iframe loop
      .then((authenticated: boolean) => {
        console.log("Authenticated:", authenticated);
        if (authenticated) {
          setKeycloakInstance(keycloak);
          setIsAuthenticated(true);

          // Refresh token every 60s
          setInterval(() => {
            keycloak.updateToken(70).then((refreshed: boolean) => {
              if (refreshed) {
                console.log("Token refreshed ✅");
              } else {
                console.log("Token still valid ⏳");
              }
            }).catch(() => {
              console.error("Failed to refresh token ❌");
              keycloak.logout();
            });
          }, 60000);
        } else {
          keycloak.login();
        }
      })
      .catch((error: any) => {
        console.error("Keycloak init failed", error);
      });
  }, []);

  if (!isAuthenticated) {
    return <div className="text-center mt-5">Loading Keycloak...</div>;
  }

  return (
    <div className="App">
      <header className="bg-primary text-white text-center py-4 shadow fw-bold fs-4"> 
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
    </div>
  );
}

export default App;
