"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface ActivityWeek {
  week: string;
  email: number;
  call: number;
  meeting: number;
  note: number;
  task: number;
}

interface ActivityChartProps {
  data: ActivityWeek[];
}

const ACTIVITY_COLORS: Record<string, string> = {
  email: "#6366f1",
  call: "#3b82f6",
  meeting: "#8b5cf6",
  note: "#a78bfa",
  task: "#c4b5fd",
};

export function ActivityChart({ data }: ActivityChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activities by Week</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="week" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} />
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
              <Bar dataKey="email" stackId="a" fill={ACTIVITY_COLORS.email} name="Email" />
              <Bar dataKey="call" stackId="a" fill={ACTIVITY_COLORS.call} name="Call" />
              <Bar dataKey="meeting" stackId="a" fill={ACTIVITY_COLORS.meeting} name="Meeting" />
              <Bar dataKey="note" stackId="a" fill={ACTIVITY_COLORS.note} name="Note" />
              <Bar dataKey="task" stackId="a" fill={ACTIVITY_COLORS.task} name="Task" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
