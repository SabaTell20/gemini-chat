// Chat.jsx - the chat page: the chat list in the sidebar, the conversation, and the composer.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { useOutletContext } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { api, errorFrom } from "../api.js";
import { Dialog, Field, usePageTitle } from "../components/Common.jsx";
import { Embers, LogoMark, sparkBurst, Wiggle } from "../components/Fire.jsx";
import * as I from "../components/Icons.jsx";
import { startRecording } from "../components/recorder.js";
import VoiceOrb from "../components/VoiceOrb.jsx";

const DEFAULT_TEXT = "Please look at the attached file.";   // sent when only a file is attached
const MAX_FILE_MB = 20;
const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,.mp3,.wav,.ogg,.flac,.aac";
const OPTIONS = [
  ["thinking", "Thinking", I.Brain],
  ["streaming", "Streaming", I.Bolt],
  ["search", "Search", I.Globe],
];
// 4 example prompts for an empty chat: [bold title, small text, prompt that fills the input]
const EXAMPLES = [
  ["Write an email", "asking for a deadline extension",
    "Write a short, polite email to my teacher asking for a one-week deadline extension."],
  ["Explain simply", "how neural networks learn",
    "Explain how neural networks learn, in simple words, with one everyday example."],
  ["Make a plan", "a 5-day study plan for SQL",
    "Make a 5-day study plan to learn the basics of SQL, about 1 hour per day."],
  ["Quick idea", "a healthy 20-minute dinner",
    "Give me a healthy dinner recipe I can cook in 20 minutes, with a shopping list."],
];
const IDEAS = ["Summarise a PDF", "Explain it like I'm 12", "Draft a cover letter", "Transcribe a voice memo",
  "Plan a weekend trip", "Compare two ideas", "Write a short poem", "Fix my SQL query", "Describe a photo"];

/** New chats are named after the first 30 letters of the first message, which can stop
 *  mid-word ("Please look at the attached fi"). Show "…" so it looks intended. */
function niceTitle(title) {
  if (title.length === 30 && !/[.!?…]$/.test(title)) return title.trimEnd() + "…";
  return title;
}

const fileUrl = (file) => file.url || `/api/files/${file.id}`;

