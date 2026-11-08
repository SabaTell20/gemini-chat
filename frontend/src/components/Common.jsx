// Common.jsx - small pieces shared by several pages.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Close } from "./Icons.jsx";

export function usePageTitle(title) {
  useEffect(() => {
    document.title = `${title} · Gemini Chat`;
  }, [title]);
}

/** Editorial page title: a small-caps line above, a serif title, a muted line under it. */
export function PageHeader({ title, subtitle, eyebrow }) {
  return (
    <header className="page-head">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

/** Small footer: copyright with the CURRENT year, and the legal pages. */
export function SiteFooter() {
  return (
    <footer className="site-foot">
      © {new Date().getFullYear()} Gemini Chat (demo project) · <Link to="/Privacy">Privacy</Link> ·{" "}
      <Link to="/Terms">Terms</Link> · <Link to="/Cookies">Cookies</Link>
    </footer>
  );
}

/** A pop-up window. The browser's own <dialog> handles focus and the Esc key. */
export function Dialog({ title, onClose, wide, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    // start typing straight away: the browser would otherwise focus the Close button
    dialog.querySelector("input")?.select();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className={"dialog" + (wide ? " wide" : "")} aria-label={title}
            onCancel={(e) => { e.preventDefault(); onClose(); }}
            onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Close /></button>
      </div>
      {children}
    </dialog>
  );
}

/** A short message that disappears by itself. */
export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return message ? <div className="toast" role="status">{message}</div> : null;
}

/** Two buttons where exactly one is on (User / Admin). */
export function Segmented({ label, options, value, onChange }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button key={option} type="button" role="radio" aria-checked={value === option}
                  className={value === option ? "on" : ""} onClick={() => onChange(option)}>
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Field({ label, error, hint, ...input }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input {...input} aria-invalid={error ? true : undefined} />
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="field-error" role="alert">{error}</span>}
    </label>
  );
}

/** Makes a number count up from 0 (skipped if the device asks for less motion). */
export function CountUp({ text, delay = 0 }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const match = text.match(/[\d,]*\.?\d+/);
    if (!match || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return undefined;
    }
    const raw = match[0];
    const target = parseFloat(raw.replace(/,/g, ""));
    const decimals = (raw.split(".")[1] || "").length;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + raw.length);
    const format = (value) => value.toLocaleString("en-US", {
      minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    });
    const start = performance.now() + delay;
    let frame;
    const step = (now) => {
      const progress = Math.max(0, Math.min((now - start) / 1200, 1));
      const eased = 1 - Math.pow(1 - progress, 4);
      setShown(before + format(target * eased) + after);
      if (progress < 1) frame = requestAnimationFrame(step);
      else setShown(text);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [text, delay]);
  return shown;
}
