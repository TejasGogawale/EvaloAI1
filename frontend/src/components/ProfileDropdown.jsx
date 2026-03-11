import { useState, useEffect } from "react";
import { FaUser, FaSignOutAlt, FaEdit } from "react-icons/fa";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function ProfileDropdown({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState(user?.user_metadata?.full_name || "");
  const [role, setRole] = useState(user?.user_metadata?.role || "student");  // Teacher/Student
  const [loading, setLoading] = useState(true); // Loading state for user info
  const [msg, setMsg] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false); // for modal toggle
  const [newUsername, setNewUsername] = useState(username); // input for username change
  const nav = useNavigate();

  // Fetch the latest user data on component mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUsername(user?.user_metadata?.full_name || ""); // Update username when user changes
      setRole(user?.user_metadata?.role || "student");
      setLoading(false); // Stop loading when user data is fetched
    };
    
    getUser();
  }, [user]); // Fetch user data again if the user prop changes

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    nav("/login"); // Redirect to login page after sign-out
  };

  const handleSaveUsername = async () => {
    setLoading(true);
    setMsg("");
    const { error } = await supabase.auth.updateUser({
      data: { full_name: newUsername }, // update the full_name
    });
    setLoading(false);

    if (error) {
      setMsg("Error updating username");
    } else {
      setUsername(newUsername); // update username locally
      setMsg("Username updated successfully!");
      setIsModalOpen(false); // close modal
    }
  };

  if (loading) {
    return <div>Loading...</div>; // show loading state while fetching user info
  }

  return (
    <div className="profile-dropdown">
      <motion.div
        className="profile-icon"
        onClick={() => setIsOpen(!isOpen)}
        whileTap={{ scale: 0.9 }}
        title="Profile"
      >
        <FaUser />
      </motion.div>

      {isOpen && (
        <motion.div
          className="dropdown-menu"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <div className="dropdown-header">
            <h3>{username} - {role}</h3> {/* Show Username and Role */}
            <button onClick={() => setIsModalOpen(true)}><FaEdit /> Edit</button> {/* Edit button */}
          </div>

          <div className="dropdown-body">
            <div className="dropdown-footer">
              <button className="btn-signout" onClick={handleSignOut}>
                <FaSignOutAlt /> Sign out
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Modal for editing username */}
      {isModalOpen && (
        <motion.div
          className="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="modal-content">
            <h3>Edit Username</h3>
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              disabled={loading}
            />
            <div className="modal-actions">
              <button
                onClick={handleSaveUsername}
                disabled={loading}
                className="btn"
              >
                {loading ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setIsModalOpen(false)}
                className="btn-cancel"
              >
                Cancel
              </button>
            </div>
            {msg && <p className="message">{msg}</p>}
          </div>
        </motion.div>
      )}
    </div>
  );
}
