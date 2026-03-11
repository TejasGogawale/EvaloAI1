import { useState } from "react";
import { FaHome, FaCalendarAlt, FaListUl, FaChevronDown, FaChevronRight } from "react-icons/fa";
import { Link, useNavigate, useLocation } from "react-router-dom";
import React from "react";

// add `selectedId` to props
export default function StudentSidebar({ classes = [], onSelectClass = () => { }, open = true, selectedId }) {
  const [openEnrolled, setOpenEnrolled] = useState(true);
  const nav = useNavigate();
  const { pathname } = useLocation();

  const activeKey =
    pathname.startsWith("/todo") ? "todo" :
      pathname.startsWith("/class/") ? "class" :
        "home";

  return (
    <aside className={`gc-sidebar ${open ? "open" : "closed"}`}>
      <nav className="gc-nav">
        <Link to={"/student"} className="link-items"><button className={`gc-nav-item ${activeKey === "home" ? "active" : ""}`}><FaHome /> <span>Home</span></button></Link>

        <button className="gc-nav-item" onClick={() => setOpenEnrolled(v => !v)} aria-expanded={openEnrolled}>
          {openEnrolled ? <FaChevronDown /> : <FaChevronRight />} <span>Enrolled</span>
        </button>

        {openEnrolled && (
          <div className="gc-enrolled-list">
            {classes.length === 0 && <div className="gc-hint">No classes yet</div>}
            {classes.map((c, i) => {
              const key = c.id || `cls-${i}`;
              const isCurrent = String(c.id) === String(selectedId);
              return (
                <React.Fragment key={key}>

                  <button
                    className={`gc-enrolled-item ${isCurrent ? "current" : ""}`}
                    // data-selected={isCurrent} 
                    onClick={() => onSelectClass?.(c.id)}
                    title={c.name}
                  >
                    <span className="gc-enrolled-avatar">{String(c.name || "?").trim().charAt(0).toUpperCase()}</span>
                    <span className="gc-ellipsis">{c.name}</span>
                  </button>
                </React.Fragment>

              )
            })}
          </div>
        )}

        <button className={`gc-nav-item ${activeKey === "todo" ? "active" : ""}`} onClick={() => nav("/todo")}>
          <FaListUl /> <span>To-do</span>
        </button>
        <div className="gc-divider" />
      </nav>
    </aside>
  );
}

