"use client";

import { useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { Download, Search } from "lucide-react";
import { auditToCsv } from "@/lib/access/engine";
import type { AuditCategory, AuditEvent } from "@/lib/access/types";
import { Empty } from "./shared";
import { download, useAccess } from "./store";

const CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "role", label: "Roles" },
  { id: "member", label: "Members" },
  { id: "policy", label: "Policy" },
  { id: "key", label: "API keys" },
  { id: "settings", label: "Settings" },
];

function dayLabel(at: string): string {
  const d = new Date(at);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMM yyyy");
}

export function AuditView() {
  const { state } = useAccess();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"" | AuditCategory>("");
  const [actor, setActor] = useState("");

  const q = query.trim().toLowerCase();
  const events = state.audit
    .filter((e) => !category || e.category === category)
    .filter((e) => !actor || e.actor === actor)
    .filter((e) => !q || `${e.summary} ${e.detail}`.toLowerCase().includes(q));
  const actors = [...new Set(state.audit.map((e) => e.actor))].sort();

  const groups: { label: string; items: AuditEvent[] }[] = [];
  for (const e of events) {
    const label = dayLabel(e.at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(e);
    else groups.push({ label, items: [e] });
  }

  return (
    <section className="page">
      <div className="card">
        <div className="toolbar">
          <label className="search"><Search /><input placeholder="Search events" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search events" /></label>
          <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filter by actor">
            <option value="">Anyone</option>
            {actors.map((a) => <option key={a}>{a}</option>)}
          </select>
          <button className="secondary" onClick={() => download("access-audit-log.csv", auditToCsv(events), "text/csv")} disabled={!events.length}><Download />Export CSV</button>
        </div>
        <div className="filters" role="group" aria-label="Filter by category">
          <button className={!category ? "pill active" : "pill"} onClick={() => setCategory("")}>All <b>{state.audit.length}</b></button>
          {CATEGORIES.map((c) => (
            <button key={c.id} className={category === c.id ? "pill active" : "pill"} onClick={() => setCategory(c.id)}>
              {c.label} <b>{state.audit.filter((e) => e.category === c.id).length}</b>
            </button>
          ))}
        </div>
        {!events.length ? <Empty title="No events match">Activity appears here as soon as anything changes.</Empty> : null}
        {groups.map((g) => (
          <section key={g.label} className="timeline">
            <h3>{g.label}</h3>
            {g.items.map((e) => (
              <div key={e.id} className="timeline-item">
                <time dateTime={e.at}>{format(new Date(e.at), "HH:mm")}</time>
                <span className={`cat cat-${e.category}`}>{e.category}</span>
                <p><b>{e.summary}</b><small>{e.detail}</small></p>
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
