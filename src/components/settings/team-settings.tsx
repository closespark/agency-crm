"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/loading";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  image: string | null;
}

interface Team {
  id: string;
  name: string;
  createdAt: string;
  users: TeamMember[];
  _count: { users: number };
}

interface TeamFormData {
  name: string;
}

interface TeamSettingsProps {
  userTeamId: string | null;
  isAdmin: boolean;
}

export function TeamSettings({ userTeamId, isAdmin }: TeamSettingsProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TeamFormData>({ defaultValues: { name: "" } });

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/teams");
      if (!res.ok) throw new Error("Failed to fetch teams");
      const data = await res.json();
      setTeams(data);
    } catch {
      setError("Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  function startEdit(team: Team) {
    setEditingTeam(team);
    setValue("name", team.name);
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingTeam(null);
    reset({ name: "" });
  }

  async function onSubmit(data: TeamFormData) {
    setError(null);
    setSuccess(null);
    try {
      if (editingTeam) {
        const res = await fetch(`/api/teams/${editingTeam.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to update team");
        }
        setSuccess("Team updated successfully");
      } else {
        const res = await fetch("/api/teams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to create team");
        }
        setSuccess("Team created successfully");
      }
      cancelEdit();
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }

  async function handleDelete(teamId: string) {
    if (!confirm("Are you sure you want to delete this team? Members will be unassigned.")) return;
    setError(null);
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to delete team");
      }
      setSuccess("Team deleted");
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete team");
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

  const myTeam = teams.find((t) => t.id === userTeamId);

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>{editingTeam ? "Edit Team" : "Create Team"}</CardTitle>
            <CardDescription>
              {editingTeam ? "Update the team name." : "Create a new team for your organization."}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <Input
                id="teamName"
                label="Team Name"
                {...register("name", { required: "Team name is required" })}
                error={errors.name?.message}
              />
            </CardContent>
            <CardFooter className="gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingTeam ? "Update Team" : "Create Team"}
              </Button>
              {editingTeam && (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </CardFooter>
          </form>
        </Card>
      )}

      {myTeam && !isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>My Team: {myTeam.name}</CardTitle>
            <CardDescription>{myTeam._count.users} member(s)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {myTeam.users.map((member) => (
                <div key={member.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {member.name || "Unnamed"}
                    </p>
                    <p className="text-xs text-zinc-500">{member.email}</p>
                  </div>
                  <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">All Teams</h3>
          {teams.length === 0 ? (
            <p className="text-sm text-zinc-500">No teams created yet.</p>
          ) : (
            teams.map((team) => (
              <Card key={team.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{team.name}</CardTitle>
                      <CardDescription>{team._count.users} member(s)</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => startEdit(team)}>
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(team.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {team.users.length > 0 && (
                  <CardContent>
                    <div className="space-y-2">
                      {team.users.map((member) => (
                        <div key={member.id} className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {member.name || "Unnamed"}
                            </p>
                            <p className="text-xs text-zinc-500">{member.email}</p>
                          </div>
                          <Badge variant={roleBadgeVariant(member.role)}>{member.role}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
