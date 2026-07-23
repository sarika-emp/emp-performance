import { useState, useEffect } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  RefreshCw,
  Target,
  Award,
  AlertTriangle,
  Route,
  Users,
  MessageSquare,
  BarChart3,
  Grid3X3,
  Shield,
  Settings,
  LogOut,
  Menu,
  X,
  TrendingUp,
  GitBranch,
  FileText,
  Radar,
  Heart,
  UserPlus,
  ShieldCheck,
  Gauge,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { isLoggedIn, getUser, useAuthStore } from "@/lib/auth-store";
import { cn, getInitials } from "@/lib/utils";
import { BackToDashboard } from "@/components/BackToDashboard";
import { NotificationBell } from "@/components/NotificationBell";
import { ThemeToggle } from "@/components/ThemeToggle";

type Role = "org_admin" | "hr_admin" | "hr_manager" | "employee";

interface NavItem {
  to: string;
  label: string;
  icon: any;
  adminOnly?: boolean; // if true, hidden from employee role
}

interface NavSection {
  title?: string; // uppercase section header; omitted for the top (Dashboard) group
  items: NavItem[];
}

// Grouped sidebar. "My Work" is visible to everyone; the Manage / Insights /
// Admin sections are admin-only and hidden (header included) for the employee
// role. A section renders only if at least one of its items is visible.
const NAV_SECTIONS: NavSection[] = [
  {
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "My Work",
    items: [
      { to: "/my", label: "My Performance", icon: TrendingUp },
      { to: "/my/reviews", label: "My Reviews", icon: RefreshCw },
      { to: "/my/goals", label: "My Goals", icon: Target },
      { to: "/my/feedback", label: "My Feedback", icon: MessageSquare },
      { to: "/my/one-on-ones", label: "My 1-on-1s", icon: Users },
      { to: "/my/skills", label: "My Skills", icon: Radar },
      { to: "/my/letters", label: "My Letters", icon: FileText },
      { to: "/feedback/wall", label: "Kudos Wall", icon: Heart },
      { to: "/peer-reviews/nominate", label: "Nominate Peers", icon: UserPlus },
    ],
  },
  {
    title: "Manage",
    items: [
      { to: "/review-cycles", label: "Review Cycles", icon: RefreshCw, adminOnly: true },
      { to: "/goals", label: "All Goals", icon: Target, adminOnly: true },
      { to: "/goals/alignment", label: "Goal Alignment", icon: GitBranch, adminOnly: true },
      { to: "/competencies", label: "Competencies", icon: Award, adminOnly: true },
      { to: "/pips", label: "PIPs", icon: AlertTriangle, adminOnly: true },
      { to: "/career-paths", label: "Career Paths", icon: Route, adminOnly: true },
      { to: "/one-on-ones", label: "All 1-on-1s", icon: Users, adminOnly: true },
      { to: "/feedback", label: "All Feedback", icon: MessageSquare, adminOnly: true },
      { to: "/peer-reviews/queue", label: "Peer Approvals", icon: ShieldCheck, adminOnly: true },
      { to: "/letters", label: "Letters", icon: FileText, adminOnly: true },
    ],
  },
  {
    title: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
      { to: "/analytics/nine-box", label: "9-Box Grid", icon: Grid3X3, adminOnly: true },
      { to: "/analytics/skills-gap", label: "Skills Gap", icon: Radar, adminOnly: true },
      { to: "/manager-effectiveness", label: "Manager Effectiveness", icon: Gauge, adminOnly: true },
      { to: "/succession", label: "Succession", icon: Shield, adminOnly: true },
    ],
  },
  {
    title: "Admin",
    items: [{ to: "/settings", label: "Settings", icon: Settings, adminOnly: true }],
  },
];

const ADMIN_ROLES: Role[] = ["org_admin", "hr_admin", "hr_manager"];

// Routes that need exact-match highlighting (index routes whose path is a
// prefix of deeper routes).
const EXACT_MATCH = new Set(["/my", "/goals", "/feedback", "/letters", "/analytics"]);

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);

  if (!isLoggedIn()) return <Navigate to="/login" replace />;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }

  const user = getUser();
  const displayName = user ? `${user.firstName} ${user.lastName}` : "User";
  const roleLabel =
    user?.role === "org_admin"
      ? "Org Admin"
      : user?.role === "hr_admin"
        ? "HR Admin"
        : user?.role === "hr_manager"
          ? "HR Manager"
          : "Employee";

  function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
    return (
      <div
        className={cn(
          "flex h-full flex-col bg-white border-r border-gray-200 transition-[width] duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex h-16 items-center gap-3 border-b border-gray-100",
            collapsed ? "justify-center px-2" : "px-6"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600">
            <TrendingUp className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-gray-900 truncate">EMP Performance</span>
          )}
        </div>

        {/* Nav — grouped into sections; headers collapse to dividers on the
            icon-only rail */}
        <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
          {NAV_SECTIONS.map((section, si) => {
            const isAdmin = ADMIN_ROLES.includes((user?.role || "employee") as Role);
            const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.title ?? `section-${si}`} className={si > 0 ? (collapsed ? "mt-3" : "mt-5") : ""}>
                {section.title &&
                  (collapsed ? (
                    si > 0 && <div className="mx-2 mb-2 border-t border-gray-100" />
                  ) : (
                    <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {section.title}
                    </p>
                  ))}
                <div className="space-y-1">
                  {visibleItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={EXACT_MATCH.has(item.to)}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center rounded-lg text-sm font-medium transition-colors",
                          collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
                          isActive
                            ? "bg-brand-50 text-brand-700"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                        )
                      }
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User card */}
        <div className={cn("border-t border-gray-200", collapsed ? "p-2" : "p-4")}>
          {collapsed ? (
            <button
              onClick={logout}
              title={`${displayName} — Sign out`}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold hover:bg-brand-200"
            >
              {getInitials(displayName)}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
                {getInitials(displayName)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                <p className="text-xs text-gray-500">{roleLabel}</p>
              </div>
              <button
                onClick={logout}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop sidebar */}
      <div className="relative hidden lg:block">
        <SidebarContent collapsed={collapsed} />
        {/* Collapse / expand toggle, centred on the sidebar edge (EmpCloud style) */}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute top-1/2 -right-3 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-700"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Mobile sidebar overlay (always full width) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed left-0 top-0 z-50 h-full">
            <SidebarContent />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <BackToDashboard />
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <NotificationBell />
            <NavLink
              to="/profile"
              className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-gray-50"
              title="My profile"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                {getInitials(displayName)}
              </div>
              <span className="hidden md:block text-sm font-medium text-gray-700">{displayName}</span>
            </NavLink>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
