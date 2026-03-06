"use client";

import { Bell, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownItem } from "@/components/ui/dropdown";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface HeaderProps {
  user?: {
    name?: string | null;
    email: string;
    image?: string | null;
  };
}

export function Header({ user }: HeaderProps) {
  const router = useRouter();

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <div />

      <div className="flex items-center gap-3">
        <Dropdown
          trigger={
            <Button variant="default" size="sm">
              <Plus size={16} />
              Create
            </Button>
          }
        >
          <DropdownItem onClick={() => router.push("/contacts/new")}>
            Contact
          </DropdownItem>
          <DropdownItem onClick={() => router.push("/companies/new")}>
            Company
          </DropdownItem>
          <DropdownItem onClick={() => router.push("/deals/new")}>
            Deal
          </DropdownItem>
          <DropdownItem onClick={() => router.push("/tickets/new")}>
            Ticket
          </DropdownItem>
          <DropdownItem onClick={() => router.push("/tasks/new")}>
            Task
          </DropdownItem>
        </Dropdown>

        <Link
          href="/notifications"
          className="relative rounded-md p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Notifications"
        >
          <Bell size={18} />
        </Link>

        <Dropdown
          trigger={
            <button className="flex items-center gap-2" aria-label="User menu">
              <Avatar
                src={user?.image}
                name={user?.name || user?.email}
                size="sm"
              />
            </button>
          }
          align="right"
        >
          <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <p className="text-sm font-medium">{user?.name || "User"}</p>
            <p className="text-xs text-zinc-500">{user?.email}</p>
          </div>
          <DropdownItem onClick={() => router.push("/settings")}>
            Settings
          </DropdownItem>
          <DropdownItem onClick={() => router.push("/api/auth/signout")}>
            Sign out
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}
