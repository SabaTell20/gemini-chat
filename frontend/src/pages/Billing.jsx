// Billing.jsx - the billing dashboard (admins only). Top: date filter. Then KPIs, charts,
// and a table of all chats. The filter picks the chats CREATED between From and To;
// every number on the page is calculated from those chats only (by the backend).

import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { HorizontalBars, VerticalBars } from "../components/BarChart.jsx";
import { CountUp, PageHeader, usePageTitle } from "../components/Common.jsx";

const money4 = (v) => "$" + v.toFixed(4);
const money6 = (v) => "$" + v.toFixed(6);
const whole = (v) => String(Math.round(v));

const COLUMNS = [
  ["title", "Title"], ["user", "User"], ["status", "Status"], ["created", "Created"],
  ["last_activity", "Last activity"], ["messages", "Messages", true], ["tokens", "Tokens", true], ["cost", "Cost ($)", true],
];

function SessionsTable({ rows }) {
  const [sort, setSort] = useState({ key: "created", up: false });
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const order = a[sort.key] < b[sort.key] ? -1 : a[sort.key] > b[sort.key] ? 1 : 0;
    return sort.up ? order : -order;
  }), [rows, sort]);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {COLUMNS.map(([key, label, number]) => (
              <th key={key} className={number ? "num" : ""}
                  aria-sort={sort.key === key ? (sort.up ? "ascending" : "descending") : undefined}>
                <button onClick={() => setSort({ key, up: sort.key === key ? !sort.up : false })}>
                  {label}{sort.key === key ? (sort.up ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              <td className="title-cell" title={row.title}>{row.title}</td>
              <td>{row.user}</td>
              <td>{row.status}</td>
              <td>{row.created}</td>
              <td>{row.last_activity}</td>
              <td className="num">{row.messages}</td>
              <td className="num">{row.tokens}</td>
              <td className="num">{money6(row.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Billing() {
  usePageTitle("Billing");
  const [data, setData] = useState(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (start && end && start > end) return;
    const query = new URLSearchParams();
    if (start) query.set("start", start);
    if (end) query.set("end", end);
    api.get("/admin/billing?" + query).then((result) => {
      setData(result);
      setStart(result.start || "");
      setEnd(result.end || "");
    }).catch((e) => setError(e.message));
  }, [start, end]);

  const header = <PageHeader title="Billing" eyebrow="Admin" subtitle="What every chat cost, and where the tokens went." />;
  if (error) return <div className="page">{header}<div className="alert" role="alert">{error}</div></div>;
  if (!data) return null;
  if (!data.first_day) return <div className="page">{header}<div className="info">No chats yet. Send a message first.</div></div>;

  const badDates = start && end && start > end;
  return (
    <div className="page">
      <div className="page-top">
        {header}
        <div className="date-filter">
          <label className="field"><span className="label">From</span>
            <input type="date" value={start} min={data.first_day} max={data.today} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field"><span className="label">To</span>
            <input type="date" value={end} min={data.first_day} max={data.today} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
      </div>

      {badDates && <div className="alert" role="alert">'From' must be before 'To'.</div>}
      {!badDates && data.sessions.length === 0 && <div className="info">No chats were created between these dates.</div>}
      {!badDates && data.sessions.length > 0 && (
        <>
          <section className="kpi-grid" aria-label="Key numbers">
            {data.kpis.map((kpi, i) => (
              <div className="kpi" key={kpi.label}>
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value"><CountUp text={kpi.value} delay={i * 70} /></div>
                <div className="kpi-note">{kpi.note || " "}</div>
              </div>
            ))}
          </section>

          <section className="chart-card">
            <div className="card-title">Cost per day</div>
            {data.cost_per_day.length
              ? <VerticalBars data={data.cost_per_day} format={money4} />
              : <p className="caption">No token usage for these chats.</p>}
          </section>

          <div className="chart-pair">
            <section className="chart-card">
              <div className="card-title">Cost by token type</div>
              <HorizontalBars data={data.cost_by_type} format={money4} />
            </section>
            <section className="chart-card">
              <div className="card-title">Feature usage <span>(user messages)</span></div>
              <HorizontalBars data={data.features} format={whole} />
            </section>
          </div>

          <h2 className="section-title">Sessions</h2>
          <SessionsTable rows={data.sessions} />
          <p className="caption">
            Deleted chats are still listed: they were hidden in the app, but they were billed.
            Prices per 1M tokens: input $2.00, cached $0.10, output and thinking $10.00 until
            Nov 30, 2026, then double. Each day is priced with that day's rates.
          </p>
        </>
      )}
    </div>
  );
}
