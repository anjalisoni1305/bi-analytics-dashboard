import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import Papa from "papaparse";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Plus, Trash2, Globe } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadDataset, fetchApiPreview } from "@/lib/analytics.functions";

type Cell = string | number | boolean | null;
type Preview = { columns: string[]; rows: Record<string, Cell>[] };

export const Route = createFileRoute("/_authenticated/upload")({
  head: () => ({ meta: [{ title: "Import data — Pulse" }] }),
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  const upload = useServerFn(uploadDataset);
  const [name, setName] = useState("");
  const [sourceType, setSourceType] = useState<"csv" | "api" | "manual">("csv");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!preview || !name) return;
    setBusy(true);
    try {
      const res = await upload({ data: { name, sourceType, columns: preview.columns, rows: preview.rows } });
      toast.success(`Ingested ${res.rows} rows`);
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import dataset</h1>
        <p className="text-sm text-muted-foreground">Bring data in from a CSV file, a JSON API, or enter it manually.</p>
      </div>

      <Card className="p-6">
        <div className="mb-4 space-y-2">
          <Label htmlFor="ds-name">Dataset name</Label>
          <Input id="ds-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q4 sales" />
        </div>

        <Tabs value={sourceType} onValueChange={(v) => { setSourceType(v as typeof sourceType); setPreview(null); }}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="csv"><FileSpreadsheet className="mr-2 h-4 w-4" />CSV</TabsTrigger>
            <TabsTrigger value="api"><Globe className="mr-2 h-4 w-4" />API</TabsTrigger>
            <TabsTrigger value="manual"><Plus className="mr-2 h-4 w-4" />Manual</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="mt-4">
            <CsvSource onPreview={setPreview} setName={(n) => !name && setName(n)} />
          </TabsContent>
          <TabsContent value="api" className="mt-4">
            <ApiSource fetchPreview={useServerFn(fetchApiPreview)} onPreview={setPreview} />
          </TabsContent>
          <TabsContent value="manual" className="mt-4">
            <ManualSource onPreview={setPreview} />
          </TabsContent>
        </Tabs>
      </Card>

      {preview && (
        <Card className="p-6">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{preview.rows.length} rows · {preview.columns.length} columns</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" asChild><Link to="/datasets">Cancel</Link></Button>
              <Button onClick={submit} disabled={busy || !name} className="gradient-primary text-primary-foreground">
                {busy ? "Importing…" : "Ingest dataset"}
              </Button>
            </div>
          </div>
          <div className="max-h-96 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/50 backdrop-blur">
                <tr>{preview.columns.map((c) => <th key={c} className="px-3 py-2 text-left font-medium">{c}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 25).map((r, i) => (
                  <tr key={i} className="border-t">
                    {preview.columns.map((c) => (
                      <td key={c} className="px-3 py-2 text-muted-foreground">{String(r[c] ?? "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function CsvSource({ onPreview, setName }: { onPreview: (p: Preview) => void; setName: (n: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (file: File) => {
    setName(file.name.replace(/\.(csv|txt)$/i, ""));
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (result) => {
        const rows = result.data as Record<string, Cell>[];
        const columns = result.meta.fields ?? [];
        if (rows.length === 0) return toast.error("CSV appears empty");
        if (rows.length > 20000) return toast.error("Max 20,000 rows per upload");
        onPreview({ columns, rows });
      },
      error: (err) => toast.error(err.message),
    });
  };
  return (
    <>
      <Input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      <div
        className="mt-4 grid place-items-center rounded-xl border-2 border-dashed bg-muted/30 p-10 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm">Drag & drop a CSV here</p>
      </div>
    </>
  );
}

function ApiSource({ fetchPreview, onPreview }: {
  fetchPreview: (opts: { data: { url: string; path?: string } }) => Promise<Preview>;
  onPreview: (p: Preview) => void;
}) {
  const [url, setUrl] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    if (!url) return;
    setLoading(true);
    try {
      const res = await fetchPreview({ data: { url, path: path || undefined } });
      onPreview(res);
      toast.success(`Fetched ${res.rows.length} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fetch failed");
    } finally { setLoading(false); }
  };
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>JSON endpoint URL</Label>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/data" />
      </div>
      <div className="space-y-2">
        <Label>Array path <span className="text-muted-foreground">(optional, e.g. "results.items")</span></Label>
        <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="results" />
      </div>
      <Button onClick={load} disabled={loading || !url} variant="secondary">
        {loading ? "Fetching…" : "Fetch & preview"}
      </Button>
    </div>
  );
}

function ManualSource({ onPreview }: { onPreview: (p: Preview) => void }) {
  const [columns, setColumns] = useState<string[]>(["date", "category", "value"]);
  const [rows, setRows] = useState<Record<string, Cell>[]>([{ date: "", category: "", value: "" }]);

  const addCol = () => setColumns([...columns, `col_${columns.length + 1}`]);
  const removeCol = (i: number) => {
    const c = columns[i];
    setColumns(columns.filter((_, idx) => idx !== i));
    setRows(rows.map((r) => { const { [c]: _, ...rest } = r; return rest; }));
  };
  const renameCol = (i: number, name: string) => {
    const old = columns[i];
    const next = [...columns]; next[i] = name; setColumns(next);
    setRows(rows.map((r) => { const { [old]: v, ...rest } = r; return { ...rest, [name]: v ?? "" }; }));
  };
  const addRow = () => setRows([...rows, Object.fromEntries(columns.map((c) => [c, ""]))]);
  const removeRow = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const setCell = (i: number, c: string, v: string) => {
    const next = [...rows]; next[i] = { ...next[i], [c]: v }; setRows(next);
  };

  const commit = () => {
    const cleanRows = rows
      .map((r) => {
        const o: Record<string, Cell> = {};
        for (const c of columns) {
          const v = r[c];
          if (v === "" || v == null) { o[c] = null; continue; }
          const n = Number(v);
          o[c] = !Number.isNaN(n) && String(v).trim() !== "" ? n : v;
        }
        return o;
      })
      .filter((r) => Object.values(r).some((v) => v !== null && v !== ""));
    if (cleanRows.length === 0) return toast.error("Add at least one row with data");
    onPreview({ columns, rows: cleanRows });
    toast.success("Preview ready");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {columns.map((c, i) => (
          <div key={i} className="flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
            <Input className="h-7 w-28 border-0 bg-transparent p-1 text-xs" value={c} onChange={(e) => renameCol(i, e.target.value)} />
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeCol(i)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addCol}><Plus className="mr-1 h-3 w-3" />Column</Button>
      </div>

      <div className="max-h-80 overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>{columns.map((c) => <th key={c} className="px-2 py-2 text-left text-xs font-medium">{c}</th>)}<th /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                {columns.map((c) => (
                  <td key={c} className="p-1">
                    <Input className="h-7 text-xs" value={String(r[c] ?? "")} onChange={(e) => setCell(i, c, e.target.value)} />
                  </td>
                ))}
                <td className="p-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeRow(i)}><Trash2 className="h-3 w-3" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={addRow}><Plus className="mr-1 h-3 w-3" />Row</Button>
        <Button size="sm" onClick={commit} variant="secondary">Build preview</Button>
      </div>
    </div>
  );
}
