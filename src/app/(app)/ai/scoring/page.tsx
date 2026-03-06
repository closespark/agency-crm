"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageLoader } from "@/components/ui/loading";
import { ScoringRuleEditor } from "@/components/workflows/scoring-rule-editor";

interface ScoringRule {
  id: string;
  name: string;
  category: string;
  condition: string;
  points: number;
  isActive: boolean;
  isAIManaged: boolean;
  createdAt: string;
}

function parseCondition(raw: string): { field: string; operator: string; value: string } {
  try {
    return JSON.parse(raw);
  } catch {
    return { field: "", operator: "", value: "" };
  }
}

const CATEGORY_COLORS: Record<string, "default" | "success" | "warning" | "danger"> = {
  demographic: "default",
  behavioral: "success",
  engagement: "warning",
  firmographic: "danger",
};

export default function AIScoringPage() {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ScoringRule | undefined>();
  const [optimizing, setOptimizing] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/ai/scoring/rules");
    const json = await res.json();
    setRules(json.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const handleCreate = () => {
    setEditingRule(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (rule: ScoringRule) => {
    setEditingRule({
      ...rule,
      condition: rule.condition, // raw string, editor will parse
    });
    setEditorOpen(true);
  };

  const handleSave = async (ruleData: {
    name: string;
    category: string;
    condition: { field: string; operator: string; value: string };
    points: number;
    isActive: boolean;
    isAIManaged: boolean;
  }) => {
    const body = {
      name: ruleData.name,
      category: ruleData.category,
      condition: JSON.stringify(ruleData.condition),
      points: ruleData.points,
      isActive: ruleData.isActive,
      isAIManaged: ruleData.isAIManaged,
    };

    if (editingRule) {
      await fetch(`/api/ai/scoring/rules/${editingRule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/ai/scoring/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    fetchRules();
  };

  const handleToggle = async (id: string) => {
    await fetch(`/api/ai/scoring/rules/${id}`, { method: "PATCH" });
    fetchRules();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this scoring rule?")) return;
    await fetch(`/api/ai/scoring/rules/${id}`, { method: "DELETE" });
    fetchRules();
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const res = await fetch("/api/ai/scoring/optimize", { method: "POST" });
      const json = await res.json();
      if (json.data?.suggestions) {
        alert(
          `AI optimization complete. ${json.data.suggestions.length} suggestion(s) applied.`
        );
        fetchRules();
      }
    } catch {
      alert("Optimization failed.");
    }
    setOptimizing(false);
  };

  // Group rules by category
  const grouped = rules.reduce<Record<string, ScoringRule[]>>((acc, rule) => {
    const cat = rule.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(rule);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="AI Lead Scoring Rules"
        description="Configure scoring rules to automatically rank and prioritize your leads."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleOptimize} disabled={optimizing}>
              {optimizing ? "Optimizing..." : "Let AI Optimize"}
            </Button>
            <Button onClick={handleCreate}>Create Rule</Button>
          </div>
        }
      />

      {loading ? (
        <PageLoader />
      ) : rules.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-zinc-500">No scoring rules configured.</p>
            <Button className="mt-4" onClick={handleCreate}>
              Create Your First Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{rules.length}</div>
                <div className="text-sm text-zinc-500">Total Rules</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {rules.filter((r) => r.isActive).length}
                </div>
                <div className="text-sm text-zinc-500">Active Rules</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {rules.filter((r) => r.isAIManaged).length}
                </div>
                <div className="text-sm text-zinc-500">AI-Managed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">
                  {rules.reduce((sum, r) => sum + Math.abs(r.points), 0)}
                </div>
                <div className="text-sm text-zinc-500">Total Points Pool</div>
              </CardContent>
            </Card>
          </div>

          {/* Rules by category */}
          {Object.entries(grouped).map(([category, categoryRules]) => (
            <div key={category}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                {category}
              </h3>
              <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                        Rule Name
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-zinc-600 dark:text-zinc-300">
                        Condition
                      </th>
                      <th className="px-4 py-3 text-center font-medium text-zinc-600 dark:text-zinc-300">
                        Points
                      </th>
                      <th className="px-4 py-3 text-center font-medium text-zinc-600 dark:text-zinc-300">
                        Status
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-zinc-600 dark:text-zinc-300">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                    {categoryRules.map((rule) => {
                      const cond = parseCondition(rule.condition);
                      return (
                        <tr
                          key={rule.id}
                          className="bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{rule.name}</span>
                              {rule.isAIManaged && (
                                <Badge variant="default">AI</Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-500">
                            {cond.field} {cond.operator} {cond.value}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`font-semibold ${
                                rule.points > 0 ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {rule.points > 0 ? "+" : ""}
                              {rule.points}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={rule.isActive ? "success" : "secondary"}
                            >
                              {rule.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggle(rule.id)}
                              >
                                {rule.isActive ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(rule)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(rule.id)}
                              >
                                Delete
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <ScoringRuleEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        initialRule={
          editingRule
            ? {
                ...editingRule,
                condition: parseCondition(editingRule.condition),
              }
            : undefined
        }
      />
    </div>
  );
}
