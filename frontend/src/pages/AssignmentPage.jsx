import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../supabaseClient";
import TopNav from "../components/TopNav";
import StudentSidebar from "../components/StudentSidebar";
import { getAssignment, listClassrooms, listAssignments, createSubmission, getMySubmission, unsubmit } from "../api";
import { authFetch } from "../authFetch";  // adjust path

const fmt = (d) => d ? new Date(d).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export default function AssignmentPage() {
  const ACCEPT = [".png", ".jpg", ".jpeg", ".pdf", ".doc", ".docx", ".ppt", ".pptx"].join(",");
  const iconFor = (t) => (t === "link" ? "🔗" : "📎");
  const { id: routeId } = useParams();
  const nav = useNavigate();
  const { state } = useLocation(); // { classId, assignment }
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [classes, setClasses] = useState([]);
  const [asg, setAsg] = useState(state?.assignment || null);   // 👈 seed from navigation
  const classId = state?.classId || state?.assignment?.classroom_id || asg?.classroom_id || null;

  // server data (null until fetched or first submit succeeds)
  const [mySubmission, setMySubmission] = useState(null);

  // local UI overrides (used for optimistic updates)
  // status constants
  const STATUS = { ASSIGNED: "assigned", TURNED_IN: "turned_in" };

  const [uiStatus, setUiStatus] = useState(null); // 'assigned' | 'turned-in' | null
  const [pendingAttachments, setPendingAttachments] = useState([]); // chosen, not yet submitted
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [sub, setMySub] = useState(null);
  const [attachments, setAttachments] = useState([]);

  // DERIVED values used everywhere in the JSX
  const status = (uiStatus ?? mySubmission?.status ?? STATUS.ASSIGNED);

  // attachments to show in the card
  // const attachments = mySubmission?.attachments ?? pendingAttachments;

  // editability: once turned in, hide remove icons and show Unsubmit button
  const isTurnedIn = status === STATUS.TURNED_IN;




  const fileInputRef = useRef(null);
  const fetchedRef = useRef(false);

  // derived UI state


  // const editable = !isTurnedIn; // only editable before Turn in (Confirm Work)

  const SUBMISSIONS_BUCKET = "submissions";
  const BUCKET = "submissions";

  const isLink = a => a?.kind === 'link';
  const isFile = a => a?.kind === 'file';

  const editable = uiStatus !== "turned_in";
  const list = editable
    ? pendingAttachments                                  // before confirm
    : (mySubmission?.attachments || []);



  // useEffect(() => {
  //   (async () => {
  //     const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";
  //     const res = await authFetch(`/api/assignments/${routeId}/my-submission`);
  //     if (res.ok && data) { setMySub(data); }
  //   })();
  // }, [routeId]);

  useEffect(() => {
    if (fetchedRef.current) return;           // prevent duplicate in dev
    fetchedRef.current = true;

    (async () => {
      try {
        const sub = await getMySubmission(routeId);
        if (sub) {
          setMySub(sub);
          setUiStatus(sub.status === STATUS.TURNED_IN ? STATUS.TURNED_IN : STATUS.ASSIGNED);
          setPendingAttachments(sub.attachments ? [...sub.attachments] : []);
        } else {
          // no submission yet: keep stage = "idle"
        }
      } catch (e) {
        console.warn("getMySubmission failed:", e.message);
        // treat as no submission to avoid UI crash
      }
    })();
  }, [routeId]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);

      const cls = await listClassrooms();
      setClasses(cls);

      // Try server fetch (may 404 due to RLS); do not overwrite if it fails
      try {
        const fresh = await getAssignment(id);
        if (fresh) setAsg(fresh);
      } catch (e) {
        // If we didn't receive the assignment via state, try a class-scoped list & find by id
        if (!asg && classId) {
          try {
            const list = await listAssignments(classId);
            const found = list?.find((x) => String(x.id) === String(id));
            if (found) setAsg(found);
          } catch { }
        }
        // Still no data? show a friendly message instead of spinning
        if (!asg) setAsg({ __error: "Assignment not found or not accessible." });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    if (uiStatus === "turned-in") {
      const t = setTimeout(() => getMySubmission(routeId), 800);
      return () => clearTimeout(t);
    }
  }, [uiStatus, routeId]);

  function slug(name) {
    return name.replace(/[^\w.-]+/g, "_").slice(0, 120);
  }
  function baseName(nameOrUrl = "") {
    try {
      if (/^https?:\/\//i.test(nameOrUrl)) {
        const u = new URL(nameOrUrl);
        return (u.pathname.split("/").pop() || u.host || "link").slice(0, 120);
      }
      return (nameOrUrl || "").split("/").pop();
    } catch { return "link"; }
  }

  const isPastDue = useMemo(() => {
    if (!asg?.due_at) return false;
    return new Date(asg.due_at) < new Date();
  }, [asg?.due_at]);

  const isMissing = isPastDue && !isTurnedIn;

  const classroom = useMemo(
    () => classes.find((c) => String(c.id) === String(classId)),
    [classes, classId]
  );

  const handleSubmitWorkClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileChosen = (e) => {
    const files = Array.from(e.target.files || []);
    const next = files.map(f => ({ kind: "file", file: f })); // keep File object for upload
    setPendingAttachments(prev => [...prev, ...next]);
    // also reflect in visible stack immediately with temp “name”
    setAttachments(prev => [...prev, ...files.map(f => ({ kind: "file", name: f.name }))]);
    e.target.value = "";
  };


  const removeAttachmentAt = (i) => {
    setPendingAttachments([]);
    setAttachments([]);
    setPendingAttachments(prev => prev.filter((_, idx) => idx !== i));
  }

  const clearPending = () => {
    setPendingAttachments([]);
    setPendingLink("");
  };

  const handleLinkPaste = (e) => setPendingLink(e.target.value.trim());


  // after the user chooses files/links and clicks Confirm
  const confirmWork = async () => {
    if (isSubmitting) return;

    // build link (optional)
    const link = normalizeUrl(linkInput);
    const linkAttachment = link
      ? {
        kind: "link",
        url: link,
        name: fileBaseName(link) || link,
        mime_type: "link",
      }
      : null;

    // nothing to send?
    if (pendingAttachments.length === 0 && !linkAttachment) return;

    setIsSubmitting(true);
    try {
      // 1) upload pending files to storage
      const uploaded = [];
      for (const p of pendingAttachments) {
        if (p.kind === "file" && p.file instanceof File) {
          const path = `${routeId}/${user.id}/${crypto.randomUUID()}_${slug(p.file.name)}`;
          const { error: upErr } = await supabase
            .storage.from(BUCKET)
            .upload(path, p.file, { contentType: p.file.type });
          if (upErr) throw new Error(upErr.message);

          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
          uploaded.push({
            kind: "file",
            name: p.file.name,
            mime_type: p.file.type || "application/octet-stream",
            path,
            public_url: pub.publicUrl,
          });
        }
      }

      // 2) final list to persist
      const outgoing = linkAttachment ? [...uploaded, linkAttachment] : uploaded;

      // 3) optimistic status
      setUiStatus("turned_in");

      // 4) persist in DB (this should return the submission row)
      const saved = await createSubmission({
        assignmentId: String(routeId),
        attachments: outgoing,
        content: null,
      });
      // NOTE: if your helper returns { submission: {...} }, normalize here:
      const submissionRow = saved?.submission ?? saved;
      const submissionId = submissionRow?.id;

      // 5) trigger grading with the id we just got
      let idForGrading = submissionId;

      // fallback: fetch my submission if submit didn’t return a row
      if (!idForGrading) {
        try {
          const mine = await authFetch(
            `${BASE}/api/assignments/${routeId}/my-submission`,
            { method: "GET" }
          );
          idForGrading = mine?.submission?.id ?? null;
        } catch (_) { }
      }

      if (idForGrading) {
        authFetch(`${BASE}/api/assignments/${routeId}/grade/${idForGrading}`, {
          method: "POST",
        })
          .then((r) => r.json())
          .then(() => {
            // refresh UI (your existing method)
            mySubmission();
          })
          .catch(() => {
            // optional toast: grading failed, retry later
          });
      } else {
        console.warn("Could not determine submission id for grading.");
      }

      // 6) render server truth
      setMySubmission(submissionRow);
      setAttachments(submissionRow.attachments || []);
      setPendingAttachments([]);
      setLinkInput("");
    } catch (e) {
      alert(e.message || "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  };




  // Unsubmit: call server (which deletes files + clears row), then unlock UI
  const unsubmitWork = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const cleared = await unsubmit({ assignmentId: String(routeId) });
      setMySubmission(cleared);
      setUiStatus("assigned");
      // setAttachments([]);          // nothing on the stack
      // setPendingAttachments([]);   // fresh
      setLinkInput("");
    } catch (e) {
      alert(e.message || "Unsubmit failed");
    } finally {
      setIsSubmitting(false);
    }
  };


  // --- helpers ---
  // Try to coerce a raw string into a valid absolute URL.
  // - If it already has a scheme, keep it
  // - If scheme is missing, assume https://
  // Returns a fully-qualified URL string or null if invalid.
  const normalizeUrl = (raw = "") => {
    const s = raw.trim();
    if (!s) return null;

    // Already has a scheme? (http:, https:, ftp:, etc.)
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) {
      try { return new URL(s).href; } catch { return null; }
    }
    // No scheme — assume https://
    try { return new URL(`https://${s}`).href; } catch { return null; }
  };

  // “Truthy if we can normalize it”
  const isValidUrl = (raw = "") => !!normalizeUrl(raw);

  const fileBaseName = (nameOrUrl = "") => {
    // If it’s a URL, show the last path segment; otherwise the leaf filename
    try {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(nameOrUrl) || nameOrUrl.startsWith("www.")) {
        const href = normalizeUrl(nameOrUrl);
        if (href) {
          const u = new URL(href);
          const leaf = u.pathname.split("/").filter(Boolean).pop();
          return leaf || u.hostname;
        }
      }
    } catch { }
    const leaf = nameOrUrl.split("\\").pop().split("/").pop();
    return leaf || nameOrUrl;
  };

  const hostFromUrl = u => {
    try {
      const hasScheme = /^[a-z]+:\/\//i.test(u);
      return new URL(hasScheme ? u : `https://${u}`)
        .hostname
        .replace(/^www\./, "");
    } catch { return (u || "").replace(/^https?:\/\//, ""); }
  };


  const prettyType = (mimeOrUrl = "") => {
    // for links show domain
    if (mimeOrUrl.startsWith?.("http")) {
      try { return new URL(mimeOrUrl).hostname; } catch { }
    }
    const map = {
      "application/pdf": "PDF",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Microsoft Word",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
      "image/png": "PNG image",
      "image/jpeg": "JPEG image",
    };
    if (map[mimeOrUrl]) return map[mimeOrUrl];
    if (mimeOrUrl.includes("/")) return mimeOrUrl.split("/").pop().toUpperCase();
    return mimeOrUrl;
  }

  const addLink = () => {
    const href = normalizeUrl(linkInput);
    if (!href) return;
    setPendingAttachments(prev => ([
      ...prev,
      { kind: 'link', url: href, name: fileBaseName(href) || hostFromUrl(href), mime_type: 'link' }
    ]));
    setLinkInput('');
  };






  return (
    <>
      <TopNav user={user} onToggleSidebar={() => setSidebarOpen(v => !v)} showJoin={false} />
      <StudentSidebar
        classes={classes}
        open={sidebarOpen}
        selectedId={classId ?? null}
        onSelectClass={(cid) => nav(`/class/${cid}`)}
      />

      <main className={`gc-content ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        {!asg ? (
          <div className="todo-empty">Loading assignment…</div>
        ) : asg.__error ? (
          <div className="todo-empty">{asg.__error}</div>
        ) : (
          <div className="ap-wrap">
            {/* LEFT */}
            <section className="ap-left">
              <div className="ap-title">
                <div className="ap-icon">📄</div>
                <h2>{asg.title || "Untitled assignment"} : </h2>
                <div className="ap-body">{asg.prompt || <span className="ap-muted">No description provided.</span>}</div>
              </div>

              <div className="ap-meta">
                <span>— {classroom?.teacher_name || "Teacher"}</span>
                {asg.created_at && <span> • {fmt(asg.created_at)}</span>}
              </div>

              <div className="ap-points">{asg.max_points ?? 100} points</div>
              <hr className="ap-sep" />


              <div className="ap-footer">
                <span className="ap-muted">Due:&nbsp;</span>
                {asg.due_at ? <strong>{fmt(asg.due_at)}</strong> : <strong>No Due Date</strong>}
              </div>


            </section>

            {/* RIGHT */}
            <aside className="work-card">
              <div className="work-card-header">
                <h3>Your work</h3>
                <span className={
                  isTurnedIn ? "badge green" :
                    isMissing ? "badge red" :
                      "badge"
                }>
                  {isTurnedIn ? "Turned in" :
                    isMissing ? "Missing" :
                      "Assigned"}
                </span>
              </div>

              {/* Stack of attachments (existing + newly added) */}
              {attachments.length > 0 && (
                <div className="att-list">
                  {attachments.map((att, idx) => {
                    const link = isLink(att);
                    // name
                    const name =
                      att.name ||
                      (link ? hostFromUrl(att.url) : fileBaseName(att.filename || att.path || att.name));

                    // sublabel
                    const sub = link
                      ? hostFromUrl(att.url)
                      : (att.mime_type || "")
                        .replace(/^application\//, "")
                        .toUpperCase();

                    return (
                      <div key={idx} className="att-row">
                        <div className="att-icon">{link ? "🔗" : "📄"}</div>

                        <div className="att-meta">
                          <div className="att-name" title={name}>
                            {link ? (
                              <a href={att.url} target="_blank" rel="noreferrer">{name}</a>
                            ) : (
                              name
                            )}
                          </div>
                          <div className="att-type">{sub}</div>
                        </div>

                        {/* Only allow remove while NOT turned-in */}
                        {editable && (
                          <button
                            className="att-remove"
                            onClick={() => removeAttachmentAt(idx)}
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Actions */}
              {!isTurnedIn ? (
                <div className="stacked-actions">
                  <button
                    className="btn secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isMissing}
                  >
                    Submit Work
                  </button>



                  <button
                    className="btn primary"
                    onClick={confirmWork}
                    disabled={pendingAttachments.length === 0 || isMissing}
                  >
                    Confirm Work
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg"
                    onChange={handleFileChosen}
                  />
                </div>
              ) : (
                <div className="stacked-actions">
                  <button
                    className="btn danger"
                    onClick={unsubmitWork}
                    disabled={isSubmitting || isPastDue}
                  >
                    Unsubmit Work
                  </button>
                </div>
              )}


            </aside>

          </div>
        )}
      </main>
    </>
  );
}
