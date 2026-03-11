import { useEffect, useState } from "react";

export default function JoinClassModal({ open, onClose, onJoin }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const minLen = 6; // “more than 6”

  useEffect(() => {
    if (!open) {
      setCode("");
      setError("");
    }
    // lock scroll when open
    document.body.style.overflow = open ? "hidden" : "";
    return () => (document.body.style.overflow = "");
  }, [open]);

  if (!open) return null;

  const disabled = code.trim().length < minLen;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onJoin(code.trim().toUpperCase());
    } catch (err) {
      setError(err?.message || "Invalid code");
    }
  };

  return (
    <>
      {/* overlay + blur */}
      <div className="gc-join-overlay" onClick={onClose} />

      <div className="gc-join-modal" role="dialog" aria-modal="true">
        <h3 className="gc-join-title">Join a classroom</h3>
        <form onSubmit={submit}>
          <input
            className="input gc-join-input"
            placeholder="Enter Class Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
          {error && <div className="gc-join-error">{error}</div>}
          <div className="gc-join-actions">
            <button type="button" className="btn gc-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={`btn ${disabled ? "gc-btn-disabled" : ""}`} disabled={disabled}>
              Join
            </button>
          </div>
        </form>
        <div className="gc-join-hint">Class code must be at least 6 characters.</div>
      </div>
    </>
  );
}
