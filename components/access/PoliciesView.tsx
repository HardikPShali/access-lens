"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Download, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { Switch } from "radix-ui";
import { GUARDRAILS, SEVERITY_ORDER, compilePolicy, diffPermissions, has } from "@/lib/access/engine";
import { ACTIONS, GUARDRAIL_IDS, type Severity } from "@/lib/access/types";
import { Empty, SeverityBadge, timeAgo } from "./shared";
import { download, makeKeyPrefix, useAccess } from "./store";

type Props = { onOpenRole: (id: string) => void; onOpenSettings: () => void };

export function PoliciesView({ onOpenRole, onOpenSettings }: Props) {
  const { state, findings, dispatch } = useAccess();
  const [severity, setSeverity] = useState<"" | Severity>("");
  const pending = state.requests.filter((r) => r.status === "pending");
  const history = state.requests.filter((r) => r.status !== "pending").slice(0, 5);
  const shown = findings.filter((f) => !severity || f.severity === severity);
  const resourceName = (id: string) => state.resources.find((r) => r.id === id)?.name ?? id;

  const runCheck = () => {
    dispatch({ type: "check/run" });
    toast.success("Policy check complete", { description: `${findings.length} finding${findings.length === 1 ? "" : "s"} across ${state.roles.length} roles.` });
  };

  const exportPolicy = () => {
    download(`access-policy-${state.settings.environment.toLowerCase()}.json`, JSON.stringify(compilePolicy(state), null, 2), "application/json");
  };

  return (
    <section className="page">
      <div className="stats">
        {SEVERITY_ORDER.map((s) => (
          <button key={s} className={severity === s ? "stat-button active" : "stat-button"} onClick={() => setSeverity(severity === s ? "" : s)} aria-pressed={severity === s}>
            <b>{findings.filter((f) => f.severity === s).length}</b><span>{s}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Pending approvals</h2><p>High-risk changes wait here until another admin approves them.</p></div>
          <span className="count">{pending.length}</span>
        </div>
        {!pending.length ? <Empty title="Nothing waiting for approval" /> : null}
        {pending.map((r) => {
          const role = state.roles.find((x) => x.id === r.roleId);
          const own = r.requestedBy === state.settings.currentUser;
          const stale = role && role.version !== r.baseVersion;
          return (
            <article key={r.id} className="request">
              <div>
                <b>{role?.name ?? "Removed role"}</b>
                <small>{r.requestedBy} · {timeAgo(r.at)}{stale ? " · role changed since request" : ""}</small>
                <p>“{r.reason}”</p>
                <ul className="diff-inline">
                  {role ? diffPermissions(role.permissions, r.proposed).map((c) => (
                    <li key={`${c.resourceId}:${c.action}`} className={c.change}>{c.change === "added" ? "+" : "−"} {resourceName(c.resourceId)} · {c.action}</li>
                  )) : null}
                </ul>
              </div>
              <div className="request-actions">
                <button className="secondary" onClick={() => { dispatch({ type: "request/resolve", requestId: r.id, approve: false }); toast("Request rejected"); }}>Reject</button>
                <button className="primary" disabled={own} title={own ? "You cannot approve your own request" : undefined}
                  onClick={() => { dispatch({ type: "request/resolve", requestId: r.id, approve: true }); toast.success(`${role?.name} updated`); }}>Approve</button>
                {own ? <small className="hint">Needs a different admin. <button className="link" onClick={onOpenSettings}>Switch user</button></small> : null}
              </div>
            </article>
          );
        })}
        {history.length ? (
          <details className="history">
            <summary>Recently resolved ({history.length})</summary>
            {history.map((r) => (
              <p key={r.id}><span className={`status status-${r.status === "approved" ? "active" : "suspended"}`}>{r.status}</span> {state.roles.find((x) => x.id === r.roleId)?.name ?? "Removed role"} by {r.resolvedBy} · {timeAgo(r.resolvedAt ?? r.at)}</p>
            ))}
          </details>
        ) : null}
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Findings</h2><p>Last checked {timeAgo(state.lastCheckAt)}. {severity ? `Showing ${severity} only.` : ""}</p></div>
          <button className="secondary" onClick={runCheck}><RefreshCw />Run check</button>
        </div>
        {!shown.length ? <Empty title={severity ? `No ${severity} findings` : "No findings"}>Every enabled guardrail passes.</Empty> : null}
        <ul className="findings">
          {shown.map((f) => (
            <li key={f.id}>
              <SeverityBadge severity={f.severity} />
              <span><b>{f.title}</b><small>{f.detail}</small><em>{GUARDRAILS[f.rule].name}</em></span>
              {f.roleId ? <button className="text-button inline" onClick={() => onOpenRole(f.roleId!)}>Fix role <ArrowRight /></button> : null}
              {f.keyId ? (
                <span className="finding-actions">
                  <button className="ghost" onClick={() => { dispatch({ type: "key/rotate", keyId: f.keyId!, prefix: makeKeyPrefix() }); toast.success("Key rotated"); }}><RefreshCw />Rotate</button>
                  <button className="ghost danger-text" onClick={() => { dispatch({ type: "key/revoke", keyId: f.keyId! }); toast.success("Key revoked"); }}><KeyRound />Revoke</button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Guardrails</h2><p>Rules evaluated on every change. Disabling one hides its findings.</p></div></div>
        <ul className="guardrails">
          {GUARDRAIL_IDS.map((id) => (
            <li key={id}>
              <span><b>{GUARDRAILS[id].name}</b><small>{GUARDRAILS[id].description}</small></span>
              <Switch.Root className="switch" checked={state.guardrails[id]} aria-label={GUARDRAILS[id].name}
                onCheckedChange={(enabled) => dispatch({ type: "guardrail/toggle", id, enabled })}>
                <Switch.Thumb className="switch-thumb" />
              </Switch.Root>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>Effective access</h2><p>Every role against every resource. V view · C create · E edit · D delete.</p></div>
          <button className="secondary" onClick={exportPolicy}><Download />Export policy</button>
        </div>
        <div className="overview-wrap">
          <table className="overview">
            <thead><tr><th>Role</th>{state.resources.map((r) => <th key={r.id}>{r.name}</th>)}</tr></thead>
            <tbody>
              {state.roles.map((role) => (
                <tr key={role.id}>
                  <th><button className="link" onClick={() => onOpenRole(role.id)}><i style={{ background: role.color }} />{role.name}</button></th>
                  {state.resources.map((r) => (
                    <td key={r.id}>
                      {ACTIONS.map((a) => <span key={a} className={has(role.permissions, r.id, a) ? "grant on" : "grant"} title={`${a} ${r.name}`}>{a[0]!.toUpperCase()}</span>)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted-note with-icon"><ShieldCheck />The exported document is a versioned policy you can evaluate server-side.</p>
      </div>
    </section>
  );
}
