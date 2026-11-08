// VoiceOrb.jsx - talk out loud with the ElevenLabs agent.
// The browser streams your microphone straight to ElevenLabs; the backend only gives us
// the agent id. The orb grows and wobbles with the volume: your voice while it listens,
// the agent's voice while it speaks. Voice conversations are NOT saved.

import { Conversation } from "@elevenlabs/client";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Close, Mic } from "./Icons.jsx";

const LABELS = {
  idle: "Ready", connecting: "Connecting…", listening: "Listening",
  speaking: "Speaking", ended: "Conversation ended", error: "Something went wrong",
};
const HINTS = {
  idle: "Tap the orb to start talking", ended: "Tap the orb to talk again", error: "Tap the orb to try again",
};
// colors per state: [inner, outer, halo]
const COLORS = {
  idle: ["#FFD9A8", "#FF4A00", "rgba(255,74,0,.30)"],
  connecting: ["#FFD9A8", "#FF4A00", "rgba(255,74,0,.30)"],
  listening: ["#FFE9B8", "#FFB000", "rgba(255,176,0,.40)"],
  speaking: ["#FFD0B0", "#FF2E00", "rgba(255,46,0,.50)"],
  ended: ["#D8CFC8", "#5F534C", "rgba(140,125,115,.25)"],
  error: ["#ffb4b4", "#c2414a", "rgba(230,80,90,.45)"],
};

function blob(ctx, cx, cy, radius, wobble, t, phase) {
  const points = 120;
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = radius
      + Math.sin(a * 3 + t * 1.3 + phase) * wobble
      + Math.sin(a * 5 - t * 1.7 + phase * 2) * wobble * 0.5
      + Math.sin(a * 2 + t * 0.9 - phase) * wobble * 0.35;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export default function VoiceOrb({ height = 520 }) {
  const canvasRef = useRef(null);
  const conversation = useRef(null);
  const stateRef = useRef("idle");       // read by the animation
  const [state, setStateValue] = useState("idle");
  const [statusText, setStatusText] = useState(LABELS.idle);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState(null);
  const [agentId, setAgentId] = useState(undefined);
  const captionTimer = useRef(null);

  function setState(next, message) {
    stateRef.current = next;
    setStateValue(next);
    setStatusText(message || LABELS[next]);
  }

  function showCaption(who, text) {
    if (!text) return;
    setCaption({ who, text });
    clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => setCaption(null), 8000);
  }

  useEffect(() => {
    api.get("/voice/config").then((c) => setAgentId(c.agent_id)).catch(() => setAgentId(""));
  }, []);

  async function start() {
    if (conversation.current || stateRef.current === "connecting") return;
    setState("connecting");
    setMuted(false);
    try {
      conversation.current = await Conversation.startSession({
        agentId,
        onConnect: () => setState("listening"),
        onDisconnect: () => {
          conversation.current = null;
          if (stateRef.current !== "error") setState("ended");
        },
        onModeChange: ({ mode }) => setState(mode === "speaking" ? "speaking" : "listening"),
        onMessage: (m) => {
          const fromUser = (m.source ?? m.role) === "user";
          showCaption(fromUser ? "You" : "Agent", m.message ?? m.text);
        },
        onError: (message) => {
          console.error("ElevenLabs:", message);
          setState("error", "Error: " + String(message).slice(0, 80));
        },
      });
    } catch (err) {
      conversation.current = null;
      console.error(err);
      const text = String((err && err.message) || err);
      if (/permission|denied|NotAllowed/i.test(text)) {
        setState("error", "Microphone blocked – allow it in the browser");
      } else {
        setState("error", "Could not connect: " + text.slice(0, 70));
      }
    }
  }

  async function stop() {
    const current = conversation.current;
    conversation.current = null;
    if (current) await current.endSession();
    setState("ended");
  }

  function toggleMute() {
    if (!conversation.current) return;
    conversation.current.setMicMuted(!muted);
    setMuted(!muted);
  }

  // closing the pop-up or leaving the page hangs up cleanly
  useEffect(() => () => {
    clearTimeout(captionTimer.current);
    if (conversation.current) conversation.current.endSession();
    conversation.current = null;
  }, []);

  // ---------- the animated orb ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let frameId;
    let volume = 0;
    let level = 0;         // smoothed volume, so it doesn't flicker

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // follows the real size: inside a pop-up the canvas has no size until the pop-up opens
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    function readVolume() {
      const current = conversation.current;
      if (!current) { volume = 0; return; }
      try {
        const v = stateRef.current === "speaking" ? current.getOutputVolume() : current.getInputVolume();
        if (v && typeof v.then === "function") v.then((x) => { volume = x || 0; });
        else volume = v || 0;
      } catch {
        volume = 0;
      }
    }

    function frame(ms) {
      const t = ms / 1000;
      const now = stateRef.current;
      readVolume();
      level += (Math.min(volume * 1.6, 1) - level) * 0.18;

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h * 0.44;
      const base = Math.min(w, h) * 0.2;
      const breathing = (now === "idle" || now === "ended" || now === "connecting")
        ? Math.sin(t * (now === "connecting" ? 4 : 1.6)) * 0.035 : 0;
      const radius = base * (1 + breathing + level * 0.28);
      const wobble = 3 + level * base * 0.22 + (now === "connecting" ? 3 : 0);
      const [inner, outer, glow] = COLORS[now];

      ctx.clearRect(0, 0, w, h);

      // soft halo behind the orb
      const halo = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * (2.3 + level));
      halo.addColorStop(0, glow);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);

      // three see-through layers that move slightly differently = a "living" orb
      for (let layer = 0; layer < 3; layer++) {
        const r = radius * (1 - layer * 0.07);
        const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15);
        g.addColorStop(0, inner);
        g.addColorStop(1, outer);
        ctx.globalAlpha = layer === 0 ? 1 : 0.45;
        ctx.fillStyle = g;
        blob(ctx, cx, cy, r, wobble * (1 + layer * 0.4), t * (1 + layer * 0.25), layer * 2.1);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // a small shine in the top left
      const shine = ctx.createRadialGradient(cx - radius * 0.4, cy - radius * 0.45, 0,
        cx - radius * 0.4, cy - radius * 0.45, radius * 0.6);
      shine.addColorStop(0, "rgba(255,255,255,.45)");
      shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  if (agentId === "") {
    return <div className="alert">ELEVENLABS_AGENT_ID is missing in the .env file.</div>;
  }
  const live = state === "listening" || state === "speaking";
  const hint = HINTS[state];
  return (
    <div className="voice-panel" style={{ height }}>
      <canvas ref={canvasRef} aria-label="Voice orb, click to start talking"
              onClick={() => { if (["idle", "ended", "error"].includes(state) && agentId) start(); }} />
      <div className={"voice-status" + (live ? " live" : "")}><span className="dot" />{statusText}</div>
      <div className="voice-hint" style={{ opacity: hint ? 1 : 0 }}>{hint || ""}</div>
      <div className={"voice-caption" + (caption ? " show" : "")}>
        {caption && <><span className="who">{caption.who}</span>{caption.text}</>}
      </div>
      <div className="voice-controls">
        <button className={muted ? "muted" : ""} disabled={!live} onClick={toggleMute}
                aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute microphone" : "Mute microphone"}>
          <Mic size={24} />
        </button>
        <button className="end" disabled={!live && state !== "connecting"} onClick={stop}
                aria-label="End conversation" title="End conversation">
          <Close size={24} />
        </button>
      </div>
    </div>
  );
}
