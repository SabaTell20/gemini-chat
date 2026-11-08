// Shell.jsx - the frame around every logged-in page: the sidebar with the logo, a slot
// that the chat page fills with its chat list, and the user card with the ... menu.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { LogoMark } from "./Fire.jsx";
import * as I from "./Icons.jsx";

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const item = (to, label, Icon) => (
    <NavLink to={to} end className="menu-item" onClick={() => setOpen(false)}>
      <Icon /> {label}
    </NavLink>
  );
  return (
    <div className="user-menu" ref={box}>
      <button className="icon-btn" aria-label="Account menu" aria-expanded={open}
              onClick={() => setOpen(!open)}><I.More /></button>
      {open && (
        <div className="popover">
          {item("/", "Chat", I.Chat)}
          {item("/Voice", "Voice agent", I.Wave)}
          {user.role === "admin" && item("/Billing", "Billing", I.Card)}
          {user.role === "admin" && item("/Admin", "User management", I.Users)}
          {item("/Privacy", "Privacy & terms", I.Policy)}
          <hr />
          <button className="menu-item logout" onClick={onLogout}><I.Logout /> Log out</button>
        </div>
      )}
    </div>
  );
}

export function UserCard({ user, you }) {
  return (
    <div className="user-card">
      <div className="user-avatar" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</div>
      <div className="user-info">
        <div className="user-name">
          {user.username}
          {you && <span className="you">you</span>}
          {!you && you !== false && <span className={"badge " + user.role}>{user.role[0].toUpperCase() + user.role.slice(1)}</span>}
        </div>
        <div className="user-email" title={user.email}>{user.email}</div>
      </div>
    </div>
  );
}

export default function Shell({ user, onLogout }) {
  const [slot, setSlot] = useState(null);       // where the chat page puts its list
  const [open, setOpen] = useState(false);      // the sidebar on phones
  const [closed, setClosed] = useState(false);  // the sidebar hidden on big screens
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className={"shell" + (closed ? " side-closed" : "")}>
      <aside className={"sidebar" + (open ? " open" : "")} aria-label="Sidebar">
        <div className="side-head">
          <Link to="/" className="brand" aria-label="Gemini Chat, go to the chat"><LogoMark size={32} />Gemini Chat</Link>
          <button className="icon-btn" aria-label="Close sidebar"
                  onClick={() => { setOpen(false); setClosed(true); }}><I.Close /></button>
        </div>
        <div className="side-slot" ref={setSlot} />
        <div className="side-foot">
          <UserCard user={user} />
          <UserMenu user={user} onLogout={onLogout} />
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <button className="icon-btn open-side" aria-label="Open sidebar"
              onClick={() => { setClosed(false); setOpen(true); }}><I.Menu /></button>
      <main className="main">
        <Outlet context={{ sidebarSlot: slot, closeSidebar: () => setOpen(false) }} />
      </main>
    </div>
  );
}
