import React, { useState, useRef } from "react";
import { authFetchJSON } from "../authFetch"; // same helper you use elsewhere

export default function AssignmentCreateModal({
  open,
  onClose,
  classId,
  onCreated, // callback: (assignment) => {}
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [dueAt, setDueAt] = useState(""); // HTML datetime-local value
  const [points, setPoints] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  if (!open) return null;

  const canSubmit =
    title.trim().length > 0 &&
    desc.trim().length > 0 &&
    /^\d+$/.test(points) &&
    parseInt(points, 10) > 0;

  const onPickFile = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
  };

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("description", desc.trim());
      if (dueAt) fd.append("due_at", new Date(dueAt).toISOString());
      fd.append("max_points", String(parseInt(points, 10)));
      if (file) fd.append("file", file);

      // POST /api/teacher/classrooms/:id/assignments  (multipart/form-data)
      const res = await authFetchJSON(
        `/api/teacher/classrooms/${classId}/assignments`,
        { method: "POST", body: fd }
      );

      // clear & close
      setTitle(""); setDesc(""); setDueAt(""); setPoints(""); setFile(null);
      onClose?.();
      onCreated?.(res); // refresh list on page
    } catch (e) {
      alert(e?.message || "Failed to create assignment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="am-overlay" onMouseDown={(e)=>e.target===e.currentTarget && onClose?.()}>
      <div className="am-dialog" role="dialog" aria-modal="true">
        <h2 className="am-title">Create a new assignment</h2>

        <label className="am-label">Title <span className="am-req">*</span></label>
        <input
          className="am-input"
          placeholder="e.g., Essay on SQL"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <label className="am-label">Description <span className="am-req">*</span></label>
        <textarea
          className="am-textarea"
          rows={4}
          placeholder="Brief instructions / what to submit"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <div className="am-grid">
          <div className="am-col">
            <label className="am-label">Due (optional)</label>
            <input
              className="am-input"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          <div className="am-col">
            <label className="am-label">Max marks <span className="am-req">*</span></label>
            <input
              className="am-input"
              inputMode="numeric"
              placeholder="100"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
            />
          </div>
        </div>

        <label className="am-label">Sample answer <span className="am-req">*</span></label>
        <div className="am-file">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md"
            onChange={onPickFile}
          />
          {file ? <span className="am-file-name">{file.name}</span> :
            <span className="am-file-hint">PDF, DOCX, PPTX…</span>}
        </div>

        <div className="am-footer">
          <button className="am-btn am-btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="am-btn am-btn-primary"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Creating…" : "Create Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
