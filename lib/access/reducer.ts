import type {
  AccessState,
  AuditCategory,
  GuardrailId,
  PermissionSet,
  PersonStatus,
  Settings,
} from "./types.ts";
import { GUARDRAILS, diffPermissions, normalize } from "./engine.ts";

/** Every action carries a timestamp and a unique id stamped by the caller, which keeps the reducer pure. */
type Stamp = { at: string; uid: string };

export type AccessAction = Stamp &
  (
    | { type: "role/create"; name: string; description: string; color: string; copyFrom?: string }
    | { type: "role/update"; roleId: string; name: string; description: string; color: string }
    | { type: "role/duplicate"; roleId: string }
    | { type: "role/delete"; roleId: string; reassignTo: string }
    | { type: "role/save"; roleId: string; permissions: PermissionSet; note?: string }
    | { type: "request/create"; roleId: string; permissions: PermissionSet; reason: string }
    | { type: "request/resolve"; requestId: string; approve: boolean }
    | { type: "person/invite"; name: string; email: string; roleId: string }
    | { type: "person/role"; personId: string; roleId: string }
    | { type: "person/status"; personId: string; status: PersonStatus }
    | { type: "person/remove"; personId: string }
    | { type: "key/create"; name: string; ownerId: string; prefix: string }
    | { type: "key/revoke"; keyId: string }
    | { type: "key/rotate"; keyId: string; prefix: string }
    | { type: "guardrail/toggle"; id: GuardrailId; enabled: boolean }
    | { type: "settings/update"; patch: Partial<Settings> }
    | { type: "check/run" }
    | { type: "state/replace"; state: AccessState; reason: string }
  );

export type ActionInput = AccessAction extends infer A ? (A extends AccessAction ? Omit<A, "at" | "uid"> : never) : never;

const firstName = (name: string) => name.split(" ")[0] ?? name;

export function describeChanges(state: AccessState, before: PermissionSet, after: PermissionSet): string {
  const changes = diffPermissions(before, after);
  if (!changes.length) return "No permission changes";
  const name = (id: string) => state.resources.find((r) => r.id === id)?.name ?? id;
  return changes
    .map((c) => `${name(c.resourceId)}: ${c.action} ${c.change === "added" ? "allowed" : "removed"}`)
    .join("; ");
}

function log(state: AccessState, a: Stamp, category: AuditCategory, summary: string, detail: string): AccessState {
  const actor = state.settings.currentUser;
  const event = { id: `ev_${a.uid}`, at: a.at, actor, category, summary: `${firstName(actor)} ${summary}`, detail };
  return { ...state, audit: [event, ...state.audit] };
}

function applyPermissions(state: AccessState, roleId: string, permissions: PermissionSet, at: string): AccessState {
  return {
    ...state,
    roles: state.roles.map((r) =>
      r.id === roleId
        ? { ...r, permissions: normalize(permissions, state.resources), version: r.version + 1, updatedAt: at }
        : r,
    ),
  };
}

