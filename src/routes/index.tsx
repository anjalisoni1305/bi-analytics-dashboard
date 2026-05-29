import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Database, FileSpreadsheet, Shield, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pulse — Business Intelligence Dashboard" },
      { name: "description", content: "Upload CSVs, explore KPIs, build dashboards, and export polished reports." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg gradient-primary">
              <BarChart3 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight">Pulse</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost"><Link to="/login">Sign in</Link></Button>
            <Button asChild className="gradient-primary text-primary-foreground"><Link to="/login">Get started</Link></Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-24 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" /> Production-ready BI in minutes
        </div>
        <h1 className="text-balance text-5xl font-bold tracking-tight md:text-7xl">
          Turn raw data into <span className="text-gradient">decisions</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Upload a CSV, get KPI cards, charts, and reports — secured per organization with role-based access.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button asChild size="lg" className="gradient-primary text-primary-foreground">
            <Link to="/login">Open the dashboard</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 pb-24 md:grid-cols-3">
        {[
          { icon: FileSpreadsheet, title: "CSV ingest", desc: "Drag in a file, get structured records in your warehouse." },
          { icon: BarChart3, title: "Live charts", desc: "Bar, line, pie & KPI tiles wired to your real data." },
          { icon: Shield, title: "Org & roles", desc: "RLS-secured per organization with admin/user roles." },
          { icon: Database, title: "JSON-flexible", desc: "Datasets store dynamic schemas — bring any shape." },
          { icon: Zap, title: "Server functions", desc: "Type-safe RPCs handle ingest, filtering, and aggregations." },
          { icon: Sparkles, title: "Export anywhere", desc: "One-click CSV & PDF reports of the filtered view." },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-xl border bg-card p-6">
            <Icon className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
