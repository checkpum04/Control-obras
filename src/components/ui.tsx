import { useEffect, useRef, useState, type ReactNode } from 'react';
import { back } from '../lib/router';
import type { BudgetStatus, Health, Totals } from '../lib/calc';
import { eurosRound, euros, pct } from '../lib/format';
import { STATUS_LABEL, type ProjectStatus } from '../data/types';

// ───────── Iconos (trazos simples, 24×24)
const PATHS: Record<string, string> = {
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  home: 'M4 11l8-7 8 7M6 10v10h12V10',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  x: 'M6 6l12 12M18 6L6 18',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  edit: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  chart: 'M4 20V10M10 20V4M16 20v-7M2 20h20',
  check: 'M5 12l5 5L20 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  minus: 'M5 12h14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  calendar: 'M4 6h16v15H4zM4 10h16M9 3v4M15 3v4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  chevron: 'M9 6l6 6-6 6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
};

export function Icon({ name, size = 22, stroke = 2 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}

// ───────── Barra superior
export function TopBar({ title, sub, backTo, actions }: { title: ReactNode; sub?: ReactNode; backTo?: string; actions?: ReactNode }) {
  return (
    <header className="topbar">
      {backTo != null && (
        <button className="icon-btn" onClick={() => back(backTo)} aria-label="Volver"><Icon name="back" /></button>
      )}
      <div className="topbar-title">
        <h1>{title}</h1>
        {sub && <div className="topbar-sub">{sub}</div>}
      </div>
      {actions && <div className="topbar-actions">{actions}</div>}
    </header>
  );
}

// ───────── Hoja inferior (sustituye a confirm/prompt, que no están disponibles en todos los entornos)
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Botón que pide una segunda pulsación para acciones destructivas. */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn btn-ghost danger' }: {
  label: ReactNode; confirmLabel: string; onConfirm: () => void; className?: string;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className + (armed ? ' armed' : '')} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}

// ───────── Estado y semáforo
export function StatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

const HEALTH_TEXT: Record<Health, string> = { ok: 'En presupuesto', warn: 'Cerca del límite', danger: 'Al límite', none: 'Sin presupuesto' };
export function HealthPill({ s }: { s: BudgetStatus }) {
  const text = s.consumed != null && s.consumed > 1 ? 'Presupuesto superado' : HEALTH_TEXT[s.health];
  const icon = s.health === 'ok' ? 'check' : s.health === 'none' ? 'minus' : 'alert';
  return <span className={`health health-${s.health}`}><Icon name={icon} size={14} stroke={2.5} />{text}</span>;
}

/** Barra de presupuesto consumido con marcas del 75 % y 90 %. */
export function BudgetMeter({ s, compact }: { s: BudgetStatus; compact?: boolean }) {
  if (s.consumed == null) return null;
  const w = Math.min(100, s.consumed * 100);
  return (
    <div className={`meter${compact ? ' meter-compact' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(s.consumed * 100)} aria-label="Presupuesto consumido">
      <div className={`meter-fill health-bg-${s.health}`} style={{ width: `${w}%` }} />
      <span className="meter-tick" style={{ left: '75%' }} />
      <span className="meter-tick" style={{ left: '90%' }} />
    </div>
  );
}

/** Reparto del coste en mano de obra / materiales / otros: barra apilada + leyenda con importes. */
export function CostBreakdown({ t }: { t: Totals }) {
  const parts: { key: string; label: string; v: number; extra?: string }[] = [
    { key: 'labor', label: 'Mano de obra', v: t.laborCents, extra: '' },
    { key: 'materials', label: 'Materiales', v: t.materialsCents },
    { key: 'other', label: 'Otros gastos', v: t.expensesCents },
  ];
  const total = t.totalCents || 1;
  return (
    <div className="breakdown">
      <div className="stack" aria-hidden="true">
        {parts.filter((p) => p.v > 0).map((p) => (
          <div key={p.key} className={`stack-seg series-${p.key}`} style={{ flexGrow: p.v }} title={`${p.label}: ${euros(p.v)}`} />
        ))}
        {t.totalCents === 0 && <div className="stack-seg stack-empty" style={{ flexGrow: 1 }} />}
      </div>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`swatch series-${p.key}`} />
            <span className="legend-label">{p.label}{p.extra && <small> · {p.extra}</small>}</span>
            <span className="legend-value num">{eurosRound(p.v)}</span>
            <span className="legend-pct num">{t.totalCents ? pct(p.v / total) : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Campo numérico con − / + grandes (para horas). */
export function Stepper({ value, onChange, step = 0.5, min = 0, id, label }: {
  value: string; onChange: (v: string) => void; step?: number; min?: number; id?: string; label: string;
}) {
  const n = Number(String(value).replace(',', '.')) || 0;
  const set = (x: number) => onChange(String(Math.max(min, Math.round(x * 100) / 100)).replace('.', ','));
  return (
    <div className="stepper">
      <button type="button" onClick={() => set(n - step)} aria-label={`Restar ${label}`}><Icon name="minus" size={18} /></button>
      <input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        onFocus={(e) => e.target.select()} />
      <button type="button" onClick={() => set(n + step)} aria-label={`Sumar ${label}`}><Icon name="plus" size={18} /></button>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={32} stroke={1.5} />
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

/** Aviso breve en la parte inferior ("Parte guardado"). */
let toastFn: ((msg: string) => void) | null = null;
export const toast = (msg: string) => toastFn?.(msg);
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(0);
  useEffect(() => {
    toastFn = (m) => { setMsg(m); clearTimeout(timer.current); timer.current = window.setTimeout(() => setMsg(null), 2600); };
    return () => { toastFn = null; };
  }, []);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function Money({ cents, round }: { cents: number; round?: boolean }) {
  return <span className="num">{round ? eurosRound(cents) : euros(cents)}</span>;
}
