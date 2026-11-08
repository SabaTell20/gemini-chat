// Login.jsx - sign in, or reset a forgotten password with a 6-digit email code.
// Which step shows is kept in the address bar (?view=...):
//   login  -> email + password
//   forgot -> type your email to get a code
//   code   -> type the code and a new password

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { Field, SiteFooter, usePageTitle } from "../components/Common.jsx";
import { Embers, LogoMark, Wiggle } from "../components/Fire.jsx";

function Hero() {
  return (
    <aside className="login-hero" aria-label="About Gemini Chat">
      <div className="hero-brand"><LogoMark size={28} />Gemini Chat</div>
      <h2 className="hero-title">
        <span className="w">Ask</span> <span className="w">me</span><br />
        <em><span className="w"><Wiggle text="anything." /></span></em><br />
        <span className="w help">I dare you.<i className="squiggle" /></span>
      </h2>
      <p className="hero-text">Ask questions, share images, PDFs and voice memos, or simply talk to the
        voice agent. Your conversations stay in your own account.</p>
      <ol className="hero-list">
        <li><span>01</span>Text, images and PDFs in one conversation</li>
        <li><span>02</span>Voice memos and a live voice agent</li>
        <li><span>03</span>Chats that only you can see</li>
      </ol>
      <p className="hero-foot">A demo project, built with React, FastAPI and Gemini.</p>
    </aside>
  );
}

function Head({ title, subtitle }) {
  return (
    <div className="login-head">
      <LogoMark size={40} />
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
}

function Steps({ active }) {
  return (
    <div className="steps" aria-label={`Step ${active} of 2`}>
      {[1, 2].map((i) => <span key={i} className={i <= active ? "on" : ""} />)}
    </div>
  );
}

export default function Login({ onLogin }) {
  const [params, setParams] = useSearchParams();
  const [resetEmail, setResetEmail] = useState("");
  const [message, setMessage] = useState("");            // e.g. "password changed"
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", remember: true, code: "", new_password: "", again: "" });

  // a reload in the middle of a reset forgets the email: start the reset again
  let view = params.get("view") || "login";
  if (view === "code" && !resetEmail) view = "forgot";
  usePageTitle(view === "login" ? "Log in" : "Reset your password");

  useEffect(() => setErrors({}), [view]);

  const bind = (name) => ({
    name,
    value: form[name],
    onChange: (e) => setForm({ ...form, [name]: e.target.value }),
  });
  const goTo = (next) => setParams(next === "login" ? {} : { view: next });

  async function submit(event, action) {
    event.preventDefault();
    setErrors({});
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  const signIn = (event) => submit(event, async () => {
    if (!form.email.trim()) return setErrors({ email: "Please enter your email." });
    try {
      await api.post("/auth/login", { email: form.email, password: form.password, remember: form.remember });
      sessionStorage.clear();              // start with a new chat
      await onLogin();
    } catch (error) {
      setErrors({ password: error.message });
    }
  });

  const sendCode = (event) => submit(event, async () => {
    if (!form.email.trim()) return setErrors({ email: "Please enter your email." });
    try {
      await api.post("/auth/forgot", { email: form.email });
      setResetEmail(form.email.trim());
      goTo("code");
    } catch (error) {
      setErrors({ email: error.message });
    }
  });

  const changePassword = (event) => submit(event, async () => {
    try {
      await api.post("/auth/reset", {
        email: resetEmail, code: form.code, new_password: form.new_password, again: form.again,
      });
      setForm({ ...form, password: "", code: "", new_password: "", again: "" });
      setMessage("Password changed. You can sign in now.");
      goTo("login");
    } catch (error) {
      const passwordProblem = /password/i.test(error.message);
      setErrors(passwordProblem ? { new_password: error.message } : { code: error.message });
    }
  });

  return (
    <div className="login-page">
      <Embers count={24} />
      <div className="login-shell">
        <Hero />
        <div className="login-card">
          {view === "login" && (
            <>
              <Head title="Oh, you again." subtitle="Sign in to continue to Gemini Chat" />
              {message && <div className="form-note ok" role="status">{message}</div>}
              <form onSubmit={signIn} noValidate>
                <Field label="Email" type="email" placeholder="you@example.com" autoComplete="email"
                       error={errors.email} {...bind("email")} />
                <div className="password-field">
                  <Link className="field-link" to="?view=forgot">Forgot password?</Link>
                  <Field label="Password" type="password" autoComplete="current-password"
                         error={errors.password} {...bind("password")} />
                </div>
                <label className="check" title="Stay logged in on this browser for 30 days, even after you close the browser.">
                  <input type="checkbox" checked={form.remember}
                         onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
                  Keep me signed in
                </label>
                <button className="btn primary wide" disabled={busy}>Sign in</button>
              </form>
              <p className="legal-note">By signing in you agree to the <Link to="/Terms">Terms</Link> and
                the <Link to="/Privacy">Privacy Policy</Link>.</p>
            </>
          )}
          {view === "forgot" && (
            <>
              <Head title="Forgot it, huh?" subtitle="We'll email you a 6-digit code" />
              <Steps active={1} />
              <form onSubmit={sendCode} noValidate>
                <Field label="Email" type="email" placeholder="you@example.com" autoComplete="email"
                       error={errors.email} {...bind("email")} />
                <button className="btn primary wide" disabled={busy}>Send code</button>
              </form>
              <div className="login-foot"><Link to="/">Back to sign in</Link></div>
            </>
          )}
          {view === "code" && (
            <>
              <Head title="Check your email" subtitle="Enter the code and choose a better password" />
              <Steps active={2} />
              <div className="form-note">If {resetEmail} has an account, a code is on its way. It works for
                15 minutes. Check your spam folder too.</div>
              <form onSubmit={changePassword} noValidate>
                <Field label="6-digit code" maxLength={6} inputMode="numeric" placeholder="123456"
                       autoComplete="one-time-code" error={errors.code} {...bind("code")} />
                <Field label="New password" type="password" autoComplete="new-password"
                       hint="At least 8 characters" {...bind("new_password")} />
                <Field label="Repeat new password" type="password" autoComplete="new-password"
                       error={errors.new_password} {...bind("again")} />
                <button className="btn primary wide" disabled={busy}>Change password</button>
              </form>
              <div className="login-foot">
                <Link to="?view=forgot">Send a new code</Link> · <Link to="/">Back to sign in</Link>
              </div>
            </>
          )}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
