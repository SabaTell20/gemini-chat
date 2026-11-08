// App.jsx - the "front door". It decides which pages you are allowed to see:
//   not logged in -> only the login page and the legal pages
//   user          -> the chat and the voice agent
//   admin         -> also the billing dashboard and user management
// The backend checks all of this again; this file only decides what to show.

import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api.js";
import Shell from "./components/Shell.jsx";
import Admin from "./pages/Admin.jsx";
import Billing from "./pages/Billing.jsx";
import Chat from "./pages/Chat.jsx";
import Legal from "./pages/Legal.jsx";
import Login from "./pages/Login.jsx";
import VoicePage from "./pages/VoicePage.jsx";

const LEGAL = [
  ["/Privacy", "privacy"],
  ["/Terms", "terms"],
  ["/Cookies", "cookies"],
];

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking the cookie

  const loadUser = useCallback(async () => {
    try {
      setUser(await api.get("/auth/me"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    loadUser();
    const lost = () => setUser(null);
    window.addEventListener("auth-lost", lost);
    return () => window.removeEventListener("auth-lost", lost);
  }, [loadUser]);

  async function logOut() {
    await api.post("/auth/logout");
    sessionStorage.clear();
    setUser(null);
  }

  if (user === undefined) return null;

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Login onLogin={loadUser} />} />
        {LEGAL.map(([path, name]) => (
          <Route key={path} path={path} element={<Legal name={name} loggedIn={false} />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const admin = user.role === "admin";
  return (
    <Routes>
      <Route element={<Shell user={user} onLogout={logOut} />}>
        <Route path="/" element={<Chat user={user} />} />
        <Route path="/Voice" element={<VoicePage />} />
        {admin && <Route path="/Billing" element={<Billing />} />}
        {admin && <Route path="/Admin" element={<Admin me={user} />} />}
        {LEGAL.map(([path, name]) => (
          <Route key={path} path={path} element={<Legal name={name} loggedIn />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
