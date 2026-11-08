// BarChart.jsx - one cobalt series on one axis, starting at 0, with a hover/focus tooltip.
// data = [{label, value}]. format turns a value into text.

import { useState } from "react";

/** A round axis top: 1, 2 or 5 times a power of ten. */
function niceMax(max) {
  if (max <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log10(max)));
  const step = [1, 2, 5, 10].find((n) => n * power >= max);
  return step * power;
}

export function VerticalBars({ data, format, height = 260 }) {
  const [hover, setHover] = useState(null);
  const top = niceMax(Math.max(...data.map((d) => d.value)));
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  // never more than about 8 date labels, so they can't run into each other
  const every = Math.ceil(data.length / 8);
  return (
    <div className="vchart" style={{ height }}>
      <div className="vchart-axis" aria-hidden="true">
        {ticks.map((t) => <span key={t}>{format(top * t)}</span>)}
      </div>
      <div className="vchart-body">
        <div className="vchart-plot">
          {ticks.map((t) => <i key={t} className="gridline" style={{ bottom: `${t * 100}%` }} />)}
          {data.map((d, i) => (
            <button key={d.label} className="vbar-hit" aria-label={`${d.label}: ${format(d.value)}`}
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              <span className="vbar" style={{ height: `${(d.value / top) * 100}%` }} />
              {hover === i && <span className="tip"><b>{format(d.value)}</b>{d.label}</span>}
            </button>
          ))}
        </div>
        <div className="vchart-labels" aria-hidden="true">
          {data.map((d, i) => <span key={d.label}>{i % every === 0 ? d.label : ""}</span>)}
        </div>
      </div>
    </div>
  );
}

export function HorizontalBars({ data, format }) {
  const top = Math.max(...data.map((d) => d.value)) || 1;
  return (
    <div className="hchart">
      {data.map((d) => (
        <div className="hrow" key={d.label} title={`${d.label}: ${format(d.value)}`}>
          <span className="hlabel">{d.label}</span>
          <span className="htrack"><span className="hbar" style={{ width: `${(d.value / top) * 100}%` }} /></span>
          <span className="hvalue">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
