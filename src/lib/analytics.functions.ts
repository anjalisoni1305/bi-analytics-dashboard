import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Get the current user's primary organization (auto-created on signup). */
export const getMyOrg = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error } = await supabase
      .from("organization_members")
      .select("organization_id, organizations(id, name, owner_id, created_at)")
      .eq("user_id", userId)
      .limit(1);
    if (error) throw new Error(error.message);
    const org = memberships?.[0]?.organizations as { id: string; name: string; owner_id: string; created_at: string } | undefined;
    if (!org) throw new Error("No organization found");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("organization_id", org.id);

    return { org, roles: (roles ?? []).map((r) => r.role) };
  });

/** List datasets in current org */
export const listDatasets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("datasets")
      .select("id, name, row_count, schema, created_at, datasource_id, datasources(name, type)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Create a dataset and bulk-insert records from a parsed CSV. */
export const uploadDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(120),
      sourceType: z.enum(["csv", "api", "manual"]).default("csv"),
      columns: z.array(z.string().min(1).max(80)).min(1).max(60),
      rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1).max(20000),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // get org
    const { data: mem } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const orgId = mem?.organization_id;
    if (!orgId) throw new Error("No organization");

    const { data: ds, error: dsErr } = await supabase
      .from("datasources")
      .insert({ name: data.name, type: data.sourceType, organization_id: orgId, created_by: userId })
      .select("id")
      .single();
    if (dsErr) throw new Error(dsErr.message);


    const { data: dataset, error: datErr } = await supabase
      .from("datasets")
      .insert({
        name: data.name,
        datasource_id: ds.id,
        organization_id: orgId,
        schema: { columns: data.columns },
        row_count: data.rows.length,
      })
      .select("id")
      .single();
    if (datErr) throw new Error(datErr.message);

    // chunk inserts
    const chunkSize = 500;
    for (let i = 0; i < data.rows.length; i += chunkSize) {
      const chunk = data.rows.slice(i, i + chunkSize).map((row) => ({
        dataset_id: dataset.id,
        organization_id: orgId,
        data: row,
      }));
      const { error: recErr } = await supabase.from("records").insert(chunk);
      if (recErr) throw new Error(recErr.message);
    }

    return { datasetId: dataset.id, rows: data.rows.length };
  });

/** Fetch records for a dataset (paginated). */
export const getDatasetRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ datasetId: z.string().uuid(), limit: z.number().min(1).max(5000).default(1000) }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: dataset, error: dErr } = await supabase
      .from("datasets")
      .select("id, name, schema, row_count")
      .eq("id", data.datasetId)
      .single();
    if (dErr) throw new Error(dErr.message);

    const { data: records, error } = await supabase
      .from("records")
      .select("id, data, created_at")
      .eq("dataset_id", data.datasetId)
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    return { dataset, records: records ?? [] };
  });

export const deleteDataset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ datasetId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("datasets").delete().eq("id", data.datasetId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Fetch JSON from a public URL and return parsed rows for ingestion. */
export const fetchApiPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ url: z.string().url(), path: z.string().optional() }).parse)
  .handler(async ({ data }) => {
    const res = await fetch(data.url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    const json: unknown = await res.json();

    // Walk dot-path if provided to find the array
    let node: unknown = json;
    if (data.path) {
      for (const key of data.path.split(".").filter(Boolean)) {
        if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
          node = (node as Record<string, unknown>)[key];
        } else {
          throw new Error(`Path "${data.path}" not found in response`);
        }
      }
    } else if (!Array.isArray(node) && node && typeof node === "object") {
      // auto-detect first array property
      const found = Object.values(node as Record<string, unknown>).find(Array.isArray);
      if (found) node = found;
    }

    if (!Array.isArray(node)) throw new Error("Expected a JSON array (use path to point to it)");
    const rows = (node as unknown[])
      .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object" && !Array.isArray(r))
      .slice(0, 20000)
      .map((r) => {
        const out: Record<string, string | number | boolean | null> = {};
        for (const [k, v] of Object.entries(r)) {
          if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
          else out[k] = JSON.stringify(v);
        }
        return out;
      });
    if (rows.length === 0) throw new Error("No object rows found");
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    return { columns, rows };
  });
