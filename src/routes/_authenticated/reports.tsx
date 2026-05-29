import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { listDatasets, getDatasetRecords } from "@/lib/analytics.functions";
import type { RecordRow } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Pulse" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const listFn = useServerFn(listDatasets);
  const { data: datasets } = useQuery({ queryKey: ["datasets"], queryFn: () => listFn() });

  const [datasetId, setDatasetId] = useState<string | undefined>();
  const recordsFn = useServerFn(getDatasetRecords);
  const { data: detail } = useQuery({
    queryKey: ["dataset-records", datasetId],
    queryFn: () => recordsFn({ data: { datasetId: datasetId!, limit: 5000 } }),
    enabled: !!datasetId,
  });

  const exportCsv = () => {
    if (!detail) return;
    const rows = detail.records.map((r) => r.data as RecordRow);
    const cols = (detail.dataset.schema as { columns?: string[] } | null)?.columns ?? Object.keys(rows[0] ?? {});
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => escape(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${detail.dataset.name}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  };

  const exportPdf = () => {
    if (!detail) return;
    const rows = detail.records.map((r) => r.data as RecordRow);
    const cols = (detail.dataset.schema as { columns?: string[] } | null)?.columns ?? Object.keys(rows[0] ?? {});
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text(detail.dataset.name, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Generated ${new Date().toLocaleString()} · ${rows.length} rows`, 14, 25);
    autoTable(doc, {
      head: [cols.slice(0, 10)],
      body: rows.slice(0, 500).map((r) => cols.slice(0, 10).map((c) => String(r[c] ?? ""))),
      startY: 32,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [99, 102, 241] },
    });
    doc.save(`${detail.dataset.name}.pdf`);
    toast.success("PDF downloaded");
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Export filtered datasets as CSV or PDF.</p>
      </header>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end">
          <div className="space-y-2">
            <Label>Dataset</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger><SelectValue placeholder="Pick a dataset" /></SelectTrigger>
              <SelectContent>
                {datasets?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name} · {d.row_count} rows</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportCsv} disabled={!detail} variant="outline">
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button onClick={exportPdf} disabled={!detail} className="gradient-primary text-primary-foreground">
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
        </div>
        {detail && (
          <p className="mt-4 text-xs text-muted-foreground">
            {detail.records.length} rows ready to export. PDF includes the first 500 rows × 10 columns.
          </p>
        )}
      </Card>
    </div>
  );
}
