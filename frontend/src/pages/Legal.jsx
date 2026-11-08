// Legal.jsx - the Privacy Policy, Terms of Use and Cookie Policy. They open without
// logging in. The texts are in src/legal/*.md; your details are in SITE below.

import ReactMarkdown from "react-markdown";
import { Link } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { PageHeader, SiteFooter, usePageTitle } from "../components/Common.jsx";
import { ArrowLeft } from "../components/Icons.jsx";
import cookies from "../legal/cookies.md?raw";
import privacy from "../legal/privacy.md?raw";
import terms from "../legal/terms.md?raw";

const SITE = {
  name: "Gemini Chat (demo project)",
  contact: "the administrator who created your account",
  updated: "4 November 2026",
};
const PAGES = {
  privacy: ["Privacy Policy", privacy],
  terms: ["Terms of Use", terms],
  cookies: ["Cookie Policy", cookies],
};

export default function Legal({ name, loggedIn }) {
  const [title, source] = PAGES[name];
  usePageTitle(title);
  let text = source;
  for (const [key, value] of Object.entries(SITE)) text = text.replaceAll(`{${key}}`, value);
  return (
    <div className="page legal">
      <Link className="back-link" to="/"><ArrowLeft size={16} /> {loggedIn ? "Back to chat" : "Back to sign in"}</Link>
      <PageHeader title={title} eyebrow="Legal" />
      <div className="legal-text">
        <ReactMarkdown remarkPlugins={[remarkGfm]}
                       components={{ a: ({ href, children }) => (href.startsWith("/") ? <Link to={href}>{children}</Link> : <a href={href}>{children}</a>) }}>
          {text}
        </ReactMarkdown>
      </div>
      <SiteFooter />
    </div>
  );
}
