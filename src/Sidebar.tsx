import { type ReactNode } from "react";
import type { RouteMode } from "./types";

type SidebarProps = {
  darkMode: boolean;
  onDarkModeChange: (v: boolean) => void;
  currentRoute: RouteMode;
  canSwitchModes: boolean;
  onNavigate: (route: RouteMode) => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
};

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </svg>
  );
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.59 3H10.5a2 2 0 1 1 4 0h-.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2m-4.93-7.07-1.41 1.41M6.34 17.66l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

type NavItemProps = {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  darkMode: boolean;
};

function NavItem({ icon, label, onClick, active, disabled, darkMode }: NavItemProps) {
  const mutedText = darkMode ? "text-slate-500" : "text-slate-300";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
        active
          ? "border-l-[3px] border-[#008282] bg-[#008282]/10 pl-[9px] text-[#008282]"
          : disabled
            ? `cursor-not-allowed ${mutedText}`
            : darkMode
              ? "text-slate-300 hover:bg-slate-800"
              : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function Sidebar({
  darkMode,
  onDarkModeChange,
  currentRoute,
  canSwitchModes,
  onNavigate,
  onOpenDashboard,
  onOpenSettings,
}: SidebarProps) {
  const isSession = currentRoute === "ps" || currentRoute === "sans-ps";
  const bg = darkMode
    ? "bg-slate-900 border-slate-700/60"
    : "bg-white border-slate-200";
  const borderColor = darkMode ? "border-slate-700/60" : "border-slate-200";

  return (
    <div
      className={`flex h-screen w-60 shrink-0 flex-col border-r ${bg}`}
      style={{ position: "sticky", top: 0 }}
    >
      {/* Logo */}
      <div className="px-4 py-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg"
            style={{ background: "linear-gradient(135deg, #008282 0%, #004f4f 100%)" }}
          >
            <ActivityIcon className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className={`text-lg font-bold tracking-tight ${darkMode ? "text-slate-100" : "text-[#181c20]"}`}>
              Ecos-AI
            </div>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.15em] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              Ethereal Curator
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3">
        <NavItem
          darkMode={darkMode}
          icon={<HomeIcon className="h-4 w-4 shrink-0" />}
          label="Accueil"
          onClick={() => onNavigate("home")}
          disabled={!canSwitchModes}
        />
        <NavItem
          darkMode={darkMode}
          icon={<ActivityIcon className="h-4 w-4 shrink-0" />}
          label="Tableau de bord"
          onClick={onOpenDashboard}
        />
        <NavItem
          darkMode={darkMode}
          icon={<ZapIcon className="h-4 w-4 shrink-0" />}
          label="Analytique"
          active={isSession}
        />
        <NavItem
          darkMode={darkMode}
          icon={<BookIcon className="h-4 w-4 shrink-0" />}
          label="Bibliothèque"
          onClick={() => onNavigate("library")}
          disabled={!canSwitchModes}
        />
        <NavItem
          darkMode={darkMode}
          icon={<SettingsIcon className="h-4 w-4 shrink-0" />}
          label="Paramètres"
          onClick={onOpenSettings}
        />
      </nav>

      {/* Bottom */}
      <div className={`border-t px-3 py-4 ${borderColor}`}>
        <button
          type="button"
          onClick={() => onDarkModeChange(!darkMode)}
          className={`mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
            darkMode ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          {darkMode ? (
            <SunIcon className="h-4 w-4 shrink-0 text-amber-400" />
          ) : (
            <MoonIcon className="h-4 w-4 shrink-0" />
          )}
          {darkMode ? "Mode clair" : "Mode sombre"}
        </button>
        <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#b3e3e3] text-[#004f4f]">
            <UserIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className={`truncate text-xs font-semibold ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
              Dr. Clinician Profile
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
