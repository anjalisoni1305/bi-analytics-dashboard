import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Database, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteDataset, listDatasets } from "@/lib/analytics.functions";

export const Route = createFileRoute("/_authenticated/datasets")({
  head: () => ({ meta: [{ title: "Datasets — Pulse" }] }),
  component: DatasetsPage,
});

function DatasetsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDatasets);
  const delFn = useServerFn(deleteDataset);
  const { data, isLoading } = useQuery({ queryKey: ["datasets"], queryFn: () => listFn() });

  const remove = async (id: string) => {
    if (!confirm("Delete this dataset and all its records?")) return;
    try {
      await delFn({ data: { datasetId: id } });
      toast.success("Dataset deleted");
      qc.invalidateQueries({ queryKey: ["datasets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Datasets</h1>
          <p className="text-sm text-muted-foreground">All data ingested into your workspace.</p>
        </div>
        <Button asChild className="gradient-primary text-primary-foreground"><Link to="/upload">Upload CSV</Link></Button>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && (!data || data.length === 0) && (
        <Card className="p-12 text-center">
          <Database className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No datasets yet.</p>
          <Button asChild className="mt-4 gradient-primary text-primary-foreground"><Link to="/upload">Upload your first CSV</Link></Button>
        </Card>
      )}

      <div className="grid gap-3">
        {data?.map((d) => {
          const cols = (d.schema as { columns?: string[] } | null)?.columns ?? [];
          return (
            <Card key={d.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">
                  {d.row_count.toLocaleString()} rows · {cols.length} columns · {new Date(d.created_at).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm"><Link to="/dashboard">Open</Link></Button>
                <Button variant="ghost" size="icon" onClick={() => remove(d.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
