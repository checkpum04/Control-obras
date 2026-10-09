// Comprueba que Supabase tiene las tablas de docs/schema.sql (se ejecuta en GitHub Actions).
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.production', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
// Tabla (o tabla?select=columna) que la app necesita en la nube
const tables = [
  'clients', 'projects', 'workers', 'materials', 'expense_concepts', 'daily_reports', 'labor_entries', 'material_entries', 'expenses', 'attachments',
  'partidas', 'partida_templates', 'labor_entries?select=partida_id', 'material_entries?select=partida_id', 'expenses?select=partida_id', 'attachments?select=partida_id',
];
let ok = true;
for (const t of tables) {
  const q = t.includes('?') ? `${t}&limit=1` : `${t}?select=id&limit=1`;
  const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const body = await r.text();
  console.log(`${t}: ${r.status} ${r.ok ? 'OK' : body.slice(0, 200)}`);
  if (!r.ok) ok = false;
}
const s = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
const settings = await s.json().catch(() => ({}));
console.log('auth email:', settings.external?.email, '· confirmar correo:', !settings.mailer_autoconfirm, '· registro abierto:', !settings.disable_signup);
if (!ok) { console.error('Faltan tablas o columnas: ejecuta docs/schema.sql y docs/migrations/*.sql en el SQL Editor de Supabase.'); process.exit(1); }