export function reducer(state: AccessState, action: AccessAction): AccessState {
  const roleName = (id: string) => state.roles.find((r) => r.id === id)?.name ?? "a removed role";
  const person = (id: string) => state.people.find((p) => p.id === id);

  switch (action.type) {
    case "role/create": {
      const source = state.roles.find((r) => r.id === action.copyFrom);
      const empty = Object.fromEntries(state.resources.map((r) => [r.id, []]));
      const role = {
        id: `role_${action.uid}`,
        name: action.name.trim(),
        description: action.description.trim() || "Custom role",
        color: action.color,
        permissions: normalize(source?.permissions ?? empty, state.resources),
        version: 1,
        updatedAt: action.at,
      };
      return log({ ...state, roles: [...state.roles, role] }, action, "role", `created ${role.name}`,
        source ? `Permissions copied from ${source.name}` : "Started with no permissions");
    }
    case "role/update": {
      const before = state.roles.find((r) => r.id === action.roleId);
      if (!before) return state;
      const next = {
        ...state,
        roles: state.roles.map((r) =>
          r.id === action.roleId
            ? { ...r, name: action.name.trim() || r.name, description: action.description.trim(), color: action.color, updatedAt: action.at }
            : r,
        ),
      };
      return log(next, action, "role", `updated ${before.name}`,
        before.name !== action.name.trim() ? `Renamed to ${action.name.trim()}` : "Details edited");
    }
    case "role/duplicate": {
      const source = state.roles.find((r) => r.id === action.roleId);
      if (!source) return state;
      const role = {
        ...source,
        id: `role_${action.uid}`,
        name: `${source.name} copy`,
        system: false,
        permissions: structuredClone(source.permissions),
        version: 1,
        updatedAt: action.at,
      };
      return log({ ...state, roles: [...state.roles, role] }, action, "role", `duplicated ${source.name}`, `Created ${role.name}`);
    }
    case "role/delete": {
      const role = state.roles.find((r) => r.id === action.roleId);
      if (!role || role.system || action.reassignTo === role.id) return state;
      const moved = state.people.filter((p) => p.roleId === role.id).length;
      const next: AccessState = {
        ...state,
        roles: state.roles.filter((r) => r.id !== role.id),
        people: state.people.map((p) => (p.roleId === role.id ? { ...p, roleId: action.reassignTo } : p)),
        requests: state.requests.map((r) => (r.roleId === role.id && r.status === "pending" ? { ...r, status: "rejected", resolvedBy: "System", resolvedAt: action.at } : r)),
      };
      return log(next, action, "role", `deleted ${role.name}`,
        moved ? `${moved} member${moved === 1 ? "" : "s"} moved to ${roleName(action.reassignTo)}` : "No members affected");
    }
    case "role/save": {
      const role = state.roles.find((r) => r.id === action.roleId);
      if (!role) return state;
      const detail = describeChanges(state, role.permissions, action.permissions);
      return log(applyPermissions(state, role.id, action.permissions, action.at), action, "role", `changed ${role.name}`,
        action.note ? `${detail} (${action.note})` : detail);
    }
    case "request/create": {
      const role = state.roles.find((r) => r.id === action.roleId);
      if (!role) return state;
      const request = {
        id: `cr_${action.uid}`,
        roleId: role.id,
        proposed: normalize(action.permissions, state.resources),
        baseVersion: role.version,
        requestedBy: state.settings.currentUser,
        at: action.at,
        reason: action.reason,
        status: "pending" as const,
      };
      return log({ ...state, requests: [request, ...state.requests] }, action, "policy",
        `requested approval for ${role.name}`, describeChanges(state, role.permissions, action.permissions));
    }
    case "request/resolve": {
      const request = state.requests.find((r) => r.id === action.requestId);
      if (!request || request.status !== "pending") return state;
      // Four-eyes rule: the requester can withdraw (reject) but never approve their own change.
      if (action.approve && request.requestedBy === state.settings.currentUser) return state;
      const resolved = {
        ...state,
        requests: state.requests.map((r) =>
          r.id === request.id
            ? { ...r, status: action.approve ? ("approved" as const) : ("rejected" as const), resolvedBy: state.settings.currentUser, resolvedAt: action.at }
            : r,
        ),
      };
      const name = roleName(request.roleId);
      if (!action.approve) return log(resolved, action, "policy", `rejected a change to ${name}`, request.reason);
      const role = state.roles.find((r) => r.id === request.roleId);
      if (!role) return resolved;
      const detail = describeChanges(state, role.permissions, request.proposed);
      return log(applyPermissions(resolved, role.id, request.proposed, action.at), action, "role",
        `approved a change to ${name}`, detail);
    }
    case "person/invite": {
      const email = action.email.trim().toLowerCase();
      if (state.people.some((p) => p.email === email)) return state;
      const invited = { id: `p_${action.uid}`, name: action.name.trim(), email, roleId: action.roleId, status: "invited" as const, lastActive: null };
      return log({ ...state, people: [...state.people, invited] }, action, "member", `invited ${invited.name}`,
        `${roleName(action.roleId)} role assigned`);
    }
    case "person/role": {
      const p = person(action.personId);
      if (!p || p.roleId === action.roleId) return state;
      const next = { ...state, people: state.people.map((x) => (x.id === p.id ? { ...x, roleId: action.roleId } : x)) };
      return log(next, action, "member", `moved ${p.name} to ${roleName(action.roleId)}`, `Previously ${roleName(p.roleId)}`);
    }
    case "person/status": {
      const p = person(action.personId);
      if (!p || p.status === action.status) return state;
      const next = { ...state, people: state.people.map((x) => (x.id === p.id ? { ...x, status: action.status } : x)) };
      const verb = action.status === "suspended" ? "suspended" : p.status === "suspended" ? "reactivated" : "activated";
      return log(next, action, "member", `${verb} ${p.name}`, `Status: ${p.status} → ${action.status}`);
    }
    case "person/remove": {
      const p = person(action.personId);
      if (!p) return state;
      const owned = state.keys.filter((k) => k.ownerId === p.id);
      const next = {
        ...state,
        people: state.people.filter((x) => x.id !== p.id),
        keys: state.keys.filter((k) => k.ownerId !== p.id),
      };
      return log(next, action, "member", `removed ${p.name}`,
        owned.length ? `${owned.length} API key${owned.length === 1 ? "" : "s"} revoked with the account` : `Was ${roleName(p.roleId)}`);
    }
    case "key/create": {
      const key = { id: `k_${action.uid}`, name: action.name.trim(), prefix: action.prefix, ownerId: action.ownerId, createdAt: action.at, lastUsed: null };
      return log({ ...state, keys: [key, ...state.keys] }, action, "key", `created key ${key.name}`,
        `Owner: ${person(action.ownerId)?.name ?? "unknown"}`);
    }
    case "key/revoke": {
      const key = state.keys.find((k) => k.id === action.keyId);
      if (!key) return state;
      return log({ ...state, keys: state.keys.filter((k) => k.id !== key.id) }, action, "key", `revoked key ${key.name}`, key.prefix);
    }
    case "key/rotate": {
      const key = state.keys.find((k) => k.id === action.keyId);
      if (!key) return state;
      const next = { ...state, keys: state.keys.map((k) => (k.id === key.id ? { ...k, prefix: action.prefix, createdAt: action.at, lastUsed: null } : k)) };
      return log(next, action, "key", `rotated key ${key.name}`, `${key.prefix} → ${action.prefix}`);
    }
    case "guardrail/toggle": {
      if (state.guardrails[action.id] === action.enabled) return state;
      const next = { ...state, guardrails: { ...state.guardrails, [action.id]: action.enabled } };
      return log(next, action, "policy", `${action.enabled ? "enabled" : "disabled"} ${GUARDRAILS[action.id].name}`,
        `Guardrail turned ${action.enabled ? "on" : "off"}`);
    }
    case "settings/update": {
      const changed = (Object.keys(action.patch) as (keyof Settings)[]).filter((k) => action.patch[k] !== state.settings[k]);
      if (!changed.length) return state;
      const next = { ...state, settings: { ...state.settings, ...action.patch } };
      return log(next, action, "settings", "updated workspace settings", changed.map((k) => `${k}: ${String(action.patch[k])}`).join("; "));
    }
    case "check/run":
      return { ...state, lastCheckAt: action.at };
    case "state/replace":
      return log({ ...action.state, lastCheckAt: action.at }, action, "settings", action.reason, `${action.state.roles.length} roles, ${action.state.people.length} people`);
  }
}

