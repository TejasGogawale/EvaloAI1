import { Routes, Route, Link, Navigate } from "react-router-dom";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import StudentDashboard from "./pages/StudentDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import ClassroomPage from "./pages/ClassroomPage";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuth } from "./auth/AuthProvider";
import { useState, useEffect } from 'react';
import "./styles/auth.css";
import ToDoPage from "./pages/ToDoPage";
import AssignmentPage from "./pages/AssignmentPage";
import TeacherClassPage from "./pages/TeacherClassPage";
import TeacherAssignmentPage from "./pages/TeacherAssignmentPage";

export default function App() {
  const { user, role } = useAuth();
  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/student"
          element={
            <ProtectedRoute roles={["student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/class/:id" element={<ClassroomPage />} />
        <Route path="/todo" element={<ToDoPage />} />
        <Route path="/assignment/:id" element={<AssignmentPage />} />
        // example
        {/* <Route path="/teacher" element={<TeacherDashboard />} /> */}

        <Route path="/teacher/class/:id" element={<TeacherClassPage />} />
        // in your router config
        <Route
          path="/teacher/class/:classId/assignments/:assignmentId"
          element={<TeacherAssignmentPage />}
        />

        <Route
          path="/teacher"
          element={
            <ProtectedRoute roles={["teacher"]}>
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </div>
  );
}