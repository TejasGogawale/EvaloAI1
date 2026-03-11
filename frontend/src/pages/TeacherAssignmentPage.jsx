// TeacherAssignmentPage.jsx - SIMPLIFIED VERSION (Uses backend API)
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { authFetchJSON } from "../authFetch";
import TopNavTeacher from "../components/TopNavTeacher";
import TeacherSidebar from "../components/TeacherSidebar";
import "../styles/TeacherAssignment.css";
import { supabase } from "../supabaseClient";
import { listTeacherClassrooms } from "../api";

export default function TeacherAssignmentPage() {
  const nav = useNavigate();
  const { classId, assignmentId } = useParams();
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);
      const rows = await listTeacherClassrooms();
      setClasses(rows || []);
    })();
  }, []);


  // Fetch data using backend API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // Fetch assignment details
        const assignmentData = await authFetchJSON(
          `/api/teacher/classrooms/${classId}/assignments/${assignmentId}`
        );
        setAssignment(assignmentData);

        // Fetch submissions with student data (all in one call!)
        const submissionsData = await authFetchJSON(
          `/api/teacher/assignments/${assignmentId}/submissions`
        );

        setSubmissions(submissionsData.submissions || []);
        setStats(submissionsData.stats || {});

        console.log("[Teacher] Loaded", submissionsData.submissions?.length, "submissions");
      } catch (e) {
        console.error("[Teacher] Error:", e);
        setErr(e.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    if (classId && assignmentId) {
      fetchData();
    }
  }, [classId, assignmentId]);

  // Filter submissions by search
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return submissions;
    return submissions.filter(
      (s) =>
        (s.student_name || "").toLowerCase().includes(query) ||
        (s.student_email || "").toLowerCase().includes(query)
    );
  }, [search, submissions]);

  // Get badge class based on score
  const getScoreBadge = (score, type = "grade") => {
    if (score === null || score === undefined) return "badge-gray";

    if (type === "grade") {
      if (score >= 80) return "badge-green";
      if (score >= 60) return "badge-yellow";
      return "badge-red";
    }

    if (type === "plagiarism" || type === "ai") {
      if (score >= 75) return "badge-red";
      if (score >= 50) return "badge-yellow";
      return "badge-green";
    }

    return "badge-gray";
  };

  return (
    <div className={`cp-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
      <TopNavTeacher
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
        rightAction={
          <button
            className="btn-create"
            onClick={() =>
              nav(`/teacher/class/${classId}/assignments/${assignmentId}/edit`)
            }
          >
            Edit
          </button>
        }
      />

      <TeacherSidebar
        classes={classes}
        open={sidebarOpen}
      />

      <main className="cp-main">
        {/* HEADER */}
        <header className="tclass-header sticky">
          <div className="tasg-titlewrap">
            <h1 className="tasg-title">{assignment?.title || "Assignment"}</h1>
            <div className="tasg-sub">
              Created:{" "}
              {assignment?.created_at
                ? new Date(assignment.created_at).toLocaleDateString()
                : "—"}
            </div>
          </div>
        </header>

        {/* ASSIGNMENT DETAILS */}
        <section className="tasg-summary">
          <div className="tasg-card">
            <div className="tasg-label">Description</div>
            <div className="tasg-value">{assignment?.description || "—"}</div>
          </div>
          <div className="tasg-card">
            <div className="tasg-label">Points</div>
            <div className="tasg-value">{assignment?.max_points ?? "—"} points</div>
          </div>
          <div className="tasg-card">
            <div className="tasg-label">Due</div>
            <div className="tasg-value">
              {assignment?.due_at
                ? new Date(assignment.due_at).toLocaleDateString()
                : "No due date"}
            </div>
          </div>
        </section>

        {/* STATISTICS */}
        <section className="tasg-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.total || 0}</div>
            <div className="stat-label">Total Submissions</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.graded || 0}</div>
            <div className="stat-label">Graded</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {stats.avg_grade ? Math.round(stats.avg_grade) : 0}%
            </div>
            <div className="stat-label">Average Grade</div>
          </div>
          <div className="stat-card">
            <div className="stat-value danger">{stats.flagged || 0}</div>
            <div className="stat-label">Flagged for Review</div>
          </div>
        </section>

        {/* ERROR MESSAGE */}
        {err && <div className="error-banner">⚠️ {err}</div>}

        {/* SEARCH + TABLE */}
        <section className="tasg-analytics">
          <div className="tasg-toolbar">
            <input
              className="tasg-search"
              placeholder="Search student by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="tasg-toolbar-info">
              Showing {filtered.length} of {submissions.length} submissions
            </div>
          </div>

          <div className="tasg-tablewrap">
            <table className="tasg-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Grade</th>
                  <th>AI %</th>
                  <th>Plagiarism %</th>
                  <th>Model Review</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="tasg-empty">
                      Loading submissions…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="tasg-empty">
                      {search
                        ? "No students found matching your search."
                        : "No submissions found."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((sub) => {
                    const gradePercent = sub.grade_percent !== null
                      ? Math.round(sub.grade_percent)
                      : null;
                    const aiPercent = sub.ai_probability !== null
                      ? Math.round(sub.ai_probability * 100)
                      : null;
                    const plagiarismPercent = sub.plagiarism_score !== null
                      ? Math.round(sub.plagiarism_score * 100)
                      : null;

                    return (
                      <tr
                        key={sub.id}
                        className={sub.needs_review ? "flagged-row" : ""}
                      >
                        {/* Student Name */}
                        <td className="tasg-student">
                          <div className="student-info">
                            <div className="student-name">{sub.student_name}</div>
                            {sub.student_email && (
                              <div className="student-email">{sub.student_email}</div>
                            )}
                          </div>
                        </td>

                        {/* Grade */}
                        <td>
                          {gradePercent !== null ? (
                            <span
                              className={`score-badge ${getScoreBadge(
                                gradePercent,
                                "grade"
                              )}`}
                            >
                              {gradePercent}%
                            </span>
                          ) : (
                            <span className="badge-gray">Pending</span>
                          )}
                        </td>

                        {/* AI Score */}
                        <td>
                          {aiPercent !== null ? (
                            <div className="integrity-cell">
                              <span
                                className={`score-badge ${getScoreBadge(
                                  aiPercent,
                                  "ai"
                                )}`}
                              >
                                {aiPercent}%
                              </span>
                              {sub.ai_detected && (
                                <span
                                  className="warning-icon"
                                  title="AI content detected"
                                >
                                  🤖
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="badge-gray">—</span>
                          )}
                        </td>

                        {/* Plagiarism Score */}
                        <td>
                          {plagiarismPercent !== null ? (
                            <div className="integrity-cell">
                              <span
                                className={`score-badge ${getScoreBadge(
                                  plagiarismPercent,
                                  "plagiarism"
                                )}`}
                              >
                                {plagiarismPercent}%
                              </span>
                              {sub.plagiarism_detected && (
                                <>
                                  <span
                                    className="warning-icon"
                                    title="Plagiarism detected"
                                  >
                                    🔍
                                  </span>
                                  {sub.plagiarism_matches &&
                                    sub.plagiarism_matches.length > 0 && (
                                      <div className="plagiarism-tooltip">
                                        Similar to:{" "}
                                        {sub.plagiarism_matches
                                          .map((m) => m.source)
                                          .join(", ")}
                                      </div>
                                    )}
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="badge-gray">—</span>
                          )}
                        </td>

                        {/* Review Status */}
                        <td className="tasg-review">
                          {sub.needs_review ? (
                            <span className="review-badge needs-review">
                              ⚠️ Needs Review
                            </span>
                          ) : sub.graded_at ? (
                            <span className="review-badge approved">
                              ✅ Approved
                            </span>
                          ) : (
                            <span className="review-badge pending">
                              ⏳ Grading...
                            </span>
                          )}

                          {/* Show integrity flags */}
                          {sub.integrity_flags && sub.integrity_flags.length > 0 && (
                            <div className="integrity-flags">
                              {sub.integrity_flags.map((flag, idx) => (
                                <span key={idx} className="flag-tag">
                                  {flag}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* File Preview */}
                        <td>
                          {sub.file_url ? (
                            <a
                              className="tasg-link"
                              href={sub.file_url}
                              target="_blank"
                              rel="noreferrer"
                              title={sub.file_name || "View file"}
                            >
                              📄 Preview
                            </a>
                          ) : (
                            <span className="tasg-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* LEGEND */}
        {submissions.length > 0 && (
          <section className="tasg-legend">
            <h3>Legend:</h3>
            <div className="legend-items">
              <div className="legend-item">
                <span className="score-badge badge-green">80%+</span>
                <span>Good grade / Low risk</span>
              </div>
              <div className="legend-item">
                <span className="score-badge badge-yellow">60-79%</span>
                <span>Average grade / Moderate risk</span>
              </div>
              <div className="legend-item">
                <span className="score-badge badge-red">&lt;60%</span>
                <span>Low grade / High risk</span>
              </div>
              <div className="legend-item">
                <span className="warning-icon">🤖</span>
                <span>AI-generated content detected</span>
              </div>
              <div className="legend-item">
                <span className="warning-icon">🔍</span>
                <span>Plagiarism detected</span>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}