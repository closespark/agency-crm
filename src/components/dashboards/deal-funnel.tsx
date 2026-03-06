"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface DealStage {
  stage: string;
  count: number;
  amount: number;
}

interface DealFunnelProps {
  data: DealStage[];
}

export function DealFunnel({ data }: DealFunnelProps) {
  // Filter to active stages for funnel (exclude closed)
  const funnelData = data.filter(
    (d) => d.stage !== "Closed Won" && d.stage !== "Closed Lost"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deal Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={funnelData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis type="number" stroke="#71717a" fontSize={12} />
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
              <Bar
                dataKey="count"
                fill="#6366f1"
                radius={[0, 4, 4, 0]}
                barSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
