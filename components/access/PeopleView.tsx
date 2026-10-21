"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, Search, Trash2, UserPlus } from "lucide-react";
import { Confirm } from "@/components/ui/dialog";
import { isExternal } from "@/lib/access/engine";
import type { Person, PersonStatus } from "@/lib/access/types";
import { Avatar, Empty, InviteModal, timeAgo } from "./shared";
import { useAccess } from "./store";

type Props = { roleFilter: string; setRoleFilter: (id: string) => void };

export function PeopleView({ roleFilter, setRoleFilter }: Props) {
  const { state, dispatch } = useAccess();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | PersonStatus>("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);

  const q = query.trim().toLowerCase();
  const rows = state.people
    .filter((p) => !roleFilter || p.roleId === roleFilter)
    .filter((p) => !status || p.status === status)
    .filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const counts = {
    active: state.people.filter((p) => p.status === "active").length,
    invited: state.people.filter((p) => p.status === "invited").length,
    suspended: state.people.filter((p) => p.status === "suspended").length,
    external: state.people.filter((p) => isExternal(p, state.settings.domain)).length,
  };
  const me = state.people.find((p) => p.name === state.settings.currentUser);

  return (
    <section className="page">
      <div className="stats">
        <div><b>{counts.active}</b><span>Active</span></div>
        <div><b>{counts.invited}</b><span>Pending invites</span></div>
        <div><b>{counts.suspended}</b><span>Suspended</span></div>
        <div><b>{counts.external}</b><span>External</span></div>
      </div>

      <div className="card">
        <div className="toolbar">
          <label className="search"><Search /><input placeholder="Search name or email" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" /></label>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {state.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value as "" | PersonStatus)} aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="invited">Invited</option>
            <option value="suspended">Suspended</option>
          </select>
          <button className="primary" onClick={() => setInviting(true)}><UserPlus />Invite</button>
        </div>

        <div className="people-table" role="table" aria-label="People">
          <div className="people-row people-head" role="row">
            <span role="columnheader">Person</span><span role="columnheader">Role</span><span role="columnheader">Status</span><span role="columnheader">Last active</span><span role="columnheader" className="sr-only">Actions</span>
          </div>
          {rows.map((p) => {
            const self = p.id === me?.id;
            return (
              <div className="people-row" role="row" key={p.id}>
                <div className="person" role="cell">
                  <Avatar name={p.name} />
                  <p><b>{p.name}{self ? <span className="tag">You</span> : null}{isExternal(p, state.settings.domain) ? <span className="tag tag-high">External</span> : null}</b><small>{p.email}</small></p>
                </div>
                <div role="cell">
                  <select value={p.roleId} disabled={self} aria-label={`Role for ${p.name}`}
                    onChange={(e) => {
                      dispatch({ type: "person/role", personId: p.id, roleId: e.target.value });
                      toast.success(`${p.name} is now ${state.roles.find((r) => r.id === e.target.value)?.name}`);
                    }}>
                    {state.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div role="cell"><span className={`status status-${p.status}`}>{p.status}</span></div>
                <div role="cell" className="muted">{timeAgo(p.lastActive)}</div>
                <div role="cell" className="row-actions">
                  {p.status === "invited" ? (
                    <button className="ghost" onClick={() => dispatch({ type: "person/status", personId: p.id, status: "active" })} title="Mark invite accepted"><CheckCircle2 />Accept</button>
                  ) : p.status === "suspended" ? (
                    <button className="ghost" onClick={() => dispatch({ type: "person/status", personId: p.id, status: "active" })}><CheckCircle2 />Reactivate</button>
                  ) : (
                    <button className="ghost" disabled={self} onClick={() => dispatch({ type: "person/status", personId: p.id, status: "suspended" })}><Ban />Suspend</button>
                  )}
                  <button className="icon-button" disabled={self} onClick={() => setRemoving(p)} aria-label={`Remove ${p.name}`}><Trash2 /></button>
                </div>
              </div>
            );
          })}
          {!rows.length ? <Empty title="No people match these filters">Try clearing the search or role filter.</Empty> : null}
        </div>
      </div>

      {inviting ? <InviteModal open onOpenChange={setInviting} defaultRoleId={roleFilter || undefined} /> : null}
      <Confirm
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They lose access immediately and any API keys they own are revoked."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (!removing) return;
          dispatch({ type: "person/remove", personId: removing.id });
          toast.success(`${removing.name} removed`);
        }}
      />
    </section>
  );
}
