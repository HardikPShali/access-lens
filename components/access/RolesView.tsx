"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, Clock3, Copy, Eraser, Eye, LockKeyhole, Pencil, Plus,
  RotateCcw, Search, ShieldAlert, Trash2, X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Confirm, Modal } from "@/components/ui/dialog";
import {
  analyzeRole, diffPermissions, evaluate, has, introducedFindings, isExternal, needsApproval, normalize,
} from "@/lib/access/engine";
import { ACTIONS, type Action, type PermissionSet, type Role } from "@/lib/access/types";
import { Avatar, RoleFormModal, roleIdFor, SeverityBadge, timeAgo, type View } from "./shared";
import { useAccess } from "./store";

export type Drafts = Record<string, PermissionSet>;

type Props = {
  selectedRoleId: string;
  onSelectRole: (id: string) => void;
  drafts: Drafts;
  setDrafts: React.Dispatch<React.SetStateAction<Drafts>>;
  navigate: (view: View, opts?: { roleFilter?: string }) => void;
  onCreateRole: () => void;
};

export function RolesView({ selectedRoleId, onSelectRole, drafts, setDrafts, navigate, onCreateRole }: Props) {
  const { state, findings, dispatch } = useAccess();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reassignTo, setReassignTo] = useState("");
  const [approval, setApproval] = useState<null | { reason: string }>(null);

  const role = state.roles.find((r) => r.id === selectedRoleId) ?? state.roles[0]!;
  const permissions = drafts[role.id] ?? role.permissions;
  const dirty = diffPermissions(role.permissions, permissions).length > 0;
  const members = state.people.filter((p) => p.roleId === role.id);
  const fallbackRoleId = (state.roles.find((r) => r.id !== role.id && !r.system) ?? state.roles.find((r) => r.id !== role.id))?.id ?? "";
  const pending = state.requests.find((r) => r.roleId === role.id && r.status === "pending");

  const savedFindings = useMemo(() => analyzeRole(role, role.permissions, state), [role, state]);
  const draftFindings = useMemo(() => analyzeRole(role, permissions, state), [role, permissions, state]);
  const introduced = introducedFindings(savedFindings, draftFindings);
  const gated = state.settings.requireApproval && needsApproval(introduced);

  const visibleRoles = state.roles.filter((r) =>
    `${r.name} ${r.description}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const setDraft = (next: PermissionSet) => {
    const normalized = normalize(next, state.resources);
    setDrafts((d) => {
      const copy = { ...d };
      if (diffPermissions(role.permissions, normalized).length) copy[role.id] = normalized;
      else delete copy[role.id];
      return copy;
    });
  };

  const toggle = (resourceId: string, action: Action, checked: boolean) => {
    const current = permissions[resourceId] ?? [];
    let next = checked ? [...current, action] : current.filter((a) => a !== action);
    // Removing view also removes writes that depend on it; granting a write implies view.
    if (!checked && action === "view") next = [];
    if (checked && action !== "view" && !next.includes("view")) next = ["view", ...next];
    setDraft({ ...permissions, [resourceId]: next });
  };

  const toggleRow = (resourceId: string) => {
    const full = ACTIONS.every((a) => has(permissions, resourceId, a));
    setDraft({ ...permissions, [resourceId]: full ? [] : [...ACTIONS] });
  };

  const discard = () => setDrafts((d) => {
    const copy = { ...d };
    delete copy[role.id];
    return copy;
  });

  const save = () => {
    if (gated) {
      setApproval({ reason: "" });
      return;
    }
    dispatch({ type: "role/save", roleId: role.id, permissions });
    discard();
    toast.success(`${role.name} saved`, { description: `Version ${role.version + 1} is now live.` });
  };

  const submitRequest = () => {
    if (!approval) return;
    dispatch({ type: "request/create", roleId: role.id, permissions, reason: approval.reason.trim() || "No reason given" });
    discard();
    setApproval(null);
    toast("Sent for approval", { description: "Review it under Policies → Pending approvals." });
  };

  return (
    <section className="main-grid">
      <aside className="roles" aria-label="Roles">
        <div className="panel-title"><span>Roles</span><b>{state.roles.length}</b></div>
        <label><Search /><input placeholder="Find a role" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Find a role" /></label>
        <div className="role-list">
          {visibleRoles.map((r) => {
            const count = state.people.filter((p) => p.roleId === r.id).length;
            return (
              <button key={r.id} className={r.id === role.id ? "role selected" : "role"} onClick={() => onSelectRole(r.id)} aria-current={r.id === role.id}>
                <i style={{ background: r.color }}>{r.name[0]}</i>
                <span><b>{r.name}{drafts[r.id] ? <em className="dot" title="Unsaved changes" /> : null}</b><small>{count} member{count === 1 ? "" : "s"}</small></span>
                <ChevronDown />
              </button>
            );
          })}
          {!visibleRoles.length ? <p className="muted-note">No roles match “{query}”.</p> : null}
        </div>
        <button className="add-role" onClick={onCreateRole}><Plus />Create role</button>
      </aside>

      <section className="matrix">
        <div className="matrix-head">
          <div>
            <span className="role-mark" style={{ background: role.color }}>{role.name[0]}</span>
            <div>
              <h2>{role.name} {role.system ? <span className="tag">Built-in</span> : null}</h2>
              <p>{role.description} · v{role.version} · updated {timeAgo(role.updatedAt)}</p>
            </div>
          </div>
          <div className="matrix-actions">
            <button className="icon-button" onClick={() => setEditing(true)} aria-label="Edit role details" title="Edit details"><Pencil /></button>
            <button className="icon-button" onClick={() => { onSelectRole(roleIdFor(dispatch({ type: "role/duplicate", roleId: role.id }))); toast.success(`Duplicated ${role.name}`); }} aria-label="Duplicate role" title="Duplicate"><Copy /></button>
            <button className="icon-button" onClick={() => setDeleting(true)} disabled={role.system || state.roles.length < 2} aria-label="Delete role" title={role.system ? "Built-in roles cannot be deleted" : "Delete"}><Trash2 /></button>
            {dirty ? <button className="ghost" onClick={discard}><RotateCcw />Discard</button> : null}
            <button className="save" onClick={save} disabled={!dirty}>
              {!dirty ? <><Check />Saved</> : gated ? <><ShieldAlert />Request approval</> : <>Save changes</>}
            </button>
          </div>
        </div>

        {pending ? (
          <div className="scope-note pending">
            <Clock3 />
            <p><b>Change awaiting approval</b><span>Requested by {pending.requestedBy} {timeAgo(pending.at)}.</span></p>
            <button className="text-button inline" onClick={() => navigate("policies")}>Review <ArrowRight /></button>
          </div>
        ) : null}

        <div className={draftFindings.length ? "scope-note risky" : "scope-note"}>
          {draftFindings.length ? <AlertTriangle /> : <LockKeyhole />}
          <p>
            <b>Least privilege check</b>
            <span>
              {draftFindings.length
                ? `${draftFindings.length} issue${draftFindings.length === 1 ? "" : "s"}${dirty ? " in this draft" : ""}: ${draftFindings[0]!.title}${draftFindings.length > 1 ? " and more" : ""}.`
                : "This role has no high-risk permission combinations."}
            </span>
          </p>
        </div>
        {introduced.length ? (
          <ul className="introduced">
            {introduced.map((f) => <li key={f.id}><SeverityBadge severity={f.severity} /><span><b>{f.title}</b><small>{f.detail}</small></span></li>)}
          </ul>
        ) : null}

        <div className="matrix-tools">
          <span>{members.length} member{members.length === 1 ? "" : "s"} affected by edits</span>
          <div>
            <button className="ghost" onClick={() => setDraft(Object.fromEntries(state.resources.map((r) => [r.id, ["view"]])))}><Eye />Read-only</button>
            <button className="ghost" onClick={() => setDraft({})}><Eraser />Clear all</button>
          </div>
        </div>

        <div className="permission-table" role="table" aria-label={`${role.name} permissions`}>
          <div className="table-row table-head" role="row"><span role="columnheader">Resource</span>{ACTIONS.map((a) => <span key={a} role="columnheader">{a}</span>)}</div>
          {state.resources.map((r) => (
            <div className="table-row" key={r.id} role="row">
              <strong role="rowheader">
                <button className="row-toggle" onClick={() => toggleRow(r.id)} title="Toggle all actions">{r.name}</button>
                {r.sensitivity === "high" ? <span className="tag tag-high">Sensitive</span> : null}
                <small>{r.description}</small>
              </strong>
              {ACTIONS.map((a) => {
                const on = has(permissions, r.id, a);
                const changed = on !== has(role.permissions, r.id, a);
                return (
                  <label key={a} className={changed ? (on ? "cell added" : "cell removed") : "cell"} role="cell">
                    <Checkbox checked={on} onCheckedChange={(v) => toggle(r.id, a, v === true)} className="permission-box" aria-label={`${a} ${r.name}`} />
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <Simulator draftRoleId={dirty ? role.id : undefined} draft={permissions} />
      </section>

      <aside className="context">
        <section>
          <div className="panel-title"><span>Members</span><b>{members.length}</b></div>
          {members.slice(0, 5).map((p) => (
            <div className="person" key={p.id}>
              <Avatar name={p.name} />
              <p><b>{p.name}{isExternal(p, state.settings.domain) ? <span className="tag">External</span> : null}</b><small>{p.email}{p.status !== "active" ? ` · ${p.status}` : ""}</small></p>
            </div>
          ))}
          {!members.length ? <p className="muted-note">Nobody has this role yet.</p> : null}
          {members.length > 5 ? <p className="muted-note">+{members.length - 5} more</p> : null}
          <button className="text-button" onClick={() => navigate("people", { roleFilter: role.id })}>Manage members <ArrowRight /></button>
        </section>
        <section>
          <div className="panel-title"><span>Recent activity</span><Clock3 /></div>
          {state.audit.slice(0, 3).map((a) => (
            <div className="audit" key={a.id}><time>{timeAgo(a.at).replace(" ago", "")}</time><p><b>{a.summary}</b><small>{a.detail}</small></p></div>
          ))}
          <button className="text-button" onClick={() => navigate("audit")}>Open audit log <ArrowRight /></button>
        </section>
        <Recommendations onOpen={() => navigate("policies")} count={findings.length} first={findings[0]?.title} />
      </aside>

      {editing ? <RoleFormModal open onOpenChange={setEditing} role={role} /> : null}
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${role.name}?`}
        description="This cannot be undone. Pending approvals for this role are rejected."
        confirmLabel="Delete role"
        danger
        onConfirm={() => {
          const target = state.roles.some((r) => r.id === reassignTo && r.id !== role.id) ? reassignTo : fallbackRoleId;
          dispatch({ type: "role/delete", roleId: role.id, reassignTo: target });
          discard();
          onSelectRole(target);
          toast.success(`${role.name} deleted`);
        }}
      >
        {members.length ? (
          <label className="form">
            Move {members.length} member{members.length === 1 ? "" : "s"} to
            <select value={reassignTo || fallbackRoleId} onChange={(e) => setReassignTo(e.target.value)}>
              {state.roles.filter((r) => r.id !== role.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        ) : <p className="muted-note">No members are assigned to this role.</p>}
      </Confirm>
      <Modal
        open={approval !== null}
        onOpenChange={(o) => !o && setApproval(null)}
        title="Approval required"
        description="This change introduces high-risk access. A second admin must approve it before it goes live."
        footer={<><button className="secondary" onClick={() => setApproval(null)}>Keep editing</button><button className="primary" onClick={submitRequest}>Submit request</button></>}
      >
        <ul className="introduced">
          {introduced.map((f) => <li key={f.id}><SeverityBadge severity={f.severity} /><span><b>{f.title}</b><small>{f.detail}</small></span></li>)}
        </ul>
        <label className="form">
          Reason for change
          <textarea rows={3} value={approval?.reason ?? ""} onChange={(e) => setApproval({ reason: e.target.value })} placeholder="Why does this role need the extra access?" />
        </label>
      </Modal>
    </section>
  );
}

