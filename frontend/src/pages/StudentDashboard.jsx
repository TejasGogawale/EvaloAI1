import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import TopNav from "../components/TopNav";
import StudentSidebar from "../components/StudentSidebar";
import ClassCard from "../components/ClassCard";
import JoinClassModal from "../components/JoinClassModal";
import { listClassrooms, joinClassroom } from "../api";
import { useNavigate, useParams } from "react-router-dom";
import { useRef } from "react";
import React from "react";

export default function StudentDashboard() {
  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);
  const nav = useNavigate();
  const didInit = useRef(false);
  const { id: classId } = useParams();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);
      await reloadClasses();
    })();
  }, []);

  const reloadClasses = async () => {
    const cls = await listClassrooms();
    // console.log("[StudentDashboard] normalized rows:", cls);
    
    setClasses(cls);
    // if (!selectedClassId && cls[0]) setSelectedClassId(cls[0].id);
  };

  const handleJoin = async (code) => {
    const res = await joinClassroom(code); // throws on error (API helper already does this)
    // Update UI
    await reloadClasses();
    setSelectedClassId(res.classroom?.id || null);
    setJoinOpen(false);
  };

  useEffect(() => {
    if (didInit.current) return;   // ✅ prevents double run in StrictMode (dev only)
    didInit.current = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);
      await reloadClasses();
    })();
  }, []);


  return (
    <>
      <TopNav
        user={user}
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        onPlus={() => setJoinOpen(true)}
        showJoin={true}                 // ← show on Home
      />

      <StudentSidebar
        classes={classes}
        open={sidebarOpen}
        selectedId={selectedClassId}        // null → nothing is highlighted
        onSelectClass={(id) => {
          setSelectedClassId(id);           // highlight only after user clicks
          nav(`/class/${id}`);
        }}
      />

      <main className={`gc-content ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <div className="gc-grid">
          {classes.map((cls, i) => (
            <ClassCard
              key={cls.id ?? cls.code ?? `cls-${i}`}
              cls={cls}
              onOpen={() => {
                nav(`/class/${cls.id}`);
                setSelectedClassId(cls.id);
              }}
            />
          ))}

          {classes.length === 0 && (
            <div className="gc-empty">Join a classroom to get started.</div>
          )}
        </div>
      </main>

      {/* JOIN MODAL */}
      <JoinClassModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoin={handleJoin}
      />


    </>
  );
}
