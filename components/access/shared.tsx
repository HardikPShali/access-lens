"use client";

import { useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Modal } from "@/components/ui/dialog";
import { initials } from "@/lib/access/engine";
import type { Role, Severity } from "@/lib/access/types";
import { useAccess } from "./store";

export const ROLE_COLORS = ["#6548dd", "#087d68", "#ad5c16", "#59606c", "#c94343", "#1f6fd1", "#a23f8f", "#2f7d32"];

/** Mirrors the id scheme the reducer uses for created and duplicated roles. */
export const roleIdFor = (uid: string) => `role_${uid}`;

export type View = "roles" | "people" | "policies" | "audit" | "settings";

export function timeAgo(at: string | null): string {
  if (!at) return "Never";
  const ms = Date.now() - Date.parse(at);
  if (ms < 60_000) return "Just now";
  return `${formatDistanceToNowStrict(new Date(at))} ago`;
}

export function Avatar({ name, tone }: { name: string; tone?: string }) {
  return (
    <span className="avatar" style={tone ? { background: tone, color: "#fff" } : undefined} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function RoleChip({ role }: { role?: Role }) {
  if (!role) return <span className="chip">No role</span>;
  return (
    <span className="chip">
      <i style={{ background: role.color }} />
      {role.name}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={`sev sev-${severity}`}>{severity}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

type RoleFormProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role;
  onCreated?: (roleId: string, roleName: string) => void;
};

/** Create a role, or edit an existing role's details when `role` is given. */
export function RoleFormModal({ open, onOpenChange, role, onCreated }: RoleFormProps) {
  const { state, dispatch } = useAccess();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? ROLE_COLORS[(state.roles.length + 1) % ROLE_COLORS.length]!);
  const [copyFrom, setCopyFrom] = useState("");
  const trimmed = name.trim();
  const duplicate = state.roles.some((r) => r.id !== role?.id && r.name.toLowerCase() === trimmed.toLowerCase());
  const valid = trimmed.length >= 2 && trimmed.length <= 32 && !duplicate;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (role) dispatch({ type: "role/update", roleId: role.id, name: trimmed, description, color });
    else {
      const uid = dispatch({ type: "role/create", name: trimmed, description, color, copyFrom: copyFrom || undefined });
      onCreated?.(roleIdFor(uid), trimmed);
    }
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={role ? `Edit ${role.name}` : "Create role"}
      description={role ? "Update how this role is presented to your team." : "New roles start with no access unless you copy an existing role."}>
      <form className="form" onSubmit={submit} id="role-form">
        <label>
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Support lead" maxLength={32} aria-invalid={duplicate} />
          {duplicate ? <small className="error">A role with this name already exists.</small> : null}
        </label>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this role for?" maxLength={80} />
        </label>
        {!role ? (
          <label>
            Start from
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">No permissions</option>
              {state.roles.map((r) => <option key={r.id} value={r.id}>Copy of {r.name}</option>)}
            </select>
          </label>
        ) : null}
        <fieldset>
          <legend>Color</legend>
          <div className="swatches">
            {ROLE_COLORS.map((c) => (
              <button type="button" key={c} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => onOpenChange(false)}>Cancel</button>
          <button className="primary" disabled={!valid}>{role ? "Save details" : "Create role"}</button>
        </div>
      </form>
    </Modal>
  );
}

type InviteProps = { open: boolean; onOpenChange: (open: boolean) => void; defaultRoleId?: string };

export function InviteModal({ open, onOpenChange, defaultRoleId }: InviteProps) {
  const { state, dispatch } = useAccess();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(defaultRoleId ?? state.roles.find((r) => !r.system)?.id ?? state.roles[0]!.id);
  const normalized = email.trim().toLowerCase();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  const exists = state.people.some((p) => p.email === normalized);
  const external = emailOk && !normalized.endsWith(`@${state.settings.domain}`);
  const valid = name.trim().length >= 2 && emailOk && !exists;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    dispatch({ type: "person/invite", name, email: normalized, roleId });
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Invite person" description="They receive the role's access once they accept.">
      <form className="form" onSubmit={submit}>
        <label>
          Full name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Morgan" maxLength={60} />
        </label>
        <label>
          Work email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`alex@${state.settings.domain}`} aria-invalid={exists} />
          {exists ? <small className="error">This person is already in the workspace.</small> : null}
          {external && !exists ? <small className="hint">Outside {state.settings.domain}. External-member guardrails apply.</small> : null}
        </label>
        <label>
          Role
          <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {state.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={() => onOpenChange(false)}>Cancel</button>
          <button className="primary" disabled={!valid}>Send invite</button>
        </div>
      </form>
    </Modal>
  );
}
