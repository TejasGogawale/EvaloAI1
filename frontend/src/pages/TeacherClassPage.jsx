// TeacherClassPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getClassroom, listAssignments, getAssignmentsForClass, listTeacherClassrooms } from "../api";
import { authFetchJSON } from "../authFetch";
import TeacherSidebar from "../components/TeacherSidebar";
import TopNavTeacher from "../components/TopNavTeacher"; // keep your existing top bar
import "../styles/TeacherClass.css";
import AssignmentCreateModal from "../components/AssignmentCreateModal";
import { supabase } from "../supabaseClient";

export default function TeacherClassPage() {
  const { id: classId } = useParams();
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // ui
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("stream"); // 'stream' | 'students'

  // data
  const [klass, setKlass] = useState(null);
  const [loadingClass, setLoadingClass] = useState(true);

  const [assignments, setAssignments] = useState([]);
  const [loadingAssigns, setLoadingAssigns] = useState(true);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);

  

  useEffect(() => {
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user || null);
        const rows = await listTeacherClassrooms();
        setClasses(rows || []);
      })();
    }, []);

  // fetch class meta
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setLoadingClass(true);
        const data = await getClassroom(classId);
        if (!aborted) setKlass(data);
      } catch (e) {
        console.error("[TeacherClassPage] load class failed:", e);
      } finally {
        if (!aborted) setLoadingClass(false);
      }
    })();
    return () => { aborted = true; };
  }, [classId]);

  // fetch assignments for the class (teacher can see their uploads)
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setLoadingAssigns(true);
        const list = await listAssignments(classId);
        if (!aborted) setAssignments(Array.isArray(list) ? list : []);
      } catch (e) {
        console.error("[TeacherClassPage] list assignments failed:", e);
      } finally {
        if (!aborted) setLoadingAssigns(false);
      }
    })();
    return () => { aborted = true; };
  }, [classId]);

  const classTitle = useMemo(() => klass?.name || "—", [klass]);

  const onCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(klass?.code || "");
      alert("Copied: " + (klass?.code || ""));
    } catch (e) {
      console.warn("Clipboard not available; fallback shown.");
    }
  };

  const rightTopAction = (
    <button className="cp-cta" onClick={() => { /* wire later */ }}>
      Create+
    </button>
  );

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getAssignmentsForClass(classId);
      setAssignments(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error("[TeacherClassPage] loadAssignments failed:", e);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  return (
    <div className={`cp-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      {/* Top bar identical style to student page */}
      <TopNavTeacher
        onToggleSidebar={() => setSidebarOpen(s => !s)}
        rightAction={rightTopAction}
      />

      {/* Sidebar (teacher version) */}
      <TeacherSidebar classes={classes}
        open={sidebarOpen}
      />

      <AssignmentCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        classId={klass?.id}
        onCreated={() => {
          setShowCreate(false);
          loadAssignments();
        }} // reuse your fetch to refresh list
      />

      {/* Content */}
      <main className="cp-main">
        {/* Header band with class title */}
        <header className="tclass-header">
          <h1 className="tclass-title">{klass?.name.toUpperCase() || "Class"}</h1>

          <nav className="tclass-tabs">
            <button className={`tclass-tab ${activeTab === "stream" ? "tclass-tab--active" : ""}`} onClick={() => setActiveTab("stream")}>Stream</button>
            <button className={`tclass-tab ${activeTab === "students" ? "tclass-tab--active" : ""}`} onClick={() => setActiveTab("students")}>Students</button>
          </nav>

          <div className="tclass-create">
            <button className="btn-create" onClick={() => setShowCreate(true)}>Create+</button>
          </div>
        </header>

        {activeTab === "stream" && (
          <section className="tclass-stream">
            <aside className="tclass-left">
              <div className="tclass-side-card">
                <div className="tclass-ccode">
                  <span className="tclass-ccode-label">Class code</span>
                  <span className="tclass-ccode-value">{klass?.code}</span>
                </div>
                <div className="tclass-copy">
                  <button onClick={onCopyCode}>Copy</button>
                </div>
              </div>
            </aside>

            <div className="tclass-right">
              {assignments.length === 0 ? (
                <div className="tclass-empty">Click on the <b>Create+</b> button to upload assignments</div>
              ) : assignments.map(a => (
                <article key={a.id} className="t-assignment" onClick={() => nav(`/teacher/class/${classId}/assignments/${a.id}`)}>
                  <div className="t-a-head">
                    <div className="t-a-title">{a.title}</div>
                    <div className="t-a-menu">⋮</div>
                  </div>
                  <div className="t-a-desc">{a.description}</div>
                  <div className="t-a-meta">{new Date(a.created_at).toLocaleDateString()}</div>
                </article>
              ))}
            </div>
          </section>
        )}


        {activeTab === "students" && (
          <section className="cp-grid">
            <div className="cp-empty">Students tab coming soon.</div>
          </section>
        )}

      </main>
    </div>
  );
}

/* ---------- helpers ---------- */

function formatWhen(ts) {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch { return ""; }
}

// Small API helper (teacher sees their own class meta)
async function getTeacherClassroom(classId) {
  // backend endpoint we added previously:
  // GET /api/teacher/classrooms/:id
  return await authFetchJSON(`/api/teacher/classrooms/${classId}`);
}
