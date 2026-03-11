// TeacherClassCard.jsx
import React from "react";

/**
 * Props:
 *  - klass: {
 *      id, name, code,
 *      member_count?, assignment_count?
 *    }
 *  - onOpen: () => void            // called when card is clicked/Enter/Space
 *  - onMenu?: (e) => void          // optional 3-dot menu click
 */
export default function TeacherClassCard({ klass, onOpen, onMenu }) {
  const members = klass?.student_count ?? 0;
  const assignments = klass?.assignment_count ?? 0;

  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(klass?.code || ""));
      // optional: replace with your toast
      alert("Class code copied:", klass?.code);
    } catch {
      alert("Could not copy class code");
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <div className="td-card" role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKey}>
      <div className="td-card-row">
        <div className="td-name">{klass?.name || "Untitled"}</div>
        <button className="gc-kebab" onClick={(e) => e.stopPropagation()} aria-label="More options">⋮</button>
      </div>
      <div className="td-code-row">
        <span className="td-code-label">Class code:</span>
        <span className="td-code-value">{klass?.code || "—"}</span>
        {klass.code && <button className="td-copy" onClick={handleCopy}>Copy</button>}
      </div>
      <div className="td-stats">
        <div className="td-stat"><span className="td-stat-ic">👥</span><span>{members ?? 0}</span></div>
        <div className="td-stat"><span className="td-stat-ic">🗂️</span><span>{assignments ?? 0}</span></div>
      </div>
    </div>
  );

}
