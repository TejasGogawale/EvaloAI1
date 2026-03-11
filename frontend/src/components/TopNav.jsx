// frontend/src/components/TopNav.jsx
import { FaBars } from "react-icons/fa";
import ProfileDropdown from "./ProfileDropdown";
import { Link } from "react-router-dom";

export default function TopNav({
  user,
  onPlus = () => {},
  onToggleSidebar = () => {},
  showJoin = true,                // ← NEW
}) {
  return (
    <header className="gc-navbar">
      <div className="gc-navbar-left">
        <button className="gc-burger" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <FaBars />
        </button>
        <Link to={"/student"} className="gc-navbar-brand"><span className="gc-navbar-brand">🎓&nbsp;EvaloAI</span></Link>
      </div>

      <div className="gc-navbar-right">
        {showJoin && (                      /* ← show only when true */
          <button
            type="button"
            className="gc-plus"
            aria-label="Create"
            onClick={onPlus}
            title="Create"
          >
            +
          </button>
        )}
        <ProfileDropdown user={user} />
      </div>
    </header>
  );
}
