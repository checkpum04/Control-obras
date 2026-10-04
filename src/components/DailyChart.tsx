import { useState } from 'react';
import { euros, eurosRound, fmtDate } from '../lib/format';

export interface DayPoint { date: string; labor: number; materials: number; other: number }

const W = 340, H = 170, PAD_L = 44, PAD_R = 6, PAD_T = 10, PAD_B = 22;

/** Coste por día apilado (mano de obra / materiales / otros). Toca una barra para ver el detalle. */
export function DailyChart({ days }: { days: DayPoint[] }) {
  const [sel, setSel] = useState<number | null>(null);
  if (days.length === 0) return null;
  const totals = days.map((d) => d.labor + d.materials + d.other);
  const max = niceMax(Math.max(...totals));
  const plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
  const slot = plotW / days.length;
  const bw = Math.max(3, Math.min(22, slot * 0.7));
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const active = sel != null ? days[sel] : null;

  return (
    <figure className="chart">
      <div className="chart-readout" aria-live="polite">
        {active ? (
          <>
            <strong>{fmtDate(active.date)}</strong>
            <span className="num">{euros(active.labor + active.materials + active.other)}</span>
            <small className="num">Mano de obra {eurosRound(active.labor)} · Materiales {eurosRound(active.materials)} · Otros {eurosRound(active.other)}</small>
          </>
        ) : (
          <small>Toca un día para ver su coste.</small>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Coste por día">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD_L - 6} y={y(t) + 4} className="axis" textAnchor="end">{shortEuro(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = PAD_L + slot * i + slot / 2;
          const segs = [
            { v: d.labor, c: 'series-labor' },
            { v: d.materials, c: 'series-materials' },
            { v: d.other, c: 'series-other' },
          ].filter((s) => s.v > 0);
          let acc = 0;
          return (
            <g key={d.date} className={sel === i ? 'bar sel' : sel != null ? 'bar dim' : 'bar'} onClick={() => setSel(sel === i ? null : i)}>
              <rect x={PAD_L + slot * i} y={PAD_T} width={slot} height={plotH} className="hit" />
              {segs.map((s, j) => {
                const y0 = y(acc), y1 = y(acc + s.v);
                acc += s.v;
                const gap = j < segs.length - 1 ? 0 : 0;
                const h = Math.max(0, y0 - y1 - (j > 0 ? 1.5 : 0));
                return <rect key={j} x={cx - bw / 2} y={y1 + gap} width={bw} height={h} rx={j === segs.length - 1 ? Math.min(3, bw / 3) : 0} className={`seg ${s.c}`} />;
              })}
            </g>
          );
        })}
        <text x={PAD_L} y={H - 6} className="axis">{fmtDate(days[0].date).slice(0, 5)}</text>
        {days.length > 1 && <text x={W - PAD_R} y={H - 6} className="axis" textAnchor="end">{fmtDate(days[days.length - 1].date).slice(0, 5)}</text>}
      </svg>
      <figcaption className="legend-inline">
        <span><i className="swatch series-labor" />Mano de obra</span>
        <span><i className="swatch series-materials" />Materiales</span>
        <span><i className="swatch series-other" />Otros</span>
      </figcaption>
    </figure>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 10000;
  const e = v / 100; // euros
  const pow = Math.pow(10, Math.floor(Math.log10(e)));
  const n = [1, 2, 2.5, 5, 10].find((m) => m * pow >= e)! * pow;
  return n * 100;
}

function shortEuro(cents: number) {
  const e = cents / 100;
  if (e >= 1000) return `${(e / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} mil €`;
  return `${Math.round(e)} €`;
}
