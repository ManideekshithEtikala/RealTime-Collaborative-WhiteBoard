import React, { useState } from "react";
import axios from "axios"; // For making API requests

const InviteModal = ({ sessionId }: { sessionId: string }) => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleInvite = async () => {
    if (!email.trim()) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post("/api/invite", { email, sessionId });
      setIsLoading(false);
      if (response.status === 200) {
        alert("Invitation sent successfully!");
        setEmail("");
      }
    } catch (error) {
      setIsLoading(false);
      setErrorMessage("Error sending invitation. Please try again.");
    }
  };

  return (
    <div className="modal fade" id="inviteModal" tabIndex={-1} aria-labelledby="inviteModalLabel" aria-hidden="true">
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title" id="inviteModalLabel">
              Invite a User
            </h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div className="modal-body">
            <input
              type="email"
              className="form-control"
              placeholder="Enter email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errorMessage && <div className="text-danger mt-2">{errorMessage}</div>}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              data-bs-dismiss="modal"
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleInvite}
              disabled={isLoading}
            >
              {isLoading ? "Sending..." : "Send Invitation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteModal;
