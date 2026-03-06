"use client";

import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CommandPalette } from "@/components/search/command-palette";

interface AppShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email: string;
    image?: string | null;
  };
}

export function AppShell({ children, user }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6 dark:bg-zinc-900">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
