// Solo para tests: Supabase en memoria.
/** Supabase falso en memoria: lo justo de la API que usa SyncEngine. */
export function fakeSupabase() {
  const tables = new Map<string, Map<string, any>>();
  const files = new Map<string, Blob>();
  let clock = Date.parse('2026-10-04T10:00:00Z');
  const t = (name: string) => tables.get(name) || (tables.set(name, new Map()), tables.get(name)!);
  const sb: any = {
    tables, files, failNext: false,
    from(name: string) {
      return {
        async upsert(rows: any[]) {
          if (sb.failNext) { sb.failNext = false; return { error: { message: 'Failed to fetch' } }; }
          // El servidor guarda como texto los numeric, igual que Postgres.
          if (name === 'daily_reports') {
            for (const r of rows) {
              const clash = [...t(name).values()].find((x) => x.id !== r.id && !x.deleted_at && !r.deleted_at && x.project_id === r.project_id && x.date === r.date);
              if (clash) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "daily_reports_project_date"' } };
            }
          }
          for (const r of rows) t(name).set(r.id, JSON.parse(JSON.stringify({ ...r, hours: r.hours != null ? String(r.hours) : undefined })));
          clock += 1000;
          return { error: null };
        },
        select() {
          let filter = (_r: any) => true;
          let range: [number, number] = [0, 1e9];
          const q: any = {
            gt(col: string, v: string) { const f = filter; filter = (r) => f(r) && r[col] > v; return q; },
            in(col: string, vs: string[]) { const f = filter; filter = (r) => f(r) && vs.includes(r[col]); return q; },
            is(col: string, v: null) { const f = filter; filter = (r) => f(r) && (r[col] ?? null) === v; return q; },
            order() { return q; },
            range(a: number, b: number) { range = [a, b]; return q; },
            then(res: any) {
              const data = [...t(name).values()].filter(filter).sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id)).slice(range[0], range[1] + 1);
              return Promise.resolve({ data, error: null }).then(res);
            },
          };
          return q;
        },
      };
    },
    storage: {
      from() {
        return {
          async upload(path: string, blob: Blob) { files.set(path, blob); return { error: null }; },
          async download(path: string) { return { data: files.get(path) || null, error: files.has(path) ? null : { message: 'no' } }; },
        };
      },
    },
  };
  return sb;
}
