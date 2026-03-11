// backend/auth.js
import { createClient } from "@supabase/supabase-js";

let supabasePublic = null;

function initSupabase() {
  if (!supabasePublic) {
    supabasePublic = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );
  }
  return supabasePublic;
}

async function requireAuth(req, res, next) {
  try {
    const supabase = initSupabase();
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "missing bearer token" });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "invalid token" });

    req.user = data.user;
    req.role = data.user.user_metadata?.role || null;
    req.token = token; // save for user-scoped queries
    next();
  } catch {
    res.status(401).json({ error: "auth failed" });
  }
}

function requireRole(roles = []) {
  return (req, res, next) =>
    (!req.role || !roles.includes(req.role)) ? res.status(403).json({ error: "forbidden" }) : next();
}

// Create a Supabase client that carries the user's JWT (so RLS applies)
function supabaseForUser(req) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${req.token}` } },
  });
}

export { requireAuth, requireRole, supabaseForUser };
