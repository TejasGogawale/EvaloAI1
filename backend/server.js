import dotenv from "dotenv";
dotenv.config();

// import multer from "multer";
// const multer = require("multer");
import multer from "multer";

import { v4 as uuidv4 } from "uuid";
// const { v4: uuidv4 } = require("uuid");

// const express = require("express");
import express from "express";
// const cors = require("cors");
import cors from "cors";

import fetch from "node-fetch";
// your initialized server-side client

const upload = multer({ storage: multer.memoryStorage() });

// const { requireRole } = require("./auth"); // you already have this
import { requireRole } from "./auth.js";
// const { supabaseAdmin } = require("./supabase");
// import { supabaseAdmin } from "./supabase.js";
// const { gradeSimilarity } = require("./grader");

// const { createClient } = require("@supabase/supabase-js");
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GRADER_URL = process.env.GRADER_URL;

const app = express();
// server.js
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 5000;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  supabaseAdmin.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user)
        return res.status(401).json({ error: "invalid token" });
      req.user = data.user;
      req.accessToken = token;
      next();
    })
    .catch(() => res.status(401).json({ error: "invalid token" }));
}

function supabaseForUser(req) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${req.accessToken}` } },
  });
}

function requireUser(req) {
  const uid = req.user?.id || req.user?.uid;
  if (!uid) throw new Error("unauthorized");
  return uid;
}

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, service: "backend" })
);

// Who am I?
app.get("/api/me", requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, role: req.role });
});

// Create assignment (teacher → classId required)
app.post(
  "/api/assignments",
  requireAuth,
  requireRole(["teacher"]),
  async (req, res) => {
    const { title, prompt, sampleAnswer, classId } = req.body;
    if (!title || !prompt || !classId)
      return res.status(400).json({ error: "title, prompt, classId required" });
    const sb = supabaseForUser(req);
    const { data, error } = await sb
      .from("assignments")
      .insert([
        {
          title,
          prompt,
          sample_answer: sampleAnswer ?? "",
          created_by: req.user.id,
          class_id: classId,
        },
      ])
      .select("*")
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  }
);

// List assignments (any signed-in; teachers see their own first if you want)
app.get("/api/assignments", requireAuth, async (req, res) => {
  const sb = supabaseForUser(req);
  const q = sb
    .from("assignments")
    .select("*")
    .order("created_at", { ascending: false });
  if (req.query.classId) q.eq("class_id", req.query.classId);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Submit (student) -> auto-grade -> save grade
// POST /api/assignments/:id/submit
app.post("/api/assignments/:id/submit", requireAuth, async (req, res) => {
  try {
    const sb = supabaseForUser(req);
    const assignmentId = req.params.id;
    const studentId = req.user.id;
    const { attachments = [], content = null } = req.body || {};

    // Normalize: ensure it's always an array (files and/or links)
    const safe = Array.isArray(attachments) ? attachments : [];

    const { data, error } = await sb
      .from("submissions")
      .upsert(
        {
          assignment_id: assignmentId,
          student_id: studentId,
          status: "turned_in",
          attachments: safe, // <- store exactly what client prepared (paths, urls, etc.)
          content,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "assignment_id,student_id" }
      )
      .select()
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ submission: data });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "submit_failed" });
  }
});

// POST unsubmit => allow editing again (keep attachments or clear them)
// Here I keep attachments but flip status to 'assigned'. Clear if you prefer.
// POST /api/assignments/:id/unsubmit
app.post("/api/assignments/:id/unsubmit", requireAuth, async (req, res) => {
  const sb = supabaseForUser(req);
  const assignmentId = req.params.id;
  const studentId = req.user.id;

  // 1) load current attachments
  const { data: current, error: loadErr } = await sb
    .from("submissions")
    .select("id, attachments")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (loadErr) return res.status(400).json({ error: loadErr.message });

  // 2) delete any stored files (kind:file with a "path")
  const paths = (current?.attachments || [])
    .filter((a) => a?.kind === "file" && a?.path)
    .map((a) => a.path);

  if (paths.length) {
    const { error: delErr } = await supabaseAdmin.storage
      .from("submissions")
      .remove(paths);
    if (delErr) {
      // don't block the user; just log
      console.warn("Storage remove failed:", delErr.message);
    }
  }

  // 3) clear the submission row
  const { data, error } = await sb
    .from("submissions")
    .update({
      status: "assigned",
      attachments: [],
      submitted_at: null,
      content: null,
    })
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .select()
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  return res.json({ submission: data });
});

// List submissions (student sees own; teacher sees for an assignment)
// app.get("/api/submissions", requireAuth, async (req, res) => {
//   const { assignmentId } = req.query;
//   if (req.role === "student") {
//     const { data, error } = await supabaseAdmin
//       .from("submissions")
//       .select("*, grades(score,feedback,created_at)")
//       .eq("student_id", req.user.id)
//       .order("submitted_at", { ascending: false });
//     if (error) return res.status(400).json({ error: error.message });
//     return res.json(data);
//   }

//   // teacher path
//   if (!assignmentId) return res.status(400).json({ error: "assignmentId required for teacher" });

//   // optionally check ownership
//   const { data: a, error: aErr } = await supabaseAdmin
//     .from("assignments")
//     .select("id, created_by")
//     .eq("id", assignmentId)
//     .single();
//   if (aErr || a?.created_by !== req.user.id) return res.status(403).json({ error: "forbidden" });

//   const { data, error } = await supabaseAdmin
//     .from("submissions")
//     .select("*, grades(score,feedback,created_at)")
//     .eq("assignment_id", assignmentId)
//     .order("submitted_at", { ascending: false });

//   if (error) return res.status(400).json({ error: error.message });
//   res.json(data);
// });

app.get("/api/submissions", requireAuth, async (req, res) => {
  const sb = supabaseForUser(req);
  let q = sb
    .from("submissions")
    .select("*, grades(score,feedback,created_at)")
    .order("submitted_at", { ascending: false });
  if (req.query.assignmentId) q = q.eq("assignment_id", req.query.assignmentId);
  const { data, error } = await q;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data); // RLS shows: students → their own; teachers → for their classes
});

// helper to make a 6-char join code
function randomCode(len = 6) {
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < len; i++)
    s += alpha[Math.floor(Math.random() * alpha.length)];
  return s.toUpperCase();
}

async function generateUniqueCode(supabase) {
  for (let i = 0; i < 6; i++) {
    const code = randomCode(6);
    const { data, error } = await supabase
      .from("classrooms")
      .select("id", { count: "exact", head: true })
      .eq("code", code);
    if (error) throw error;
    if (!data || data.length === 0) return code; // head:true returns [] in JS client
  }
  throw new Error("Could not generate unique class code");
}

app.post(
  "/api/classrooms",
  requireAuth,
  requireRole(["teacher"]),
  async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "name required" });

    // ensure unique code
    let code,
      inserted = null,
      attempts = 0;
    while (!inserted && attempts < 5) {
      attempts++;
      code = makeCode();
      const { data, error } = await supabaseAdmin
        .from("classrooms")
        .insert([{ name, code, owner: req.user.id }])
        .select("*")
        .single();
      if (!error) inserted = data; // ok
      else if (!/duplicate key value/.test(error.message))
        return res.status(400).json({ error: error.message });
    }
    if (!inserted)
      return res.status(400).json({ error: "could not generate unique code" });

    // add owner as teacher member
    await supabaseAdmin.from("classroom_members").upsert({
      classroom_id: inserted.id,
      user_id: req.user.id,
      role: "teacher",
    });

    res.status(201).json(inserted);
  }
);

// Join classroom (student enters code)
app.post("/api/classrooms/join", requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "code required" });

  // find class by code (admin ok; only returns id/name/owner/code)
  const { data: cls, error } = await supabaseAdmin
    .from("classrooms")
    .select("id,name,code,owner,created_at")
    .eq("code", code.toUpperCase())
    .single();
  if (error || !cls) return res.status(404).json({ error: "invalid code" });

  // insert membership as current user (role from profile or fallback 'student')
  const sb = supabaseForUser(req); // RLS ensures user_id = auth.uid()
  const { error: mErr } = await sb
    .from("classroom_members")
    .insert({ classroom_id: cls.id, user_id: req.user.id, role: "student" })
    .select("*");
  if (mErr && !/duplicate key value|already exists/i.test(mErr.message))
    return res.status(400).json({ error: mErr.message });

  res.json({ joined: true, classroom: cls });
});

// List my classrooms (teacher or student)
app.get("/api/classrooms", requireAuth, async (req, res) => {
  try {
    const sb = supabaseForUser(req);

    // 1) Get my memberships → classrooms (id, name, code, owner, created_at)
    const { data, error } = await sb
      .from("classroom_members")
      .select(
        "role, joined_at, classrooms:classroom_id(id,name,code,owner,created_at)"
      )
      .order("joined_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    const rooms = (data || []).map((r) => ({
      role: r.role,
      joined_at: r.joined_at,
      ...r.classrooms, // {id,name,code,owner,created_at}
    }));

    const ownerIds = [...new Set(rooms.map((r) => r.owner).filter(Boolean))];

    // 3) Look up owners via Supabase Admin (Auth) to read user_metadata.full_name
    const ownerNameById = {};
    await Promise.all(
      ownerIds.map(async (id) => {
        const { data: u, error: uErr } =
          await supabaseAdmin.auth.admin.getUserById(id);
        if (!uErr && u?.user) {
          const md = u.user.user_metadata || {};
          ownerNameById[id] =
            md.full_name || md.fullName || u.user.email || "Teacher";
        }
      })
    );

    const withNames = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      owner: r.owner,
      created_at: r.created_at,
      role: r.role,
      joined_at: r.joined_at,
      teacher_name: ownerNameById[r.owner] || "Teacher",
    }));

    // console.log("[/api/classrooms] response:", JSON.stringify(withNames, null, 2));

    return res.json(withNames);
  } catch (e) {
    return res.status(500).json({ error: "failed to load classrooms" });
  }
});

app.get("/api/assignments/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const sb = supabaseForUser(req);
  console.log("GET assignment", id);
  const { data, error } = await sb
    .from("assignments")
    .select("id, class_id, title, prompt, created_at, max_points, due_at")
    .eq("id", id)
    .single();

  if (error || !data)
    return res.status(404).json({ error: "Assignment not found" });
  res.json(data);
});

// server.js (add this route)
app.get("/api/classrooms/:id", requireAuth, async (req, res) => {
  try {
    const sb = supabaseForUser(req);
    const classroomId = req.params.id;

    // you can allow "owner OR member"
    const { data, error } = await sb
      .from("classrooms")
      .select("id,name,code,owner,created_at")
      .eq("id", classroomId)
      .limit(1)
      .maybeSingle();

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Not found" });

    // Optional: enforce access via membership OR ownership
    const { data: member, error: memErr } = await sb
      .from("classroom_members")
      .select("id")
      .eq("classroom_id", classroomId)
      .limit(1);

    // If your RLS already enforces this, you can skip the extra check above.
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: "failed to load classroom" });
  }
});

// routes/submissions.js (or inline in server.js under your /api router)
// inside your /api router (mounted at /api)
app.get("/api/assignments/:id/my-submission", requireAuth, async (req, res) => {
  const sb = supabaseForUser(req);
  const { id } = req.params;
  const userId = req.user.id;

  const { data, error } = await sb
    .from("submissions")
    .select("id, assignment_id, student_id, status, attachments, submitted_at")
    .eq("assignment_id", id)
    .eq("student_id", userId)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });
  // If no row yet, return null to keep client logic simple
  return res.json(data ?? null);
});

app.post("/api/submissions", requireAuth, async (req, res) => {
  const { assignmentId, filePath, mimeType, originalName, sizeBytes, linkUrl } =
    req.body || {};
  if (!assignmentId || (!filePath && !linkUrl)) {
    return res
      .status(400)
      .json({ error: "assignmentId and (filePath|linkUrl) are required" });
  }

  const sb = supabaseForUser(req);

  // Upsert: one submission per (assignment,user)
  const payload = {
    assignment_id: assignmentId,
    student_id: req.user.id,
    file_path: filePath || null,
    mime_type: mimeType || null,
    original_name: originalName || null,
    size_bytes: sizeBytes || null,
    link_url: linkUrl || null,
    turned_in_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("submissions")
    .upsert(payload, { onConflict: "assignment_id,student_id" })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// Replace the previous /api/teacher/classrooms route with this one
app.get("/api/teacher/classrooms", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const supabase = supabaseForUser(req);
  try {
    // 1) teacher's classes
    const { data: classes, error: cErr } = await supabase
      .from("classrooms")
      .select("id,name,code, created_at")
      .eq("owner", userId)
      .order("created_at", { ascending: false });
    if (cErr) {
      console.error("[teacher/classrooms] classrooms error:", cErr);
      return res.status(500).json({ error: cErr.message });
    }
    if (!classes || classes.length === 0) return res.json([]);

    const ids = classes.map((c) => c.id);

    // 2) members rows for those classes (count in Node)
    const { data: members, error: mErr } = await supabase
      .from("classroom_members")
      .select("classroom_id")
      .in("classroom_id", ids);

    if (mErr) {
      console.error("[teacher/classrooms] members error:", mErr);
      return res.status(500).json({ error: mErr.message });
    }

    // 3) assignments rows for those classes (count in Node)
    const { data: assigns, error: aErr } = await supabase
      .from("assignments")
      .select("class_id")
      .in("class_id", ids);

    if (aErr) {
      console.error("[teacher/classrooms] assignments error:", aErr);
      return res.status(500).json({ error: aErr.message });
    }

    // Make quick lookup maps
    const stuCount = {};
    for (const m of members || []) {
      stuCount[m.classroom_id] = (stuCount[m.classroom_id] || 0) + 1;
    }
    const asgCount = {};
    for (const a of assigns || []) {
      asgCount[a.class_id] = (asgCount[a.class_id] || 0) + 1;
    }

    // Build output
    const out = classes.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      student_count: stuCount[c.id] - 1 || 0,
      assignment_count: asgCount[c.id] || 0,
    }));

    // console.log(JSON.stringify(out, null, 2));

    res.json(out);
  } catch (e) {
    console.error("[teacher/classrooms] unexpected error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/assignments/:assignmentId/grade/:submissionId
app.post(
  "/api/assignments/:assignmentId/grade/:submissionId",
  async (req, res) => {
    try {
      const { assignmentId, submissionId } = req.params;
      const supabase = supabaseForUser(req);

      // 1) Load submission & assignment
      const { data: sub, error: subErr } = await supabaseAdmin
        .from("submissions")
        .select("id, attachments, student_id, assignment_id")
        .eq("id", submissionId)
        .single();
      if (subErr) throw subErr;

      const { data: asn, error: asnErr } = await supabaseAdmin
        .from("assignments")
        .select("id, max_points, sample_answer") // store file meta as JSONB per earlier plan
        .eq("id", assignmentId)
        .single();
      if (asnErr) throw asnErr;

      // 2) Get short-lived signed URLs for both files
      // attachments is an array; extract the first file's path
      if (
        !sub.attachments ||
        !Array.isArray(sub.attachments) ||
        sub.attachments.length === 0
      ) {
        throw new Error("No attachments found for submission " + submissionId);
      }

      let studentPath = sub.attachments[0].path; // e.g. "8fe75b71.../7c31a818.../e4158f75..._Assignment-7.docx"

      // Strip public URL prefix if stored as full URL (just in case)
      if (
        studentPath &&
        studentPath.includes("/storage/v1/object/public/submissions/")
      ) {
        studentPath = studentPath.split(
          "/storage/v1/object/public/submissions/"
        )[1];
      }

      if (!studentPath) {
        throw new Error(
          "Student file path is missing in attachments for submission " +
            submissionId
        );
      }

      // Teacher sample answer path
      let teacherPath = asn.sample_answer?.path;
      if (
        teacherPath &&
        teacherPath.includes("/storage/v1/object/public/assignment-samples/")
      ) {
        teacherPath = teacherPath.split(
          "/storage/v1/object/public/assignment-samples/"
        )[1];
      }
      if (!teacherPath) {
        throw new Error(
          "Teacher sample answer path missing for assignment " + assignmentId
        );
      }

      const { data: sSigned, error: sSignErr } = await supabaseAdmin.storage
        .from("submissions")
        .createSignedUrl(studentPath, 60); // 60s
      if (sSignErr)
        throw new Error(
          "Failed to create signed URL for student file: " + sSignErr.message
        );

      const { data: tSigned, error: tSignErr } = await supabaseAdmin.storage
        .from("assignment-samples")
        .createSignedUrl(teacherPath, 60);
      if (tSignErr)
        throw new Error(
          "Failed to create signed URL for teacher sample: " + tSignErr.message
        );

      // 3) Call the Python grader
      if (!GRADER_URL) {
        throw new Error("GRADER_URL environment variable not set");
      }

      console.log("[PLAGIARISM] Fetching other submissions for comparison...");

      const { data: otherSubmissions, error: otherErr } = await supabaseAdmin
        .from("submissions")
        .select("id, student_id, attachments, submitted_at")
        .eq("assignment_id", assignmentId)
        .eq("status", "turned_in") // Only compare with submitted work
        .neq("id", submissionId) // Exclude current submission
        .order("submitted_at", { ascending: true });

      if (otherErr) {
        console.warn(
          "[PLAGIARISM] Could not fetch other submissions:",
          otherErr
        );
      }

      console.log(
        `[PLAGIARISM] Found ${
          otherSubmissions?.length || 0
        } other submissions to compare`
      );

      const comparisonUrls = [];

      if (otherSubmissions && otherSubmissions.length > 0) {
        for (const other of otherSubmissions) {
          // Get first file attachment from this submission
          const otherFile_path = other.attachments[0].path;

          if (
            otherFile_path &&
            otherFile_path.includes("/storage/v1/object/public/submissions/")
          ) {
            otherFile_path = otherFile_path.split(
              "/storage/v1/object/public/submissions/"
            )[1];
          }

          if (otherFile_path) {
            try {
              const { data: otherSigned, error: otherSignErr } =
                await supabaseAdmin.storage
                  .from("submissions")
                  .createSignedUrl(otherFile_path, 120);

              if (!otherSignErr && otherSigned) {
                comparisonUrls.push({
                  url: otherSigned.signedUrl,
                  student_id: other.student_id,
                  submission_id: other.id,
                });
                console.log(`[PLAGIARISM] Added comparison: ${other.id}`);
              }
            } catch (e) {
              console.warn(
                `[PLAGIARISM] Could not generate URL for submission ${other.id}:`,
                e
              );
            }
          }
        }
      }

      console.log(
        `[PLAGIARISM] Generated ${comparisonUrls.length} comparison URLs`
      );

      const r = await fetch(GRADER_URL + "/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment_id: assignmentId,
          max_points: asn.max_points || 100,
          teacher_file_url: tSigned.signedUrl,
          student_file_url: sSigned.signedUrl,
          check_ai: true,
          check_plagiarism: true,
          comparison_urls: comparisonUrls,
          // question_text: optional exam sheet content if you store it
        }),
      });

      if (!r.ok) {
        const txt = await r.text();
        throw new Error("grader failed: " + txt);
      }
      const result = await r.json();

      const percent = asn.max_points
        ? (result.total_points / asn.max_points) * 100
        : null;

      await supabaseAdmin
        .from("submissions")
        .update({
          grade_points: result.total_points,
          grade_percent: percent,
          grade_breakdown: result.parts,
          plagiarism_score: result.plagiarism_result?.overall_score || null,
          plagiarism_detected:
            result.plagiarism_result?.is_plagiarized || false,
          plagiarism_matches: result.plagiarism_result?.matches || null,
          ai_probability: result.ai_detection_result?.ai_probability,
          ai_detected: result.ai_detection_result?.is_ai_generated,
          integrity_flags: result.integrity_flags,
          needs_review: !result.final_approved,
          graded_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      // 4) Persist grade and breakdown back to DB
      const { error: upErr } = await supabaseAdmin
        .from("submissions")
        .update({
          grade_points: result.total_points,
          grade_breakdown: result.parts, // JSONB
          grade_rubric: result.rubric,
          plagiarism_score: result.plagiarism_result?.overall_score || null,
          plagiarism_detected:
            result.plagiarism_result?.is_plagiarized || false,
          plagiarism_matches: result.plagiarism_result?.matches || null,
          ai_probability: result.ai_detection_result?.ai_probability,
          ai_detected: result.ai_detection_result?.is_ai_generated,
          integrity_flags: result.integrity_flags,
          needs_review: !result.final_approved,
          graded_at: new Date().toISOString(),
        })
        .eq("id", submissionId);

      console.log(result.ai_detection_result); // AI probability, details
      console.log(result.final_approved);
      if (upErr) throw upErr;

      res.json({ ok: true, grade: result });
    } catch (e) {
      console.error("[grade] error:", e);
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

app.post("/api/teacher/classrooms", requireAuth, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Class name required" });
    }

    const code = randomCode(6); // your 6-char code generator
    const supabase = supabaseForUser(req);

    const { data, error } = await supabase
      .from("classrooms")
      .insert({
        name: name.trim(),
        code,
        owner: req.user.id, // from your auth middleware
      })
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const { error: mErr } = await supabase
      .from("classroom_members")
      .upsert(
        { classroom_id: classroom.id, user_id: req.user.id, role: "teacher" },
        { onConflict: "classroom_id,user_id" }
      );

    if (mErr) {
      // not fatal for user, but log for us
      console.error("[create-class] upsert teacher member failed:", mErr);
    }

    res.json({ classrooms: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teacher/classrooms/:classId/assignments
app.post(
  "/api/teacher/classrooms/:classId/assignments",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    try {
      const { classId } = req.params;
      const sb = supabaseForUser(req); // user-scoped (RLS)
      // console.log('[create assignment] class_id param:', req.params.classId);

      const title = (req.body.title || "").trim();
      const description = (req.body.description || "").trim();
      if (!title || !description) {
        return res
          .status(400)
          .json({ error: "title and description are required" });
      }

      const max_points = Number(req.body.max_points ?? 100) || 100;
      const due_at = req.body.due_at ? new Date(req.body.due_at) : null;
      const dueISO = due_at && !isNaN(+due_at) ? due_at.toISOString() : null;

      // 1) INSERT (explicitly set created_by)
      const { data: ins, error: insErr } = await sb
        .from("assignments")
        .insert({
          class_id: req.params.classId,
          title,
          prompt: description,
          due_at: dueISO,
          max_points,
          created_by: req.user.id, // <- important
        })
        .select("id")
        .single();

      if (insErr) {
        console.error("[assignments.insert]", insErr);
        return res.status(400).json({ error: insErr.message });
      }

      const assignmentId = ins.id;
      let sampleObj = null;

      // 2) Optional file upload -> JSON metadata
      if (req.file && req.file.buffer) {
        const { originalname, mimetype, size, buffer } = req.file;
        const key = `${classId}/${assignmentId}/${crypto.randomUUID()}-${originalname}`;

        const { error: upErr } = await supabaseAdmin.storage
          .from("assignment-samples")
          .upload(key, buffer, { contentType: mimetype, upsert: false });

        if (upErr) {
          console.error("[storage.upload]", upErr);
          return res.status(400).json({ error: upErr.message });
        }

        sampleObj = {
          bucket: "assignment-samples",
          path: key,
          name: originalname,
          mime_type: mimetype,
          size,
          uploaded_at: new Date().toISOString(),
        };

        // 3) UPDATE sample_answer (now allowed by update policy)
        const { error: updErr } = await sb
          .from("assignments")
          .update({ sample_answer: sampleObj })
          .eq("id", assignmentId);

        if (updErr) {
          console.error("[assignments.update sample_answer]", updErr);
          return res.status(400).json({ error: updErr.message });
        }
      }

      return res.json({ id: assignmentId, sample_answer: sampleObj });
    } catch (e) {
      console.error("[create assignment] fatal", e);
      return res
        .status(500)
        .json({ error: "internal error while creating assignment" });
    }
  }
);

// GET /api/teacher/classrooms/:cid/assignments/:aid
app.get(
  "/api/teacher/classrooms/:cid/assignments/:aid",
  requireAuth,
  async (req, res) => {
    try {
      const { cid, aid } = req.params;
      // console.log("[GET assignment] cid, aid:", cid, aid);

      const sb = supabaseForUser(req);

      // 1) Fetch the assignment row
      const { data: a, error: aErr } = await sb
        .from("assignments")
        .select(
          "id, class_id, title, prompt, max_points, due_at, created_at, created_by, sample_answer"
        )
        .eq("id", aid)
        .single();

      if (aErr) return res.status(404).json({ error: "assignment not found" });
      if (a.class_id !== cid)
        return res.status(404).json({ error: "assignment not found" });

      // 2) Check teacher access via classroom membership (owner or teacher)
      const { data: membership, error: mErr } = await sb
        .from("classroom_members")
        .select("role")
        .eq("classroom_id", cid)
        .eq("user_id", req.user.id)
        .in("role", ["owner", "teacher"])
        .maybeSingle();

      if (mErr || !membership) {
        return res.status(403).json({ error: "forbidden" });
      }

      // 3) Normalize field names for the frontend
      const payload = {
        id: a.id,
        class_id: a.class_id,
        title: a.title || "",
        description: a.prompt || "", // you store description in `prompt`
        max_points: a.max_points ?? null,
        due_at: a.due_at || null,
        created_at: a.created_at,
        created_by: a.created_by || null,
        sample_answer: a.sample_answer || null,
      };

      return res.json(payload);
    } catch (e) {
      console.error("[GET teacher assignment]", e);
      return res.status(500).json({ error: "failed to load assignment" });
    }
  }
);

// Add this route to your server.js
// GET /api/teacher/assignments/:assignmentId/submissions
// Returns all submissions with student details for teacher view

app.get(
  "/api/teacher/assignments/:assignmentId/submissions",
  requireAuth,
  async (req, res) => {
    try {
      const { assignmentId } = req.params;
      const teacherId = req.user.id;

      // 1. Verify teacher owns this assignment
      const { data: assignment, error: asnErr } = await supabaseAdmin
        .from("assignments")
        .select("id, class_id, created_by, max_points")
        .eq("id", assignmentId)
        .single();

      if (asnErr || !assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Optional: Verify teacher owns the classroom
      const { data: classroom } = await supabaseAdmin
        .from("classrooms")
        .select("id, owner")
        .eq("id", assignment.class_id)
        .single();

      if (classroom && classroom.owner !== teacherId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // 2. Fetch all submissions for this assignment
      const { data: submissions, error: subsErr } = await supabaseAdmin
        .from("submissions")
        .select(
          `
          id,
          student_id,
          status,
          attachments,
          submitted_at,
          grade_points,
          grade_percent,
          plagiarism_score,
          plagiarism_detected,
          plagiarism_matches,
          ai_probability,
          ai_detected,
          integrity_flags,
          needs_review,
          graded_at
        `
        )
        .eq("assignment_id", assignmentId)
        .eq("status", "turned_in")
        .order("submitted_at", { ascending: false });

      if (subsErr) {
        console.error("[Submissions API] Error:", subsErr);
        return res.status(500).json({ error: subsErr.message });
      }

      // 3. Get unique student IDs
      const studentIds = [
        ...new Set((submissions || []).map((s) => s.student_id)),
      ];

      // 4. Fetch student details using Auth API
      const studentsMap = {};

      await Promise.all(
        studentIds.map(async (studentId) => {
          try {
            const { data: userData, error: userError } =
              await supabaseAdmin.auth.admin.getUserById(studentId);

            if (!userError && userData?.user) {
              const metadata = userData.user.user_metadata || {};
              studentsMap[studentId] = {
                id: studentId,
                name:
                  metadata.full_name ||
                  metadata.fullName ||
                  userData.user.email ||
                  "Unknown Student",
                email: userData.user.email,
              };
            } else {
              studentsMap[studentId] = {
                id: studentId,
                name: "Unknown Student",
                email: "",
              };
            }
          } catch (e) {
            console.warn(`Could not fetch student ${studentId}:`, e);
            studentsMap[studentId] = {
              id: studentId,
              name: "Unknown Student",
              email: "",
            };
          }
        })
      );

      // 5. Enrich submissions with student info and file URLs
      const enrichedSubmissions = await Promise.all(
        (submissions || []).map(async (sub) => {
          const student = studentsMap[sub.student_id] || {
            id: sub.student_id,
            name: "Unknown",
            email: "",
          };

          // Get file attachment - FIX STARTS HERE
          const fileAttachment = (sub.attachments || []).find(
            (a) => a.kind === "file"
          );
          let fileUrl = null;

          if (fileAttachment && fileAttachment.path) {
            try {
              // Create signed URL (valid for 1 hour)
              const { data: signedData, error: urlError } =
                await supabaseAdmin.storage
                  .from("submissions")
                  .createSignedUrl(fileAttachment.path, 3600);

              if (!urlError && signedData) {
                fileUrl = signedData.signedUrl;
              } else {
                console.warn(
                  `Could not create signed URL for ${fileAttachment.path}:`,
                  urlError
                );
              }
            } catch (e) {
              console.warn(`Error creating signed URL:`, e);
            }
          }
          // FIX ENDS HERE

          return {
            id: sub.id,
            student_id: sub.student_id,
            student_name: student.name,
            student_email: student.email,
            status: sub.status,
            submitted_at: sub.submitted_at,
            graded_at: sub.graded_at,

            // Grading
            grade_points: sub.grade_points,
            grade_percent: sub.grade_percent,

            // Plagiarism
            plagiarism_score: sub.plagiarism_score,
            plagiarism_detected: sub.plagiarism_detected,
            plagiarism_matches: sub.plagiarism_matches,

            // AI Detection
            ai_probability: sub.ai_probability,
            ai_detected: sub.ai_detected,

            // Review
            needs_review: sub.needs_review,
            integrity_flags: sub.integrity_flags || [],

            // File
            file_url: fileUrl,
            file_name: fileAttachment?.name || null,
            file_mime_type: fileAttachment?.mime_type || null,
          };
        })
      );

      // 6. Calculate statistics
      const stats = {
        total: enrichedSubmissions.length,
        graded: enrichedSubmissions.filter((s) => s.grade_points !== null)
          .length,
        pending: enrichedSubmissions.filter((s) => s.grade_points === null)
          .length,
        flagged: enrichedSubmissions.filter((s) => s.needs_review).length,
        avg_grade:
          enrichedSubmissions.length > 0
            ? enrichedSubmissions.reduce(
                (sum, s) => sum + (s.grade_percent || 0),
                0
              ) / enrichedSubmissions.length
            : 0,
        plagiarism_count: enrichedSubmissions.filter(
          (s) => s.plagiarism_detected
        ).length,
        ai_count: enrichedSubmissions.filter((s) => s.ai_detected).length,
      };

      res.json({
        submissions: enrichedSubmissions,
        stats,
        assignment: {
          id: assignment.id,
          max_points: assignment.max_points,
        },
      });
    } catch (e) {
      console.error("[Submissions API] Fatal error:", e);
      res.status(500).json({ error: "Failed to fetch submissions" });
    }
  }
);

// GET /api/classrooms/:classId/members
app.get("/api/classrooms/:classId/members", requireAuth, async (req, res) => {
  try {
    const { classId } = req.params;

    // Get classroom members
    const { data: memberRows, error: membersErr } = await supabaseAdmin
      .from("classroom_members")
      .select("user_id, role, joined_at")
      .eq("classroom_id", classId)
      .order("joined_at", { ascending: true });

    if (membersErr) return res.status(400).json({ error: membersErr.message });

    // Fetch user details for each member
    const memberDetails = await Promise.all(
      (memberRows || []).map(async (m) => {
        try {
          const { data: userData, error: userErr } =
            await supabaseAdmin.auth.admin.getUserById(m.user_id);

          if (userErr || !userData?.user) {
            return {
              id: m.user_id,
              name: "Unknown User",
              email: "",
              role: m.role,
              joined_at: m.joined_at,
            };
          }

          const metadata = userData.user.user_metadata || {};
          return {
            id: m.user_id,
            name:
              metadata.full_name ||
              metadata.fullName ||
              userData.user.email ||
              "Unknown User",
            email: userData.user.email || "",
            role: m.role,
            joined_at: m.joined_at,
          };
        } catch (err) {
          return {
            id: m.user_id,
            name: "Unknown User",
            email: "",
            role: m.role,
            joined_at: m.joined_at,
          };
        }
      })
    );

    res.json(memberDetails);
  } catch (e) {
    console.error("[members] error:", e);
    res.status(500).json({ error: "Failed to fetch members" });
  }
});

app.use(async (req, res, next) => {
  const supabase = supabaseForUser(req);
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) {
    const token = h.slice(7);
    // validate the token with your Supabase server client
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      req.user = data.user;
      return next();
    }
  }
  // Only block routes that require auth; otherwise call next()
  // res.status(401).json({ error: "unauthorized" });
  next();
});

app.listen(PORT, () =>
  console.log(`✅ Backend running on http://localhost:${PORT}`)
);
