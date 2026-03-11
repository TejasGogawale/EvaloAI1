// api.js
import { authFetch, authFetchJSON } from "./authFetch";
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

async function authJSON(url, init) {
  const r = await authFetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `${r.status} ${r.statusText}`);
  return j;
}


export const createClassroom = (name) =>
  authFetchJSON(`/api/classrooms`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });

export const listClassrooms = () => authFetchJSON(`/api/classrooms`);

export const joinClassroom = (code) =>
  authFetchJSON(`/api/classrooms/join`, {
    method: "POST",
    body: JSON.stringify({ code }),
  });

export const listAssignments = (classId) =>
  authFetchJSON(
    classId
      ? `/api/assignments?classId=${encodeURIComponent(classId)}`
      : `/api/assignments`
  );

export const createAssignment = (payload) =>
  authFetchJSON(`/api/assignments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const listSubmissions = (assignmentId) =>
  authFetchJSON(
    assignmentId
      ? `/api/submissions?assignmentId=${encodeURIComponent(assignmentId)}`
      : `/api/submissions`
  );

export async function submitAnswer(payload) {
  return authFetchJSON(`/api/submissions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export const getAssignment = (id) => authFetchJSON(`/api/assignments/${id}`);

export async function getMySubmission(assignmentId) {
  const j = await authJSON(`${BASE}/api/assignments/${assignmentId}/my-submission`);
  return j; // null or full row
}

export async function createSubmission({ assignmentId, attachments, content = null }) {
  const j = await authJSON(`${BASE}/api/assignments/${assignmentId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attachments, content }),
  });
  return j.submission; // canonical row
}

export async function unsubmit({ assignmentId }) {
  const j = await authJSON(`${BASE}/api/assignments/${assignmentId}/unsubmit`, {
    method: "POST",
  });
  return j.submission; // canonical row (cleared)
}

export async function listTeacherClassrooms() {
  const r = await authFetch(`${BASE}/api/teacher/classrooms`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Failed to load classes");
  return d; // [{ id, name, code, created_at }, ...]
}

// api.js
export async function getAssignmentsForClass(classId) {
  return authFetchJSON(`/api/teacher/classrooms/${classId}/assignments`);
}


export async function createTeacherClassroom(name) {
  // accept either a string or an object and normalize
  const payload =
    typeof name === "string"
      ? { name: name.trim() }
      : { name: (name?.name ?? "").trim() };

  if (!payload.name) throw new Error("Class name required");

  const res = await authFetch(`${BASE}/api/teacher/classrooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Create class failed");

  // { classroom: {...} }
  return data;
}

// Fetch one classroom the current user owns or is a member of
export const getClassroom = async (id) => {
  const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
  const r = await authFetch(`${BASE}/api/classrooms/${encodeURIComponent(id)}`);
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error || "Failed to load classroom");
  return d; // {id, name, code, owner, ...}
};

// api.js (add)
export async function apiListTurnedInSubmissions(assignmentId) {
  return authFetchJSON(`/api/teacher/assignments/${assignmentId}/submissions`);
}



