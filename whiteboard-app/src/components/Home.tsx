import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const navigate = useNavigate();
  const [sessionId, setSessionId] = useState('');

  const createSession = () => {
    const id = uuidv4(); // generates a unique session ID
    navigate(`/session/${id}`);
  };

  const joinSession = () => {
    if (sessionId.trim()) {
      navigate(`/session/${sessionId}`);
    }
  };

  return (
    <div className="container mt-5 text-center">
      <h1>Collaborative Whiteboard</h1>
      <button className="btn btn-primary m-3" onClick={createSession}>Create New Session</button>
      <div>
        <input
          type="text"
          placeholder="Enter Session ID"
          className="form-control d-inline w-50"
          onChange={(e) => setSessionId(e.target.value)}
        />
        <button className="btn btn-success m-2" onClick={joinSession}>Join Session</button>
      </div>
    </div>
  );
}
