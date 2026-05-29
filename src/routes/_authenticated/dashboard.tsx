import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ArrowUpRight, Database, FileSpreadsheet, TrendingUp, Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listDatasets, getDatasetRecords } from "@/lib/analytics.functions";
import {
  filterByDateRange, formatNumber, groupSum, profileColumns, sum, timeSeries, uniqueCount,
  type RecordRow,
} from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Pulse" }] }),
  component: DashboardPage,
});

const CHART_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

function DashboardPage() {
  const listFn = useServerFn(listDatasets);
  const { data: datasets } = useQuery({ queryKey: ["datasets"], queryFn: () => listFn() });

  const [selectedId, setSelectedId] = useState<string | undefined>();
  const activeId = selectedId ?? datasets?.[0]?.id;

  const recordsFn = useServerFn(getDatasetRecords);
  const { data: detail, isLoading } = useQuery({
    queryKey: ["dataset-records", activeId],
    queryFn: () => recordsFn({ data: { datasetId: activeId!, limit: 5000 } }),
    enabled: !!activeId,
  });

  const rows = (detail?.records ?? []).map((r) => r.data as RecordRow);
  const cols = useMemo(() => profileColumns(rows), [rows]);

  const numericCols = Object.entries(cols).filter(([, k]) => k === "number").map(([n]) => n);
  const categoryCols = Object.entries(cols).filter(([, k]) => k === "string").map(([n]) => n);
  const dateCols = Object.entries(cols).filter(([, k]) => k === "date").map(([n]) => n);

  const [valueKey, setValueKey] = useState<string>();
  const [groupKey, setGroupKey] = useState<string>();
  const [dateKey, setDateKey] = useState<string>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const vKey = valueKey ?? numericCols[0];
  const gKey = groupKey ?? categoryCols[0];
  const dKey = dateKey ?? dateCols[0];

  const filtered = useMemo(
    () => filterByDateRange(rows, dKey ?? null, from ? new Date(from) : undefined, to ? new Date(to) : undefined),
    [rows, dKey, from, to],
  );

  const total = vKey ? sum(filtered, vKey) : 0;
  const distinctCats = gKey ? uniqueCount(filtered, gKey) : 0;
  const rowCount = filtered.length;
  const avg = rowCount > 0 ? total / rowCount : 0;

  const groupData = vKey && gKey ? groupSum(filtered, gKey, vKey, 8) : [];
  const series = vKey && dKey ? timeSeries(filtered, dKey, vKey) : [];

  if (!datasets || datasets.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-12 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl gradient-primary">
          <FileSpreadsheet className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">No data yet</h1>
        <p className="mt-2 text-muted-foreground">Upload a CSV to start exploring KPIs and charts.</p>
        <Button asChild className="mt-6 gradient-primary text-primary-foreground">
          <Link to="/upload">Upload CSV</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{detail?.dataset?.name ?? "Loading…"}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FieldSelect label="Dataset" value={activeId} onChange={setSelectedId}
            options={datasets.map((d) => ({ value: d.id, label: d.name }))} />
          {numericCols.length > 0 && (
            <FieldSelect label="Metric" value={vKey} onChange={setValueKey}
              options={numericCols.map((c) => ({ value: c, label: c }))} />
          )}
          {categoryCols.length > 0 && (
            <FieldSelect label="Group by" value={gKey} onChange={setGroupKey}
              options={categoryCols.map((c) => ({ value: c, label: c }))} />
          )}
          {dateCols.length > 0 && (
            <FieldSelect label="Date" value={dKey} onChange={setDateKey}
              options={dateCols.map((c) => ({ value: c, label: c }))} />
          )}
          <div className="grid gap-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi label={vKey ? `Total ${vKey}` : "Total"} value={formatNumber(total)} icon={Wallet} trend="+12.4%" />
        <Kpi label="Records" value={formatNumber(rowCount)} icon={Database} trend={`${datasets.length} datasets`} />
        <Kpi label={gKey ? `Unique ${gKey}` : "Unique"} value={formatNumber(distinctCats)} icon={TrendingUp} trend="distinct values" />
        <Kpi label="Average" value={formatNumber(avg)} icon={ArrowUpRight} trend="per record" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={`Trend over time`} subtitle={vKey && dKey ? `${vKey} by ${dKey}` : "Pick a date and metric"}>
          {series.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={formatNumber} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title={`Top ${gKey ?? "categories"}`} subtitle={vKey && gKey ? `${vKey} by ${gKey}` : "Pick a category and metric"}>
          {groupData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={groupData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={formatNumber} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title="Share of total" subtitle={gKey ? `${vKey} split by ${gKey}` : "Pick a category"}>
          {groupData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={groupData} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100} innerRadius={55}>
                  {groupData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </ChartCard>

        <ChartCard title="Recent records" subtitle={`${filtered.length} rows in view`}>
          <div className="max-h-[300px] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr>
                  {Object.keys(cols).slice(0, 5).map((c) => (
                    <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t">
                    {Object.keys(cols).slice(0, 5).map((c) => (
                      <td key={c} className="px-3 py-2 text-muted-foreground">{String(r[c] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
                {filtered.length === 0 && !isLoading && (
                  <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>No data in range</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, trend }: { label: string; value: string; icon: React.ElementType; trend: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary">
          <Icon className="h-4 w-4 text-primary-foreground" />
        </div>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{trend}</div>
    </Card>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function FieldSelect({ label, value, onChange, options }: {
  label: string; value?: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-44"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Empty() {
  return <div className="grid h-[300px] place-items-center text-sm text-muted-foreground">Not enough data to chart</div>;
}
