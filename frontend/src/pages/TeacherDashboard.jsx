import { useEffect, useState } from "react";
import TopNavTeacher from "../components/TopNavTeacher";
import TeacherSidebar from "../components/TeacherSidebar";
import ProfileDropdown from "../components/ProfileDropdown";
import { supabase } from "../supabaseClient";
import { listTeacherClassrooms } from "../api";
import CreateClass from "../components/CreateClass";
import TeacherClassCard from "../components/TeacherClassCard" // <-- NEW
import { useNavigate, useParams } from "react-router-dom";

export default function TeacherDashboard() {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [classes, setClasses] = useState([]);
  const [showCreate, setShowCreate] = useState(false); // <-- NEW
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user || null);
      const rows = await listTeacherClassrooms();
      setClasses(rows || []);
    })();
  }, []);

  return (
    <div className="gc-shell">
      <TopNavTeacher
        user={user}
        showAdd={true}
        onAdd={() => setShowCreate(true)}          // <-- open modal
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <TeacherSidebar classes={classes}
        open={sidebarOpen}
      />

      <main className={`gc-content ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <section className="td-grid">
          {classes.map((klass, i) => (
            <TeacherClassCard
              key={klass.id ?? klass.code ?? `row-${i}`}
              klass={klass}
              onOpen={() => nav(`/teacher/class/${klass.id}`)}
              onMenu={(e) => {
                // TODO: open 3-dot menu
                // console.log("menu for", klass.id);
              }}
            />
          ))}

          {classes.length === 0 && (
            <div className="td-empty">No classes yet. Click the “+” to create one.</div>
          )}
        </section>
      </main>

      <CreateClass
        open={showCreate}
        onClose={() => setShowCreate(false)}

      />

    </div>
  );
}


