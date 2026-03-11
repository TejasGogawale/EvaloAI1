import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "../supabaseClient";
import Ambient from "../components/Ambient";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg({ type: "", text: "" });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setLoading(false);
    if (error) return setMsg({ type: "error", text: error.message });

    const role = data.user?.user_metadata?.role;
    nav(role === "teacher" ? "/teacher" : "/student", { replace: true });
  };

  const resetPw = async () => {
    setMsg({ type: "", text: "" });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) return setMsg({ type: "error", text: error.message });
    setMsg({ type: "ok", text: "Password reset link sent (if email exists)." });
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
        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-sub">Log in to your dashboard.</p>

        <form className="form" onSubmit={submit}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div className="row">
            <input
              className="input"
              type={showPw ? "text" : "password"}
              placeholder="Password"
              value={pw}
              autoComplete="current-password"
              onChange={(e) => setPw(e.target.value)}
              required
            />
            <button type="button" className="btn" onClick={() => setShowPw((s) => !s)} aria-label="Toggle password">
              {showPw ? "Hide" : "Show"}
            </button>
          </div>

          <motion.button
            type="submit"
            className="btn"
            disabled={loading}
            whileTap={{ scale: loading ? 1 : 0.98 }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </motion.button>
        </form>

        <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
          Don't have an account?<Link to="/signup" className="link">Create account</Link>
        </div>

        {msg.text && <p className={msg.type === "error" ? "error" : "ok"}>{msg.text}</p>}
      </motion.div>
    </div>
  );
}
