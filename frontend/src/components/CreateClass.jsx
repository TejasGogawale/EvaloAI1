// CreateClass.jsx
import { useEffect, useRef, useState } from "react";
import { createTeacherClassroom } from "../api"; // your existing API
import "../styles/CreateClass.css";

export default function CreateClass({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const cardRef = useRef(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (!cardRef.current) return;
      if (!cardRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, onClose]);

  if (!open) return null;

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createTeacherClassroom(name.trim());
      setName("");
      onCreated?.(created); // refresh list on the dashboard
      onClose?.();
    } catch (e) {
      alert(e.message || "Failed to create class");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="crt-modal-backdrop" />
      <div className="crt-modal-wrap" aria-modal="true" role="dialog" aria-labelledby="crt-modal-title">
        <div ref={cardRef} className="crt-modal-card crt-animate-pop">
          <h3 id="crt-modal-title" className="crt-title">Create a new class</h3>

          <label className="crt-label" htmlFor="crt-class-input">Class name</label>
          <input
            id="crt-class-input"
            className="crt-input"
            placeholder="e.g., DBMS, Grade 9 – Math"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && handleCreate()}
          />

          <p className="crt-hint">Class code will be generated automatically.</p>

          <div className="crt-actions">
            <button className="crt-btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              className="crt-btn primary"
              onClick={handleCreate}
              disabled={!name.trim() || busy}
            >
              {busy ? "Creating…" : "Create Class"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
