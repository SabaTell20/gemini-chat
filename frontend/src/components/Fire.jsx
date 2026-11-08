// Fire.jsx - the "Jamra" touches: the cheeky logo, slow embers, and a burst of sparks.

import { useMemo } from "react";

/** The logo: a flame-coloured square with a face. The right eye winks (see style.css). */
export function LogoMark({ size = 32 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#FF4A00" />
      <g className="eyes">
        <circle cx="11" cy="13" r="2.6" fill="#0E0B0A" />
        <ellipse className="eye-r" cx="21" cy="13" rx="2.6" ry="2.6" fill="#0E0B0A" />
      </g>
      <path d="M10 20c3 3.500 9 3.800 12.500 0" fill="none" stroke="#0E0B0A" strokeWidth="2.400" strokeLinecap="round" />
    </svg>
  );
}

/** Slow embers rising behind a page. Decoration only. */
export function Embers({ count = 18 }) {
  const embers = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: Math.random() * 100,
    size: 2 + Math.random() * 3,
    duration: 6 + Math.random() * 7,
    delay: -Math.random() * 12,
    drift: (Math.random() - 0.5) * 80,
    amber: i % 3 === 0,
  })), [count]);
  return (
    <div className="embers" aria-hidden="true">
      {embers.map((e, i) => (
        <span key={i} className={e.amber ? "amber" : ""} style={{
          left: `${e.left}%`, width: e.size, height: e.size,
          animationDuration: `${e.duration}s`, animationDelay: `${e.delay}s`, "--drift": `${e.drift}px`,
        }} />
      ))}
    </div>
  );
}

/** Letters that dance one after the other. Screen readers get the plain word. */
export function Wiggle({ text }) {
  return (
    <span aria-label={text}>
      {[...text].map((letter, i) => (
        <span key={i} className="ltr" aria-hidden="true" style={{ animationDelay: `${i * 0.09}s` }}>{letter}</span>
      ))}
    </span>
  );
}

function calm() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** One tiny spark at a point of the screen. */
function spark(x, y, dx, dy, small) {
  const element = document.createElement("span");
  element.className = "spark" + (small ? " small" : "") + (Math.random() < 0.35 ? " amber" : "");
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
  element.style.setProperty("--dx", `${dx}px`);
  element.style.setProperty("--dy", `${dy}px`);
  document.body.append(element);
  element.addEventListener("animationend", () => element.remove());
}

/** Everything that reacts to the mouse and the keyboard. Started once in main.jsx. */
export function startFireEffects() {
  if (calm()) return;
  const root = document.documentElement;
  let lastSpark = 0;

  window.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;

    // the logo looks at the mouse
    root.style.setProperty("--ex", `${((event.clientX / window.innerWidth) - 0.5) * 3.2}px`);
    root.style.setProperty("--ey", `${((event.clientY / window.innerHeight) - 0.5) * 3.2}px`);

    // cards lean towards the mouse
    const card = event.target.closest?.(".example, .kpi, .login-card");
    if (card) {
      const box = card.getBoundingClientRect();
      const strength = card.classList.contains("login-card") ? 3 : 9;
      card.style.setProperty("--ry", `${((event.clientX - box.left) / box.width - 0.5) * strength}deg`);
      card.style.setProperty("--rx", `${(0.5 - (event.clientY - box.top) / box.height) * strength}deg`);
    }

    // a trail of sparks behind the mouse on the login page and the empty chat
    const now = performance.now();
    if (now - lastSpark > 45 && document.querySelector(".embers")) {
      lastSpark = now;
      spark(event.clientX, event.clientY, (Math.random() - 0.5) * 36, 10 + Math.random() * 40, true);
    }
  });

  // reset a card when the mouse leaves it
  document.addEventListener("pointerout", (event) => {
    const card = event.target.closest?.(".example, .kpi, .login-card");
    if (card && !card.contains(event.relatedTarget)) {
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    }
  });

  // typing throws a spark from the box you are typing in
  document.addEventListener("keydown", (event) => {
    if (!event.target.matches?.("textarea, input") || event.key.length !== 1) return;
    const box = event.target.getBoundingClientRect();
    const x = box.left + 20 + Math.random() * (box.width - 40);
    spark(x, box.top + 4, (Math.random() - 0.5) * 30, -20 - Math.random() * 50, true);
  });

  // every button click gives a small burst
  document.addEventListener("pointerdown", (event) => {
    const button = event.target.closest?.(".btn, .pill, .example, .new-chat");
    if (button) sparkBurst(button, 6);
  });
}

/** A quick burst of sparks from an element, used when a message is sent. */
export function sparkBurst(element, count = 16) {
  if (!element || calm()) return;
  const box = element.getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const spark = document.createElement("span");
    const angle = -Math.PI * (0.05 + Math.random() * 0.9);      // upwards, in a fan
    const distance = 40 + Math.random() * 110;
    spark.className = "spark" + (i % 3 === 0 ? " amber" : "");
    spark.style.left = `${box.left + box.width / 2}px`;
    spark.style.top = `${box.top + box.height / 2}px`;
    spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    document.body.append(spark);
    spark.addEventListener("animationend", () => spark.remove());
  }
}
