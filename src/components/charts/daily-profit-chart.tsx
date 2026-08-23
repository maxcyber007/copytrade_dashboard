"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PROFIT = "#16a34a";
const LOSS = "#dc2626";

export function DailyProfitChart({ data }: { data: { date: string; profit: number }[] }) {
  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No daily results yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--panel-border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            cursor={{ fill: "var(--gold-glow)" }}
            contentStyle={{
              background: "var(--panel)",
              border: "1px solid var(--panel-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, "Profit"]}
          />
          <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.date} fill={entry.profit >= 0 ? PROFIT : LOSS} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
