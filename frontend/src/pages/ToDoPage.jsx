import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import TopNav from "../components/TopNav";
import StudentSidebar from "../components/StudentSidebar";
import { listClassrooms, listAssignments, listSubmissions } from "../api";
import { useNavigate, Link } from "react-router-dom";

const fmt = (d) => new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function ToDoPage() {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [classes, setClasses] = useState([]);
  const [classFilter, setClassFilter] = useState("all"); // "all" | classroomId

  const [assignmentsByClass, setAssignmentsByClass] = useState({}); // {classId: Assignment[]}
  const [mySubs, setMySubs] = useState([]); // submissions of this student
  const [activeTab, setActiveTab] = useState("assigned");

  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);

      const joined = await listClassrooms();
      setClasses(joined);

      // Load submissions once (we’ll compute Assigned/Missing/Done from this)
      const subs = await listSubmissions();
      setMySubs(subs || []);

      // Load assignments for each joined class (works even if listAssignments requires classId)
      const pairs = await Promise.all(
        (joined || []).map(async (c) => {
          const items = await listAssignments(c.id);
          return [c.id, items || []];
        })
      );
      const map = Object.fromEntries(pairs);
      setAssignmentsByClass(map);
    })();
  }, []);

  // Helpers
  const subByAssignment = useMemo(() => {
    const m = new Map();
    (mySubs || []).forEach((s) => m.set(s.assignment_id, s));
    return m;
  }, [mySubs]);

  // Build flat list depending on filter
  // Assigned: not submitted yet and not past due
  const filteredAssigned = useMemo(() => {
    const list = [];
    const classIds = classFilter === "all" ? classes.map((c) => c.id) : [classFilter];

    classIds.forEach((cid) => {
      const arr = assignmentsByClass[cid] || [];
      arr.forEach((a) => {
        const submission = subByAssignment.get(a.id);
        const isTurnedIn = submission?.status === "turned_in";
        const isPastDue = a.due_at && new Date(a.due_at) < new Date();

        // Show in Assigned if: not turned in AND not past due
        if (!isTurnedIn && !isPastDue) {
          list.push({ ...a, classroom_id: cid });
        }
      });
    });

    return list.sort((a, b) => {
      if (a.due_at && b.due_at) return new Date(a.due_at) - new Date(b.due_at);
      if (a.due_at && !b.due_at) return -1;
      if (!a.due_at && b.due_at) return 1;
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [classFilter, classes, assignmentsByClass, subByAssignment]);

  // Missing: not submitted and past due date
  const filteredMissing = useMemo(() => {
    const list = [];
    const classIds = classFilter === "all" ? classes.map((c) => c.id) : [classFilter];

    classIds.forEach((cid) => {
      const arr = assignmentsByClass[cid] || [];
      arr.forEach((a) => {
        const submission = subByAssignment.get(a.id);
        const isTurnedIn = submission?.status === "turned_in";
        const isPastDue = a.due_at && new Date(a.due_at) < new Date();

        // Show in Missing if: not turned in AND past due
        if (!isTurnedIn && isPastDue) {
          list.push({ ...a, classroom_id: cid });
        }
      });
    });

    return list.sort((a, b) => {
      // Sort by due date (most recent missed first)
      if (a.due_at && b.due_at) return new Date(b.due_at) - new Date(a.due_at);
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [classFilter, classes, assignmentsByClass, subByAssignment]);

  // Done: submitted (turned_in status)
  const filteredDone = useMemo(() => {
    const list = [];
    const classIds = classFilter === "all" ? classes.map((c) => c.id) : [classFilter];

    classIds.forEach((cid) => {
      const arr = assignmentsByClass[cid] || [];
      arr.forEach((a) => {
        const submission = subByAssignment.get(a.id);
        const isTurnedIn = submission?.status === "turned_in";

        if (isTurnedIn) {
          list.push({
            ...a,
            classroom_id: cid,
            submitted_at: submission.submitted_at
          });
        }
      });
    });

    return list.sort((a, b) => {
      // Sort by submission date (most recent first)
      if (a.submitted_at && b.submitted_at) {
        return new Date(b.submitted_at) - new Date(a.submitted_at);
      }
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [classFilter, classes, assignmentsByClass, subByAssignment]);

  // Choose which list to display based on active tab
  const currentList = useMemo(() => {
    switch (activeTab) {
      case "assigned": return filteredAssigned;
      case "missing": return filteredMissing;
      case "done": return filteredDone;
      default: return filteredAssigned;
    }
  }, [activeTab, filteredAssigned, filteredMissing, filteredDone]);

  const currentClassName = useMemo(() => {
    if (classFilter === "all") return "All classes";
    return classes.find((c) => String(c.id) === String(classFilter))?.name || "Class";
  }, [classFilter, classes]);

  return (
    <>
      <TopNav
        user={user}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        showJoin={false} // No join button on To-Do
      />

      <StudentSidebar
        classes={classes}
        open={sidebarOpen}
        selectedId={null} // no highlight on To-Do
        onSelectClass={(id) => nav(`/class/${id}`)}
      />

      <main className={`gc-content ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <section className="todo-head">
          <div className="todo-tabs">
            <button
              className={`todo-tab ${activeTab === "assigned" ? "active" : ""}`}
              onClick={() => setActiveTab("assigned")}
            >
              Assigned
            </button>
            <button
              className={`todo-tab ${activeTab === "missing" ? "active" : ""}`}
              onClick={() => setActiveTab("missing")}
            >
              Missing
            </button>
            <button
              className={`todo-tab ${activeTab === "done" ? "active" : ""}`}
              onClick={() => setActiveTab("done")}
            >
              Done
            </button>
          </div>

          <div className="todo-filter">
            <select
              className="input todo-select"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
            >
              <option value="all">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="todo-list">
          {currentList.length === 0 ? (
            <div className="todo-empty">
              {activeTab === "assigned" && "No assigned assignments yet"}
              {activeTab === "missing" && "No missing assignments"}
              {activeTab === "done" && "No completed assignments yet"}
            </div>
          ) : (
            currentList.map((a) => {
              const cls = classes.find((c) => String(c.id) === String(a.classroom_id));
              return (
                <Link
                  key={a.id}
                  to={`/assignment/${a.id}`}
                  state={{ classId: a.classroom_id, assignment: a }}
                  className={`todo-item link-reset ${activeTab === "missing" ? "todo-item-missing" : ""} ${activeTab === "done" ? "todo-item-done" : ""}`}
                >
                  <div className="todo-icon">📄</div>
                  <div className="todo-main">
                    <div className="todo-title">
                      <strong>{cls?.name || "Class"}</strong> —{" "}
                      <span className="todo-post">
                        {cls?.teacher_name || "Teacher"} posted a new assignment:{" "}
                        <strong>{a.title}</strong>
                      </span>
                    </div>
                    {a.prompt && <div className="todo-body">{a.prompt}</div>}
                  </div>
                  <div className="todo-meta">
                    {activeTab === "done" ? (
                      <span className="todo-submitted">
                        Turned in {a.submitted_at ? `- ${fmt(a.submitted_at)}` : ""}
                      </span>
                    ) : a.due_at ? (
                      <span className={`todo-due ${activeTab === "missing" ? "todo-due-missed" : ""}`}>
                        {activeTab === "missing" ? "Missed" : "Due"} - {fmt(a.due_at)}
                      </span>
                    ) : (
                      <span className="todo-nodue">No due date</span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </section>
      </main>
    </>
  );
}
