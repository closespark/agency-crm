"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Building2,
  Handshake,
  KanbanSquare,
  Ticket,
  Mail,
  Megaphone,
  FileText,
  Settings,
  Search,
  Plug,
  BookOpen,
  BarChart3,
  CheckSquare,
  Brain,
  PenLine,
  Crosshair,
  ListOrdered,
  Workflow,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Core",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "AI Autopilot", href: "/ai", icon: Brain },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Contacts", href: "/contacts", icon: Users },
      { label: "Companies", href: "/companies", icon: Building2 },
      { label: "Deals", href: "/deals", icon: Handshake },
      { label: "Pipeline", href: "/pipeline", icon: KanbanSquare },
      { label: "Tasks", href: "/tasks", icon: CheckSquare },
    ],
  },
  {
    label: "Outreach",
    items: [
      { label: "Prospecting", href: "/prospecting", icon: Crosshair },
      { label: "Sequences", href: "/sequences", icon: ListOrdered },
      { label: "Workflows", href: "/workflows", icon: Workflow },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Tickets", href: "/tickets", icon: Ticket },
      { label: "Conversations", href: "/conversations", icon: Mail },
    ],
  },
  {
    label: "Growth",
    items: [
      { label: "Content Engine", href: "/content", icon: PenLine },
      { label: "Marketing", href: "/marketing", icon: Megaphone },
      { label: "CMS", href: "/cms", icon: FileText },
      { label: "Knowledge Base", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3 },
      { label: "Integrations", href: "/integrations", icon: Plug },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-zinc-200 bg-white transition-all dark:border-zinc-800 dark:bg-zinc-950",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-zinc-200 px-4 dark:border-zinc-800">
        {!collapsed && (
          <Link href="/dashboard" className="text-lg font-bold text-blue-600">
            AgencyCRM
          </Link>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pt-3">
          <Link
            href="/search"
            className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-400 hover:border-zinc-300 dark:border-zinc-700"
          >
            <Search size={14} />
            Search...
            <span className="ml-auto text-xs text-zinc-300 dark:text-zinc-600">
              ⌘K
            </span>
          </Link>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Main navigation">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon size={16} />
                      {!collapsed && item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
