import { useLiveQuery } from 'dexie-react-hooks';
import { habitualPartidas, listTemplates, projectsWithPartidas, templateUsed, type PartidaSeed } from '../data/repo';
import { BUILTIN_TEMPLATE } from '../data/types';
import { norm } from '../lib/format';
import { AddWithSuggestions } from './Autocomplete';
import { Icon } from './ui';

/**
 * Elegir varias partidas de golpe: plantillas, partidas habituales, copiar las de otra obra
 * o escribir una nueva. `existing` son los nombres que la obra ya tiene (no se ofrecen otra vez).
 */
export function PartidaPicker({ value, onChange, exceptProjectId, existing = [] }: {
  value: PartidaSeed[]; onChange: (v: PartidaSeed[]) => void; exceptProjectId?: string; existing?: string[];
}) {
  const habitual = useLiveQuery(habitualPartidas) || [];
  const templates = useLiveQuery(listTemplates) || [];
  const others = useLiveQuery(() => projectsWithPartidas(exceptProjectId), [exceptProjectId]) || [];

  const taken = new Set([...existing, ...value.map((v) => v.name)].map(norm));
  const add = (items: PartidaSeed[]) => {
    const seen = new Set(taken);
    const out = [...value];
    for (const it of items) {
      if (!it.name.trim() || seen.has(norm(it.name))) continue;
      seen.add(norm(it.name));
      out.push({ name: it.name.trim(), unit: it.unit || null, description: it.description });
    }
    onChange(out);
  };
  const remove = (name: string) => onChange(value.filter((v) => v.name !== name));

  const allTemplates = [
    ...(templates.some((t) => norm(t.name) === norm(BUILTIN_TEMPLATE.name)) ? [] : [{ id: '', name: BUILTIN_TEMPLATE.name, items: BUILTIN_TEMPLATE.items }]),
    ...templates,
  ];
  const freeHabitual = habitual.filter((h) => !taken.has(norm(h.name)));
  const suggestable = habitual.map((h) => ({ id: h.name, name: h.name, use_count: h.count }));

  return (
    <div className="picker">
      {value.length > 0 && (
        <div className="chips" aria-label="Partidas elegidas">
          {value.map((v) => (
            <button type="button" key={v.name} className="chip on" onClick={() => remove(v.name)} aria-label={`Quitar ${v.name}`}>
              {v.name}{v.unit ? <small>{v.unit}</small> : null}<Icon name="x" size={14} stroke={2.5} />
            </button>
          ))}
        </div>
      )}

      <AddWithSuggestions id="add-partida" items={suggestable} exclude={new Set(habitual.filter((h) => taken.has(norm(h.name))).map((h) => h.name))} placeholder="Escribir una partida…"
        onPick={(h) => add([habitual.find((x) => x.name === h.id)!])} onCreate={(name) => add([{ name }])} />

      {freeHabitual.length > 0 && (
        <div className="picker-group">
          <p className="label">{habitual.some((h) => h.count > 0) ? 'Partidas habituales' : 'Partidas típicas'}</p>
          <div className="chips">
            {freeHabitual.slice(0, 16).map((h) => (
              <button type="button" key={h.name} className="chip" onClick={() => add([h])}>
                <Icon name="plus" size={14} stroke={2.5} />{h.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="picker-group">
        <p className="label">Plantillas</p>
        <div className="chips">
          {allTemplates.map((t) => (
            <button type="button" key={t.id || t.name} className="chip chip-template"
              onClick={() => { add(t.items); if (t.id) templateUsed(t.id); }}>
              <Icon name="copy" size={14} />{t.name}<small>{t.items.length}</small>
            </button>
          ))}
        </div>
      </div>

      {others.length > 0 && (
        <label className="field picker-group">
          <span>Copiar las partidas de otra obra</span>
          <select id="copy-partidas" value="" onChange={(e) => {
            const o = others.find((x) => x.project.id === e.target.value);
            if (o) add(o.partidas.map((p) => ({ name: p.name, unit: p.unit, description: p.description })));
          }}>
            <option value="">Elegir obra…</option>
            {others.map((o) => <option key={o.project.id} value={o.project.id}>{o.project.name} ({o.partidas.length})</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
