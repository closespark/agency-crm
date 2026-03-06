"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Spinner } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  teamId: string | null;
  image: string | null;
  createdAt: string;
  team: { id: string; name: string } | null;
}

interface Team {
  id: string;
  name: string;
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, teamsRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/teams"),
      ]);
      if (!usersRes.ok) throw new Error("Failed to fetch users");
      const usersData = await usersRes.json();
      setUsers(usersData.users);

      if (teamsRes.ok) {
        const teamsData = await teamsRes.json();
        setTeams(teamsData);
      }
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleRoleChange(userId: string, role: string) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update role");
      }
      setSuccess("User role updated");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleTeamChange(userId: string, teamId: string) {
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: teamId || null }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update team");
      }
      setSuccess("User team updated");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update team");
    }
  }

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin": return "danger" as const;
      case "manager": return "warning" as const;
      default: return "secondary" as const;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{users.length} user(s) total</p>
        <Button variant="outline" onClick={() => setShowInvite(!showInvite)}>
          Invite User
        </Button>
      </div>

      {showInvite && (
        <Card>
          <CardHeader>
            <CardTitle>Invite User</CardTitle>
            <CardDescription>
              Share the registration link with new users to invite them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded border border-zinc-200 bg-zinc-50 p-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                {typeof window !== "undefined"
                  ? `${window.location.origin}/register`
                  : "/register"}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/register`
                  );
                  setSuccess("Link copied to clipboard");
                }}
              >
                Copy
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {user.name || "Unnamed"}
                    </p>
                    <p className="text-xs text-zinc-500">{user.email}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariant(user.role)}>{user.role}</Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {user.team?.name || "No team"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-zinc-500">
                    {formatDate(user.createdAt)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Select
                      options={[
                        { value: "member", label: "Member" },
                        { value: "manager", label: "Manager" },
                        { value: "admin", label: "Admin" },
                      ]}
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      className="w-28"
                    />
                    <Select
                      options={teams.map((t) => ({ value: t.id, label: t.name }))}
                      placeholder="No team"
                      value={user.teamId || ""}
                      onChange={(e) => handleTeamChange(user.id, e.target.value)}
                      className="w-36"
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
