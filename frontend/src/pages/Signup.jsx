import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";
import Ambient from "../components/Ambient";

export default function Signup() {
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", fullName: "", role: "student" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);
    const { email, password, fullName, role } = form;

    // Create user and include role/fullName
    const { user, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, fullName } },
    });

    if (error) {
      setLoading(false);
      return setMsg(error.message);
    }

    // Auto-login (Supabase handles session automatically)
    const { data: session } = await supabase.auth.getSession();
    const redirectPath = role === "teacher" ? "/teacher" : "/student";

    // Redirect user to the dashboard after successful signup
    nav(redirectPath, { replace: true });

    // Optional: if you want to show a success message before redirect
    setMsg("Sign-up successful! Redirecting to your dashboard...");
  };

  return (
    <div className="auth-wrap">
      <Ambient />
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <div className="brand">
          <span className="dot" />
          <strong>Evalo AI</strong>
        </div>
        <h2 className="auth-title">Create your account</h2>
        <p className="auth-sub">Choose your role and get started in seconds.</p>

        <div className="role-toggle" style={{marginBottom: 16}}>
          <button
            type="button"
            className={form.role === "student" ? "active" : ""}
            onClick={() => setForm({ ...form, role: "student" })}
          >
            Student
          </button>
          <button
            type="button"
            className={form.role === "teacher" ? "active" : ""}
            onClick={() => setForm({ ...form, role: "teacher" })}
          >
            Teacher
          </button>
        </div>

        <form onSubmit={onSubmit} className="form">
          <input
            className="input"
            type="text"
            placeholder="Full Name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          <motion.button
            type="submit"
            className="btn"
            disabled={loading}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            {loading ? "Creating..." : "Create account"}
          </motion.button>
        </form>

        {msg && <p className={msg.includes("error") ? "error" : "ok"}>{msg}</p>}

        <p>
          Already have an account? <Link to="/login" className="link">Log in</Link>
        </p>
      </motion.div>
    </div>
  );
}