function Recommendations({ count, first, onOpen }: { count: number; first?: string; onOpen: () => void }) {
  if (!count) {
    return <section className="warning ok"><Check /><div><b>No recommendations</b><p>All guardrails pass.</p></div></section>;
  }
  return (
    <section className="warning">
      <AlertTriangle />
      <div>
        <b>{count} recommendation{count === 1 ? "" : "s"}</b>
        <p>{first}</p>
        <button onClick={onOpen}>Review findings</button>
      </div>
    </section>
  );
}

function Simulator({ draftRoleId, draft }: { draftRoleId?: string; draft: PermissionSet }) {
  const { state } = useAccess();
  const [personId, setPersonId] = useState(state.people.find((p) => p.status === "active" && p.roleId !== "admin")?.id ?? state.people[0]?.id ?? "");
  const [resourceId, setResourceId] = useState(state.resources.find((r) => r.id === "keys")?.id ?? state.resources[0]!.id);
  const [action, setAction] = useState<Action>("create");
  const [useDraft, setUseDraft] = useState(true);

  const person = state.people.find((p) => p.id === personId) ?? state.people[0];
  const override = useDraft && draftRoleId ? { roleId: draftRoleId, permissions: draft } : undefined;
  const decision = evaluate(state, person, resourceId, action, override);
  const affected = override && person?.roleId === draftRoleId;
  const allowedCount = state.people.filter((p) => evaluate(state, p, resourceId, action, override).allowed).length;
  const resourceName = state.resources.find((r) => r.id === resourceId)?.name.toLowerCase();

  if (!person) return null;
  return (
    <section className="simulator" aria-label="Permission simulator">
      <div className="sim-head">
        <div><span>Permission simulator</span><p>Test access before assigning or saving a role.</p></div>
        <span className="lab">SAFE TEST</span>
      </div>
      <div className="sim-controls">
        <label>Person<select value={person.id} onChange={(e) => setPersonId(e.target.value)}>{state.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label>Resource<select value={resourceId} onChange={(e) => setResourceId(e.target.value)}>{state.resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Action<select value={action} onChange={(e) => setAction(e.target.value as Action)}>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select></label>
      </div>
      {draftRoleId ? (
        <label className="sim-toggle"><Checkbox checked={useDraft} onCheckedChange={(v) => setUseDraft(v === true)} className="permission-box" />Include unsaved changes</label>
      ) : null}
      <div className={decision.allowed ? "sim-result allowed" : "sim-result denied"} role="status" aria-live="polite">
        <span>{decision.allowed ? <Check /> : <X />}</span>
        <p>
          <b>{decision.allowed ? "Access allowed" : "Access denied"}{affected ? " (draft)" : ""}</b>
          <small>{decision.reason}</small>
        </p>
      </div>
      <p className="sim-foot">{allowedCount} of {state.people.length} people can {action} {resourceName}.</p>
    </section>
  );
}

export function ChangesModal({ open, onOpenChange, drafts, onOpenRole, onDiscardAll }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: Drafts;
  onOpenRole: (id: string) => void;
  onDiscardAll: () => void;
}) {
  const { state } = useAccess();
  const entries = Object.entries(drafts)
    .map(([id, perms]) => ({ role: state.roles.find((r) => r.id === id), perms }))
    .filter((e): e is { role: Role; perms: PermissionSet } => !!e.role);
  const name = (id: string) => state.resources.find((r) => r.id === id)?.name ?? id;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Unsaved changes" description="Review every pending edit before it goes live." wide
      footer={entries.length ? <><button className="secondary" onClick={onDiscardAll}>Discard all</button><button className="primary" onClick={() => onOpenChange(false)}>Done</button></> : undefined}>
      {!entries.length ? <p className="muted-note">There are no unsaved changes. Edit a role&apos;s permission matrix to start a draft.</p> : null}
      {entries.map(({ role, perms }) => (
        <section key={role.id} className="diff">
          <header><b><i style={{ background: role.color }} />{role.name}</b><button className="text-button inline" onClick={() => { onOpenRole(role.id); onOpenChange(false); }}>Open <ArrowRight /></button></header>
          <ul>
            {diffPermissions(role.permissions, perms).map((c) => (
              <li key={`${c.resourceId}:${c.action}`} className={c.change}>
                {c.change === "added" ? "+" : "−"} {name(c.resourceId)} · {c.action}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
