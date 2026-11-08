// Admin.jsx - user management, for admins only (the backend checks this too).
// A list of users with role badges. Each action opens a small pop-up window.

import { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { Dialog, Field, PageHeader, Segmented, Toast, usePageTitle } from "../components/Common.jsx";
import * as I from "../components/Icons.jsx";
import { UserCard } from "../components/Shell.jsx";

function useForm(action, onDone) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(event) {
    event?.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await action();
      onDone(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return { error, busy, run };
}

function CreateDialog({ onClose, onDone }) {
  const [v, setV] = useState({ username: "", email: "", password: "", again: "", role: "user" });
  const form = useForm(() => api.post("/admin/users", v), onDone);
  const bind = (name) => ({ value: v[name], onChange: (e) => setV({ ...v, [name]: e.target.value }) });
  return (
    <Dialog title="Create user" onClose={onClose}>
      <form onSubmit={form.run} noValidate>
        <Field label="Username" autoComplete="off" {...bind("username")} />
        <Field label="Email" type="email" autoComplete="off" {...bind("email")} />
        <Field label="Password" type="password" autoComplete="new-password" hint="At least 8 characters" {...bind("password")} />
        <Field label="Repeat password" type="password" autoComplete="new-password" {...bind("again")} />
        <Segmented label="Role" options={["user", "admin"]} value={v.role} onChange={(role) => setV({ ...v, role })} />
        {form.error && <div className="alert" role="alert">{form.error}</div>}
        <button className="btn primary wide" disabled={form.busy}>Create user</button>
      </form>
    </Dialog>
  );
}

function PasswordDialog({ user, onClose, onDone }) {
  const [v, setV] = useState({ password: "", again: "" });
  const form = useForm(() => api.put(`/admin/users/${user.id}/password`, v), onDone);
  return (
    <Dialog title="Change password" onClose={onClose}>
      <p className="caption">New password for <strong>{user.username}</strong>. They will be logged out on every device.</p>
      <form onSubmit={form.run} noValidate>
        <Field label="New password" type="password" autoComplete="new-password" hint="At least 8 characters"
               value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        <Field label="Repeat new password" type="password" autoComplete="new-password"
               value={v.again} onChange={(e) => setV({ ...v, again: e.target.value })} />
        {form.error && <div className="alert" role="alert">{form.error}</div>}
        <button className="btn primary wide" disabled={form.busy}>Change password</button>
      </form>
    </Dialog>
  );
}

function RoleDialog({ user, onClose, onDone }) {
  const [role, setRole] = useState(user.role);
  const form = useForm(() => api.put(`/admin/users/${user.id}/role`, { role }), onDone);
  return (
    <Dialog title="Change role" onClose={onClose}>
      <form onSubmit={form.run}>
        <Segmented label={`Role of ${user.username}`} options={["user", "admin"]} value={role} onChange={setRole} />
        {form.error && <div className="alert" role="alert">{form.error}</div>}
        <button className="btn primary wide" disabled={form.busy}>Save</button>
      </form>
    </Dialog>
  );
}

function DeleteDialog({ user, lastAdmin, onClose, onDone }) {
  const [typed, setTyped] = useState("");
  const form = useForm(() => api.delete(`/admin/users/${user.id}`), onDone);
  return (
    <Dialog title="Delete user" onClose={onClose}>
      <p>This <strong>permanently</strong> deletes <strong>{user.username}</strong> and everything that belongs to
        them: all chats, messages, uploaded files, voice transcripts and usage data. This can't be undone.</p>
      {lastAdmin ? (
        <div className="alert" role="alert">This is the last admin. Make someone else admin first.</div>
      ) : (
        <form onSubmit={form.run}>
          <Field label={`Type ${user.username} to confirm`} autoComplete="off" value={typed}
                 onChange={(e) => setTyped(e.target.value)} />
          {form.error && <div className="alert" role="alert">{form.error}</div>}
          <button className="btn danger wide" disabled={form.busy || typed.trim() !== user.username}>Delete permanently</button>
        </form>
      )}
    </Dialog>
  );
}

export default function Admin({ me }) {
  usePageTitle("User management");
  const [users, setUsers] = useState(null);
  const [dialog, setDialog] = useState(null);       // { kind, user }
  const [toast, setToast] = useState("");
  const clearToast = useCallback(() => setToast(""), []);

  const load = useCallback(() => api.get("/admin/users").then(setUsers), []);
  useEffect(() => { load(); }, [load]);

  function done(message) {
    setDialog(null);
    if (message) setToast(message);
    load();
  }

  if (!users) return null;
  const admins = users.filter((u) => u.role === "admin").length;
  const shared = { onClose: () => setDialog(null), onDone: done };

  return (
    <div className="page">
      <div className="page-top">
        <PageHeader title="Users" eyebrow="Admin"
                    subtitle={`${users.length} accounts · ${admins} admin${admins !== 1 ? "s" : ""}`} />
        <button className="btn primary" onClick={() => setDialog({ kind: "create" })}><I.PersonAdd /> Create user</button>
      </div>

      <div className="users-table">
        <div className="utable-head"><span>User</span><span>Role</span><span>Created</span><span /></div>
        {users.map((user) => (
          <div className="urow" key={user.id}>
            <UserCard user={user} you={user.id === me.id} />
            <span><span className={"badge " + user.role}>{user.role === "admin" ? "Admin" : "User"}</span></span>
            <span className="ucreated">{user.created_at}</span>
            <span className="uactions">
              <button className="icon-btn" title="Change password" aria-label={`Change password of ${user.username}`}
                      onClick={() => setDialog({ kind: "password", user })}><I.Key /></button>
              <button className="icon-btn" title="Change role" aria-label={`Change role of ${user.username}`}
                      onClick={() => setDialog({ kind: "role", user })}><I.Shield /></button>
              {user.id !== me.id && (
                <button className="icon-btn del" title="Delete user and all their data" aria-label={`Delete ${user.username}`}
                        onClick={() => setDialog({ kind: "delete", user })}><I.Trash /></button>
              )}
            </span>
          </div>
        ))}
      </div>

      {dialog?.kind === "create" && <CreateDialog {...shared} />}
      {dialog?.kind === "password" && <PasswordDialog user={dialog.user} {...shared} />}
      {dialog?.kind === "role" && <RoleDialog user={dialog.user} {...shared} />}
      {dialog?.kind === "delete" && (
        <DeleteDialog user={dialog.user} lastAdmin={dialog.user.role === "admin" && admins <= 1} {...shared} />
      )}
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
