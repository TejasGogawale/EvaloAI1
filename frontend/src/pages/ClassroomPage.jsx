import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TopNav from "../components/TopNav";
import StudentSidebar from "../components/StudentSidebar";
import { listAssignments, listClassrooms } from "../api";

const fmt = (d) => d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;


export default function ClassroomPage() {
  const { id: classId } = useParams();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [classes, setClasses] = useState([]);
  const [klass, setKlass] = useState(null);
  const [tab, setTab] = useState("hub"); // hub | classwork | people
  const [submissions, setSubmissions] = useState([]);

  const [assignments, setAssignments] = useState([]);
  // announcements optional later; we’ll show the UI from assignments for now
  const announcements = []; // TODO: replace with listAnnouncements(classId) if you add it
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const fetchClassroomMembers = async (classroomId) => {
    if (!classroomId) return;

    setLoadingMembers(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
      const response = await fetch(`${BASE}/api/classrooms/${classroomId}/members`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMembers(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch classroom members:", err);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);

      const cls = await listClassrooms();
      setClasses(cls);
      const k = cls.find(c => String(c.id) === String(classId));
      setKlass(k || null);

      const items = await listAssignments(classId);
      setAssignments(items || []);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const response = await fetch(
            `${import.meta.env.VITE_API_BASE || "http://localhost:5000"}/api/submissions?assignmentId=${classId}`,
            {
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
            }
          );
          if (response.ok) {
            const subs = await response.json();
            setSubmissions(subs || []);
          }
        }
      } catch (err) {
        console.warn("Failed to fetch submissions:", err);
      }

      // Initial fetch if People tab needs data
      if (classId) {
        fetchClassroomMembers(classId);
      }
    })();
  }, [classId]);

  const upcoming = useMemo(() => {
    return (assignments || [])
      .filter(a => a.due_date)           // only those with due date
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 5);
  }, [assignments]);

  const pendingAssignments = useMemo(() => {
    if (!user) return [];

    // Get IDs of assignments that are turned in
    const submittedIds = new Set(
      submissions
        .filter(s => s.status === "turned_in" && s.student_id === user.id)
        .map(s => s.assignment_id)
    );

    // Return only assignments that haven't been submitted
    return assignments.filter(a => !submittedIds.has(a.id));
  }, [assignments, submissions, user]);



  return (
    <>
      <TopNav
        user={user}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onPlus={() => { }}
        showJoin={false}                // ← hide on Classroom page
      />

      <StudentSidebar
        classes={classes}
        open={sidebarOpen}
        selectedId={classId}                // highlight only on class page
        onSelectClass={(id) => (window.location.href = `/class/${id}`)}
      />

      <main className={`gc-content ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        {/* Banner */}
        <section className="cp-hero">
          <div className="cp-hero-title">
            <div className="cp-class-name">{klass?.name || "Classroom"}</div>
            <div className="cp-sub">— {klass?.teacher_name || "Teacher"}</div>
          </div>
        </section>

        {/* Tabs */}
        <div className="cp-tabs">
          <button className={`cp-tab ${tab === "hub" ? "active" : ""}`} onClick={() => setTab("hub")}>My Hub</button>
          <button className={`cp-tab ${tab === "classwork" ? "active" : ""}`} onClick={() => setTab("classwork")}>Classwork</button>
          <button
            className={`cp-tab ${tab === "people" ? "active" : ""}`}
            onClick={() => {
              setTab("people");
              if (members.length === 0) fetchClassroomMembers(classId);
            }}
          >
            People
          </button>
        </div>

        {/* My Hub */}
        {tab === "hub" && (
          <div className="cp-hub">
            <aside className="cp-upcoming">
              <div className="cp-upcoming-title">Upcoming</div>
              {upcoming.length === 0 ? (
                <div className="cp-upcoming-empty">EUUU, no work due.</div>
              ) : (
                <ul className="cp-upcoming-list">
                  {upcoming.map(a => (
                    <li key={a.id}>
                      <div className="cp-up-item-title">{a.title}</div>
                      <div className="cp-up-item-date">{new Date(a.due_date).toLocaleString()}</div>
                      <Link to="#" className="cp-up-link">Open</Link>
                    </li>
                  ))}
                </ul>
              )}
              <div className="cp-up-all">View all</div>
            </aside>

            <section className="cp-stream">


              {/* Stream items: announcements first (when you add them), then assignments */}
              {[...announcements, ...assignments.map(a => ({ _type: "assignment", ...a }))].map((item, i) => {
                if (item._type !== "assignment") {
                  // Announcement UI (placeholder)
                  return (
                    <div className="cp-stream-card" key={`ann-${i}`}>
                      <div className="cp-stream-row">
                        <div className="cp-icon">🛈</div>
                        <div className="cp-stream-main">
                          <div className="cp-stream-title">{item.title}</div>
                          <div className="cp-stream-sub">{new Date(item.created_at).toLocaleString()}</div>
                        </div>
                        <button className="gc-kebab">⋮</button>
                      </div>
                      <div className="cp-stream-body">{item.content}</div>
                    </div>
                  );
                }
                if (assignments.length === 0) {
                  <div className="cp-empty-tab">No assignments posted yet.</div>;
                }
                else {
                  return (
                    <Link className="cp-stream-card link-reset" key={`${item.id}`} to={`/assignment/${item.id}`} state={{ classId: item.classroom_id, assignment: item }}>
                      <div className="cp-stream-row">
                        <div className="cp-icon">📄</div>
                        <div className="cp-stream-main">
                          <div className="cp-stream-title">
                            {klass?.teacher_name || "Teacher"} posted a new assignment: <strong>{item.title}</strong>

                          </div>
                          <div className="cp-stream-sub">
                            {item.due_at ? `Due - ${fmt(item.due_at).toLocaleString()}` : "No due date"}
                          </div>
                        </div>

                      </div>
                      {item.prompt && <div className="cp-stream-body">{item.prompt}</div>}
                    </Link>
                  );
                }
                // Assignment card

              })}
            </section>
          </div>
        )}

        {/* Classwork placeholder */}
        {/* Classwork Tab */}
        {tab === "classwork" && (
          <div className="cp-classwork">
            {pendingAssignments.length === 0 ? (
              <div className="cp-empty-tab">No assignments posted yet.</div>
            ) : (
              <div className="cp-classwork-list">
                {pendingAssignments.map((a) => {
                  const isPastDue = a.due_at && new Date(a.due_at) < new Date();

                  return (
                    <Link
                      key={a.id}
                      to={`/assignment/${a.id}`}
                      state={{ classId, assignment: a }}
                      className="cp-classwork-card"
                    >
                      <div className="cp-classwork-icon">📄</div>

                      <div className="cp-classwork-content">
                        <div className="cp-classwork-title">{a.title}</div>
                        {a.prompt && (
                          <div className="cp-classwork-desc">{a.prompt}</div>
                        )}
                      </div>

                      <div className="cp-classwork-due">
                        {a.due_at ? (
                          <span className={isPastDue ? "due-past" : "due-upcoming"}>
                            Due {fmt(a.due_at)}
                          </span>
                        ) : (
                          <span className="due-none">No due date</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* People placeholder */}
        {/* People Tab */}
        {tab === "people" && (
          <div className="cp-people">
            {loadingMembers ? (
              <div className="cp-empty-tab">Loading people...</div>
            ) : (
              <>
                {/* Teachers Section */}
                <section className="cp-people-section">
                  <div className="cp-people-header">
                    <h3>Teacher</h3>
                  </div>
                  <div className="cp-people-list">
                    {members
                      .filter(m => m.role === "teacher" || m.id === klass?.owner)
                      .map((teacher) => (
                        <div key={teacher.id} className="cp-people-card">
                          <div className="cp-people-avatar">
                            {teacher.name?.charAt(0).toUpperCase() || "T"}
                          </div>
                          <div className="cp-people-info">
                            <div className="cp-people-name">{teacher.name}</div>
                            {teacher.email && (
                              <div className="cp-people-email">{teacher.email}</div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>

                {/* Students Section */}
                <section className="cp-people-section">
                  <div className="cp-people-header">
                    <h3>Classmates</h3>
                    <span className="cp-people-count">
                      {members.filter(m => m.role === "student").length} students
                    </span>
                  </div>
                  <div className="cp-people-list">
                    {members
                      .filter(m => m.role === "student")
                      .map((student) => (
                        <div key={student.id} className="cp-people-card">
                          <div className="cp-people-avatar">
                            {student.name?.charAt(0).toUpperCase() || "S"}
                          </div>
                          <div className="cp-people-info">
                            <div className="cp-people-name">{student.name}</div>
                            {student.email && (
                              <div className="cp-people-email">{student.email}</div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}