function FileCards({ files, transcription }) {
  if (!files.length) return null;
  return (
    <div className="ufiles">
      {files.map((file, i) => {
        if (file.mime_type.startsWith("image/")) {
          return <img key={i} src={fileUrl(file)} width="260" alt={`Image sent in this chat: ${file.name}`} />;
        }
        if (file.mime_type.startsWith("audio/")) {
          return (
            <div className="vcard" key={i}>
              <div className="file-card">
                <div className="file-icon voice"><I.Mic /></div>
                <div className="file-text">
                  <div className="file-name">Voice message</div>
                  <div className="file-meta">{file.name}</div>
                </div>
              </div>
              <audio controls src={fileUrl(file)} preload="metadata" />
              {/* "#" = not a voice memo */}
              {transcription && transcription !== "#" && <div className="transcript">“{transcription}”</div>}
            </div>
          );
        }
        const pdf = file.mime_type === "application/pdf";
        return (
          <div className="file-card" key={i}>
            <div className="file-icon pdf">{pdf ? "PDF" : "FILE"}</div>
            <div className="file-text">
              <div className="file-name">{file.name}</div>
              <div className="file-meta">{pdf ? "PDF document" : file.mime_type}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function UserMessage({ text, files, transcription }) {
  return (
    <>
      <FileCards files={files} transcription={transcription} />
      {/* only a file was sent: don't show the filler sentence */}
      {!(files.length && text === DEFAULT_TEXT) && (
        <div className="umsg"><ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown></div>
      )}
    </>
  );
}

function BotMark() {
  return <LogoMark size={28} />;
}

function BotMessage({ message, onFeedback }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(message.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="amsg">
      <BotMark />
      <div className="amsg-body">
        <div className="answer"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>
        <div className="actions">
          <button className={"act" + (copied ? " copied" : "")} title="Copy" aria-label="Copy answer" onClick={copy}>
            {copied ? <I.Check size={16} /> : <I.Copy size={16} />}
          </button>
          <button className={"act" + (message.feedback === "like" ? " on" : "")} title="Like" aria-label="Like"
                  aria-pressed={message.feedback === "like"} onClick={() => onFeedback(message, "like")}>
            <I.ThumbUp size={16} />
          </button>
          <button className={"act" + (message.feedback === "dislike" ? " on" : "")} title="Dislike" aria-label="Dislike"
                  aria-pressed={message.feedback === "dislike"} onClick={() => onFeedback(message, "dislike")}>
            <I.ThumbDown size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Typing({ label }) {
  return <div className="typing"><div className="dots"><span /><span /><span /></div><span>{label}</span></div>;
}

function EmptyState({ name, onPick }) {
  const now = new Date();
  const day = now.toLocaleDateString("en-GB", { weekday: "long" });
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return (
    <div className="empty-state">
      <div className="greeting">
        <div className="eyebrow">{day}, {date}</div>
        <h1>
          <span className="w">Oh,</span> <span className="w">you're</span> <span className="w">back,</span>{" "}
          <span className="w name"><Wiggle text={name} /><i className="squiggle" aria-hidden="true" /></span><span className="w">?!</span>
        </h1>
        <p>Go on then. What are we stirring up today?</p>
        <div className="ticker" aria-hidden="true">
          <div className="track">{[...IDEAS, ...IDEAS].map((idea, i) => <span key={i}>{idea}</span>)}</div>
        </div>
      </div>
      <div className="suggestions">
        {EXAMPLES.map(([title, small, prompt]) => (
          <button key={title} className="example" onClick={() => onPick(prompt)}>
            <strong>{title}</strong><span>{small}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatList({ sessions, activeId, onNew, onOpen, onRename, onDelete }) {
  const [search, setSearch] = useState("");
  const typed = search.trim().toLowerCase();
  const shown = typed ? sessions.filter((s) => s.title.toLowerCase().includes(typed)) : sessions;
  let group = null;
  return (
    <>
      <button className="new-chat" onClick={onNew}><I.EditSquare size={17} /> New chat</button>
      {sessions.length > 0 ? (
        <label className="chat-search">
          <I.Search size={15} />
          <input type="search" placeholder="Search chats" aria-label="Search chats" value={search}
                 onChange={(e) => setSearch(e.target.value)} />
        </label>
      ) : <div className="chat-empty">No chats yet. Go on, start something.</div>}
      {typed && shown.length === 0 && <div className="chat-empty">No chats match your search.</div>}
      <nav className="chat-list" aria-label="Your chats">
        {shown.map((session) => {
          const heading = session.group !== group;
          group = session.group;
          return (
            <div key={session.session_id}>
              {heading && <div className="chat-group">{session.group}</div>}
              <div className={"chat-row" + (session.session_id === activeId ? " active" : "")}>
                <button className="chat-open" title={session.title} onClick={() => onOpen(session.session_id)}>
                  {niceTitle(session.title)}
                </button>
                <button className="chat-act" title="Rename" aria-label={`Rename ${session.title}`} onClick={() => onRename(session)}><I.Edit size={15} /></button>
                <button className="chat-act del" title="Delete" aria-label={`Delete ${session.title}`} onClick={() => onDelete(session)}><I.Trash size={15} /></button>
              </div>
            </div>
          );
        })}
      </nav>
    </>
  );
}

function RenameDialog({ session, onClose, onSave }) {
  const [title, setTitle] = useState(session.title);
  return (
    <Dialog title="Rename chat" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(title); }}>
        <Field label="Title" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="btn primary wide">Save</button>
      </form>
    </Dialog>
  );
}

function readOptions() {
  try {
    return JSON.parse(sessionStorage.getItem("chat_options")) || {};
  } catch {
    return {};
  }
}

export default function Chat({ user }) {
  const { sidebarSlot, closeSidebar } = useOutletContext();
  const [sessions, setSessions] = useState([]);
  const [activeId, setActiveId] = useState(() => sessionStorage.getItem("chat_id"));
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState([]);
  const [options, setOptions] = useState(readOptions);
  const [pending, setPending] = useState(null);      // the message being answered right now
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const fileInput = useRef(null);
  const scroller = useRef(null);
  const abort = useRef(null);
  const sendButton = useRef(null);

  const active = sessions.find((s) => s.session_id === activeId);
  usePageTitle(active ? niceTitle(active.title) : "Chat");

  const loadSessions = () => api.get("/sessions").then(setSessions);
  const loadMessages = (id) => api.get(`/sessions/${id}/messages`).then((data) => setMessages(data.messages));

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => {
    if (activeId) sessionStorage.setItem("chat_id", activeId);
    else sessionStorage.removeItem("chat_id");
  }, [activeId]);
  useEffect(() => sessionStorage.setItem("chat_options", JSON.stringify(options)), [options]);

  // open the chat that was open before moving to another page
  useEffect(() => {
    if (activeId) loadMessages(activeId).catch(() => setActiveId(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the newest words in view, unless the reader has scrolled up
  const stick = useRef(true);
  useEffect(() => {
    const box = scroller.current;
    if (box && stick.current && (messages.length || pending)) box.scrollTop = box.scrollHeight;
  }, [messages, pending]);
  useEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = Math.min(box.scrollHeight, 200) + "px";
  }, [draft]);

  useEffect(() => {
    if (!recording) return undefined;
    setRecordSeconds(0);
    const timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  function openChat(id) {
    abort.current?.abort();
    setPending(null);
    setError("");
    setActiveId(id);
    setMessages([]);
    stick.current = true;
    closeSidebar();
    if (id) loadMessages(id).catch(() => setActiveId(null));
  }

  async function deleteChat(session) {
    await api.delete(`/sessions/${session.session_id}`);
    if (session.session_id === activeId) openChat(null);
    loadSessions();
  }

  async function saveTitle(title) {
    if (title.trim()) await api.patch(`/sessions/${renaming.session_id}`, { title });
    setRenaming(null);
    loadSessions();
  }

  async function giveFeedback(message, value) {
    const feedback = message.feedback === value ? null : value;   // a second click takes it back
    setMessages(messages.map((m) => (m.id === message.id ? { ...m, feedback } : m)));
    await api.post(`/messages/${message.id}/feedback`, { feedback });
  }

  function addFiles(list) {
    const next = [...files];
    for (const file of list) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
      } else {
        next.push(file);
      }
    }
    setFiles(next);
  }

  async function toggleRecording() {
    setError("");
    if (recording) {
      const take = recording;
      setRecording(null);
      try {
        addFiles([await take.stop()]);
      } catch {
        setError("The recording could not be read. Please try again.");
      }
      return;
    }
    try {
      setRecording(await startRecording());
    } catch {
      setError("Microphone blocked – allow it in the browser.");
    }
  }

  function fillInput(prompt) {
    setDraft(prompt);          // a card only fills the input, ready to edit or send
    input.current?.focus();
  }

  async function send(event) {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && !files.length) || pending || recording) return;

    const label = options.thinking ? "Thinking really hard…" : options.search ? "Snooping around the web…" : "Cooking something up…";
    const sentFiles = files;
    const body = new FormData();
    body.set("text", text);
    if (activeId) body.set("session_id", activeId);
    for (const name of ["thinking", "streaming", "search"]) body.set(name, options[name] ? "true" : "false");
    sentFiles.forEach((file) => body.append("files", file));

    const previews = sentFiles.map((file) => ({ name: file.name, mime_type: file.type, url: URL.createObjectURL(file) }));
    setError("");
    sparkBurst(sendButton.current);
    setDraft("");
    setFiles([]);
    setPending({ text: text || DEFAULT_TEXT, files: previews, answer: "", label });
    stick.current = true;

    const controller = new AbortController();
    abort.current = controller;
    let chatId = activeId;
    let failed = null;
    try {
      const response = await fetch("/api/chat", { method: "POST", body, signal: controller.signal });
      if (!response.ok) throw await errorFrom(response);

      // the answer arrives as lines of JSON, a few words at a time
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line) continue;
          const part = JSON.parse(line);
          if (part.type === "start") chatId = part.session_id;
          if (part.type === "chunk") setPending((p) => ({ ...p, answer: p.answer + part.text }));
          if (part.type === "status") setPending((p) => ({ ...p, status: part.text }));
          if (part.type === "error") failed = part.message;
        }
      }
      if (failed) throw new Error(failed);
      // show the saved chat in one step, so nothing flickers
      const data = await api.get(`/sessions/${chatId}/messages`);
      setActiveId(chatId);
      setMessages(data.messages);
      setPending(null);
      loadSessions();
    } catch (e) {
      if (e.name === "AbortError") return;
      setPending(null);
      setError(e.message);
      setDraft(text);          // nothing was saved: give the message back
      setFiles(sentFiles);
      if (chatId === activeId && activeId) loadSessions();
    } finally {
      previews.forEach((file) => URL.revokeObjectURL(file.url));
    }
  }

  function onKey(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) send(event);
  }

  const showEmpty = !messages.length && !pending;
  const canSend = (draft.trim() || files.length) && !pending && !recording;

  return (
    <div className="chat-page"
         onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
         onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
         onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}>
      {showEmpty && <Embers />}
      {sidebarSlot && createPortal(
        <ChatList sessions={sessions} activeId={activeId} onNew={() => openChat(null)} onOpen={openChat}
                  onRename={setRenaming} onDelete={deleteChat} />, sidebarSlot)}

      <div className="chat-scroll" ref={scroller}
           onScroll={(e) => {
             const box = e.currentTarget;
             stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
           }}>
        <div className="chat-column">
          {showEmpty && <EmptyState name={user.username} onPick={fillInput} />}
          {messages.length > 0 && <h1 className="sr-only">{active ? active.title : "Chat"}</h1>}
          {messages.map((message) => (message.role === "user"
            ? <UserMessage key={message.id} text={message.text} files={message.files} transcription={message.transcription} />
            : <BotMessage key={message.id} message={message} onFeedback={giveFeedback} />))}
          {pending && (
            <>
              <UserMessage text={pending.text} files={pending.files} />
              <div className="amsg live">
                <BotMark />
                <div className="amsg-body" aria-live="polite">
                  {pending.answer
                    ? <div className="answer"><ReactMarkdown remarkPlugins={[remarkGfm]}>{pending.answer}</ReactMarkdown></div>
                    : <Typing label={pending.label} />}
                  {pending.status && <Typing label={pending.status} />}
                </div>
              </div>
            </>
          )}
          {error && <div className="alert" role="alert">{error}</div>}
        </div>
      </div>

      <div className="composer-wrap">
        <form className={"composer" + (dragging ? " dragging" : "")} onSubmit={send}>
          {files.length > 0 && (
            <div className="chips">
              {files.map((file, i) => (
                <span className="chip" key={i}>
                  <span className="chip-name">{file.name}</span>
                  <button type="button" aria-label={`Remove ${file.name}`}
                          onClick={() => setFiles(files.filter((_, n) => n !== i))}><I.Close size={14} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="composer-row">
            <button type="button" className="round" title="Attach files" aria-label="Attach files"
                    onClick={() => fileInput.current.click()}><I.Plus /></button>
            <input ref={fileInput} type="file" multiple hidden accept={ACCEPT}
                   onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            {recording ? (
              <div className="rec-line" role="status"><i className="rec-dot" /> Recording… {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}</div>
            ) : (
              <textarea ref={input} rows={1} placeholder="Tell me everything…" aria-label="Message Gemini"
                        value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} />
            )}
            <button type="button" className={"round" + (recording ? " rec" : "")}
                    title={recording ? "Stop recording" : "Record a voice memo"}
                    aria-label={recording ? "Stop recording" : "Record a voice memo"}
                    onClick={toggleRecording}>{recording ? <I.Stop /> : <I.Mic />}</button>
            <button ref={sendButton} className="round send" title="Send" aria-label="Send" disabled={!canSend}><I.ArrowUp /></button>
          </div>
          <div className="composer-tools">
            <div className="pills" role="group" aria-label="Options">
              {OPTIONS.map(([key, label, Icon]) => (
                <button key={key} type="button" className={"pill" + (options[key] ? " on" : "")} aria-pressed={!!options[key]}
                        onClick={() => setOptions({ ...options, [key]: !options[key] })}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>
            <button type="button" className="voice-btn" title="Voice mode: talk with the ElevenLabs agent"
                    aria-label="Voice mode" onClick={() => setVoiceOpen(true)}><I.Wave size={18} /></button>
          </div>
        </form>
        <div className="disclaimer">Gemini can make mistakes. Check important info.</div>
      </div>

      {renaming && <RenameDialog session={renaming} onClose={() => setRenaming(null)} onSave={saveTitle} />}
      {voiceOpen && (
        <Dialog title="Voice mode" wide onClose={() => setVoiceOpen(false)}>
          <VoiceOrb height={520} />
          <p className="caption">Closing this window ends the conversation. Voice chats are not saved.</p>
        </Dialog>
      )}
    </div>
  );
}
