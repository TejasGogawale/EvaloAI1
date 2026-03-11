// authFetch.js
import { supabase } from "./supabaseClient";
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

async function getFreshToken() {
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  const { data } = await supabase.auth.refreshSession();
  return data.session?.access_token || null;
}

export async function authFetch(input, init = {}) {
  const url = /^https?:\/\//i.test(input) ? input : `${BASE}${input}`;
  const hasBody = !!init.body;
  const isForm = hasBody && init.body instanceof FormData;

  let token = await getFreshToken();
  const headers = (tok) => ({
    ...(init.headers || {}),
    ...(hasBody && !isForm ? { "Content-Type": "application/json" } : {}),
    ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
  });

  let res = await fetch(url, { ...init, headers: headers(token), credentials: "include" });
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession();
    token = data.session?.access_token || token;
    res = await fetch(url, { ...init, headers: headers(token), credentials: "include" });
  }
  return res;
}

export async function authFetchJSON(input, init) {
  const r = await authFetch(input, init);
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
  return d;
}
