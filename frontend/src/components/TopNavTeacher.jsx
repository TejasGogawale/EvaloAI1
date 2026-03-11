// frontend/src/components/TopNav.jsx
import { FaBars } from "react-icons/fa";
import ProfileDropdown from "./ProfileDropdown";
import { Link } from "react-router-dom";

export default function TopNav({
  user,
  onAdd,
  onPlus,
  onToggleSidebar = () => {},
  showAdd = true,               // ← NEW
}) {
  const handleAdd = onAdd || onPlus || (() => {});
  return (
    <header className="gc-navbar">
      <div className="gc-navbar-left">
        <button className="gc-burger" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <FaBars />
        </button>
        <Link to={"/teacher"} className="gc-navbar-brand"><span className="gc-navbar-brand">🎓&nbsp;EvaloAI</span></Link>
      </div>

      <div className="gc-navbar-right">
        {showAdd && (                      /* ← show only when true */
          <button
            type="button"
            className="gc-plus"
            aria-label="Create"
            onClick={handleAdd}
            title="Create CLass"
          >
            +
          </button>
        )}
        <ProfileDropdown user={user} />
      </div>
    </header>
  );
}
