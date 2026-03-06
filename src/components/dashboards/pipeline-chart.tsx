"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface DealStage {
  stage: string;
  count: number;
  amount: number;
}

interface PipelineChartProps {
  data: DealStage[];
}

const STAGE_COLORS: Record<string, string> = {
  Lead: "#818cf8",
  Qualified: "#6366f1",
  Meeting: "#4f46e5",
  Proposal: "#4338ca",
  Negotiation: "#3730a3",
  "Closed Won": "#22c55e",
  "Closed Lost": "#ef4444",
};

export function PipelineChart({ data }: PipelineChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline by Stage (Amount)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis
                type="number"
                stroke="#71717a"
                fontSize={12}
                tickFormatter={(value: number) =>
                  value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`
                }
              />
              <YAxis
                dataKey="stage"
                type="category"
                stroke="#71717a"
                fontSize={12}
                width={75}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: "8px",
                  fontSize: "13px",
                }}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={28}>
                {data.map((entry) => (
                  <Cell
                    key={entry.stage}
                    fill={STAGE_COLORS[entry.stage] || "#6366f1"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
