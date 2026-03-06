"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface TicketStatus {
  status: string;
  count: number;
}

interface TicketChartProps {
  data: TicketStatus[];
}

const STATUS_COLORS: Record<string, string> = {
  Open: "#6366f1",
  Pending: "#8b5cf6",
  "In Progress": "#3b82f6",
  Resolved: "#22c55e",
  Closed: "#94a3b8",
};

export function TicketChart({ data }: TicketChartProps) {
  const filtered = data.filter((d) => d.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tickets by Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          {filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-400">
              No ticket data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={filtered}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="count"
                  nameKey="status"
                >
                  {filtered.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_COLORS[entry.status] || "#6366f1"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e4e4e7",
                    borderRadius: "8px",
                    fontSize: "13px",
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: "12px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
