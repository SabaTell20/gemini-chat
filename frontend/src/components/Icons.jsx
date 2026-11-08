// Icons.jsx - small line icons, drawn here so no icon font has to be downloaded.

function Icon({ size = 18, children }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const icon = (paths) => (props) => <Icon {...props}>{paths}</Icon>;

export const Plus = icon(<path d="M12 5v14M5 12h14" />);
export const Close = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const Check = icon(<path d="M5 12.5l4.5 4.5L19 7" />);
export const Copy = icon(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></>);
export const Mic = icon(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>);
export const Stop = icon(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />);
export const ArrowUp = icon(<path d="M12 19V5M6 11l6-6 6 6" />);
export const ArrowLeft = icon(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const Edit = icon(<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />);
export const EditSquare = icon(<><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M9 15v-3l9-9 3 3-9 9H9z" /></>);
export const Trash = icon(<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />);
export const Search = icon(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>);
export const More = icon(<path d="M6 12h.01M12 12h.01M18 12h.01" strokeWidth="3" />);
export const Menu = icon(<path d="M4 7h16M4 12h16M4 17h16" />);
export const Wave = icon(<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />);
export const ThumbUp = icon(<path d="M7 11v9H4v-9h3zM7 11l4-8a3 3 0 0 1 3 3v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7" />);
export const ThumbDown = icon(<path d="M17 13V4h3v9h-3zM17 13l-4 8a3 3 0 0 1-3-3v-4H5a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 6.2 4H17" />);
export const Brain = icon(<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 5 3 3 0 0 0 3 4 2 2 0 0 0 4-1V5a2 2 0 0 0-3-2zM15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-1 5 3 3 0 0 1-3 4 2 2 0 0 1-4-1" />);
export const Bolt = icon(<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />);
export const Globe = icon(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>);
export const Chat = icon(<path d="M4 5h16v12H9l-5 4V5z" />);
export const Card = icon(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>);
export const Users = icon(<><circle cx="9" cy="8" r="4" /><path d="M2 20c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M18 14c2.500.7 4 2.800 4 6" /></>);
export const Policy = icon(<><path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>);
export const Logout = icon(<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />);
export const Key = icon(<><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>);
export const Shield = icon(<path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6l8-3z" />);
export const PersonAdd = icon(<><circle cx="10" cy="8" r="4" /><path d="M3 20c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6" /></>);
