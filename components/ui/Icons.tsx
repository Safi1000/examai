/** Lightweight inline icon set. All stroke `currentColor`; decorative by default. */
type P = React.SVGProps<SVGSVGElement>;

function Base({ children, ...p }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Menu: (p: P) => <Base {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Base>,
  Close: (p: P) => <Base {...p}><path d="M6 6l12 12M18 6 6 18" /></Base>,
  Plus: (p: P) => <Base {...p}><path d="M12 5v14M5 12h14" /></Base>,
  Search: (p: P) => <Base {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Base>,
  Check: (p: P) => <Base {...p}><path d="m5 12 5 5 9-10" /></Base>,
  Clock: (p: P) => <Base {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Base>,
  Lock: (p: P) => <Base {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Base>,
  ChevronRight: (p: P) => <Base {...p}><path d="m9 6 6 6-6 6" /></Base>,
  ChevronLeft: (p: P) => <Base {...p}><path d="m15 6-6 6 6 6" /></Base>,
  ArrowLeft: (p: P) => <Base {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Base>,
  Logout: (p: P) => <Base {...p}><path d="M16 17l5-5-5-5M21 12H9M9 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h3" /></Base>,
  Camera: (p: P) => <Base {...p}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.5" /></Base>,
  Trash: (p: P) => <Base {...p}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></Base>,
  Edit: (p: P) => <Base {...p}><path d="M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4" /></Base>,
  Grip: (p: P) => <Base {...p}><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></Base>,
  Dashboard: (p: P) => <Base {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Base>,
  Doc: (p: P) => <Base {...p}><path d="M7 3h7l5 5v13a0 0 0 0 1 0 0H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v5h5" /></Base>,
  Bank: (p: P) => <Base {...p}><path d="M4 9h16M4 9l8-5 8 5M6 9v9M10 9v9M14 9v9M18 9v9M4 18h16" /></Base>,
  Users: (p: P) => <Base {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-3.5-5.5" /></Base>,
  Megaphone: (p: P) => <Base {...p}><path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1ZM18 9a3 3 0 0 1 0 6" /></Base>,
  Chart: (p: P) => <Base {...p}><path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6" /></Base>,
  Download: (p: P) => <Base {...p}><path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" /></Base>,
  Layers: (p: P) => <Base {...p}><path d="m12 4 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 16l8 4 8-4" /></Base>,
  Inbox: (p: P) => <Base {...p}><path d="M4 13h4l1 3h6l1-3h4M4 13l2-8h12l2 8v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5Z" /></Base>,
  Flag: (p: P) => <Base {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Base>,
  Warn: (p: P) => <Base {...p}><path d="M12 4 2.5 20h19L12 4ZM12 10v4M12 17.5v.5" /></Base>,
  Refresh: (p: P) => <Base {...p}><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M18 4v4h-4M6 20v-4h4" /></Base>,
  Palette: (p: P) => (
    <Base {...p}>
      <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.2 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.4-4-7.8-9-7.8Z" />
      <circle cx="7.5" cy="11.5" r="1" /><circle cx="12" cy="8.5" r="1" /><circle cx="16" cy="11" r="1" />
    </Base>
  ),
};
