import { ACTIONS } from "./types.ts";
import type {
  AccessState,
  Action,
  ApiKey,
  AuditEvent,
  Finding,
  GuardrailId,
  Person,
  PermissionSet,
  Resource,
  Role,
  Severity,
} from "./types.ts";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];

export const GUARDRAILS: Record<GuardrailId, { name: string; description: string }> = {
  "write-requires-view": {
    name: "Writes require visibility",
    description: "A role that can create, edit or delete a resource must also be able to view it.",
  },
  "member-escalation": {
    name: "No hidden privilege escalation",
    description: "Only built-in admin roles may create or edit members, because that grants roles.",
  },
  "audit-append-only": {
    name: "Audit log is append-only",
    description: "No role may create, edit or delete audit history.",
  },
  "separation-of-duties": {
    name: "Separation of duties",
    description: "A single role cannot both change billing and manage API credentials.",
  },
  "external-write": {
    name: "External members are read-only on sensitive data",
    description: "Roles assigned to people outside the workspace domain cannot write high-sensitivity resources.",
  },
  "sensitive-delete": {
    name: "Restrict destructive actions",
    description: "Deleting high-sensitivity resources is limited to built-in roles.",
  },
  "stale-keys": {
    name: "Rotate stale API keys",
    description: "Flag API keys that have not been used within the configured window.",
  },
};

export function normalize(permissions: PermissionSet, resources: Resource[]): PermissionSet {
  const out: PermissionSet = {};
  for (const r of resources) {
    const granted = new Set(permissions[r.id] ?? []);
    out[r.id] = ACTIONS.filter((a) => granted.has(a));
  }
  return out;
}

export function has(permissions: PermissionSet, resourceId: string, action: Action): boolean {
  return (permissions[resourceId] ?? []).includes(action);
}

export function grantCount(permissions: PermissionSet): number {
  return Object.values(permissions).reduce((n, a) => n + a.length, 0);
}

export type PermissionChange = { resourceId: string; action: Action; change: "added" | "removed" };

export function diffPermissions(before: PermissionSet, after: PermissionSet): PermissionChange[] {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: PermissionChange[] = [];
  for (const resourceId of ids) {
    for (const action of ACTIONS) {
      const was = has(before, resourceId, action);
      const is = has(after, resourceId, action);
      if (was !== is) changes.push({ resourceId, action, change: is ? "added" : "removed" });
    }
  }
  return changes;
}

export type Decision = {
  allowed: boolean;
  role?: Role;
  reason: string;
};

/** Evaluates whether a person can perform an action. `override` replaces one role's permissions (unsaved draft). */
export function evaluate(
  state: Pick<AccessState, "roles" | "resources">,
  person: Person | undefined,
  resourceId: string,
  action: Action,
  override?: { roleId: string; permissions: PermissionSet },
): Decision {
  if (!person) return { allowed: false, reason: "Unknown person." };
  const resource = state.resources.find((r) => r.id === resourceId);
  const role = state.roles.find((r) => r.id === person.roleId);
  const label = resource?.name.toLowerCase() ?? resourceId;
  if (!role) return { allowed: false, reason: `${person.name} has no role assigned.` };
  if (person.status === "suspended") {
    return { allowed: false, role, reason: `${person.name} is suspended, so every request is denied.` };
  }
  const permissions = override?.roleId === role.id ? override.permissions : role.permissions;
  const allowed = has(permissions, resourceId, action);
  return {
    allowed,
    role,
    reason: `${person.name} ${allowed ? "can" : "cannot"} ${action} ${label} through the ${role.name} role${
      person.status === "invited" ? " once the invitation is accepted" : ""
    }.`,
  };
}

function writes(permissions: PermissionSet, resourceId: string): Action[] {
  return (permissions[resourceId] ?? []).filter((a) => a !== "view");
}

export function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function isExternal(person: Person, domain: string): boolean {
  return domainOf(person.email) !== domain.toLowerCase();
}

/** Static analysis of one role's permissions against the enabled guardrails. */
export function analyzeRole(
  role: Role,
  permissions: PermissionSet,
  state: Pick<AccessState, "resources" | "people" | "guardrails" | "settings">,
): Finding[] {
  const on = state.guardrails;
  const findings: Finding[] = [];
  const add = (rule: GuardrailId, severity: Severity, title: string, detail: string, suffix = "") =>
    findings.push({ id: `${rule}:${role.id}${suffix}`, rule, severity, title, detail, roleId: role.id });
  const name = (id: string) => state.resources.find((r) => r.id === id)?.name ?? id;

  if (on["write-requires-view"]) {
    for (const r of state.resources) {
      const w = writes(permissions, r.id);
      if (w.length && !has(permissions, r.id, "view")) {
        add("write-requires-view", "medium", `${role.name} writes ${r.name} without viewing it`,
          `Grants ${w.join(", ")} on ${r.name} but not view. Blind writes are hard to audit.`, `:${r.id}`);
      }
    }
  }
  if (on["member-escalation"] && !role.system) {
    const w = writes(permissions, "members").filter((a) => a !== "delete");
    if (w.length) {
      add("member-escalation", "high", `${role.name} can escalate its own privileges`,
        `${name("members")} ${w.join(" and ")} lets holders assign any role, including Admin.`);
    }
  }
  if (on["audit-append-only"]) {
    const w = writes(permissions, "audit");
    if (w.length) {
      add("audit-append-only", "critical", `${role.name} can modify audit history`,
        `Grants ${w.join(", ")} on ${name("audit")}. Audit history must be append-only.`);
    }
  }
  if (on["separation-of-duties"] && !role.system) {
    const billing = writes(permissions, "billing").length > 0;
    const keys = writes(permissions, "keys").length > 0;
    if (billing && keys) {
      add("separation-of-duties", "high", `${role.name} combines billing and credential control`,
        `Changing ${name("billing")} and managing ${name("keys")} should belong to different roles.`);
    }
  }
  if (on["external-write"]) {
    const external = state.people.filter((p) => p.roleId === role.id && isExternal(p, state.settings.domain));
    if (external.length) {
      for (const r of state.resources.filter((x) => x.sensitivity === "high")) {
        const w = writes(permissions, r.id);
        if (w.length) {
          add("external-write", "high", `External members of ${role.name} can write ${r.name}`,
            `${external.map((p) => p.name).join(", ")} ${external.length === 1 ? "is" : "are"} outside ${state.settings.domain} and would gain ${w.join(", ")}.`,
            `:${r.id}`);
        }
      }
    }
  }
  if (on["sensitive-delete"] && !role.system) {
    for (const r of state.resources.filter((x) => x.sensitivity === "high" && x.id !== "audit")) {
      if (has(permissions, r.id, "delete")) {
        add("sensitive-delete", "medium", `${role.name} can delete ${r.name}`,
          `${r.name} is high sensitivity. Limit deletion to built-in administrator roles.`, `:${r.id}`);
      }
    }
  }
  return findings;
}

export function analyzeKeys(keys: ApiKey[], people: Person[], staleDays: number, now: Date): Finding[] {
  const cutoff = now.getTime() - staleDays * 86_400_000;
  return keys
    .filter((k) => (k.lastUsed ? Date.parse(k.lastUsed) : Date.parse(k.createdAt)) < cutoff)
    .map((k) => {
      const owner = people.find((p) => p.id === k.ownerId)?.name ?? "a removed member";
      return {
        id: `stale-keys:${k.id}`,
        rule: "stale-keys" as const,
        severity: "low" as const,
        title: `API key "${k.name}" looks abandoned`,
        detail: `Owned by ${owner}. ${k.lastUsed ? "Not used" : "Never used"} in the last ${staleDays} days. Revoke or rotate it.`,
        keyId: k.id,
      };
    });
}

export function analyzeWorkspace(state: AccessState, now: Date = new Date()): Finding[] {
  const findings = state.roles.flatMap((role) => analyzeRole(role, role.permissions, state));
  if (state.guardrails["stale-keys"]) {
    findings.push(...analyzeKeys(state.keys, state.people, state.settings.keyStaleDays, now));
  }
  return sortFindings(findings);
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

/** Findings that a proposed change would introduce and that are not already present. */
export function introducedFindings(before: Finding[], after: Finding[]): Finding[] {
  const existing = new Set(before.map((f) => f.id));
  return after.filter((f) => !existing.has(f.id));
}

export function needsApproval(introduced: Finding[]): boolean {
  return introduced.some((f) => f.severity === "critical" || f.severity === "high");
}

/** Compiles the visual model into a portable, versioned policy document. */
export function compilePolicy(state: AccessState, now: Date = new Date()) {
  return {
    format: "access-lens/policy@1",
    workspace: state.settings.workspaceName,
    environment: state.settings.environment,
    generatedAt: now.toISOString(),
    roles: state.roles.map((r) => ({
      name: r.name,
      version: r.version,
      grants: state.resources.flatMap((res) => (r.permissions[res.id] ?? []).map((a) => `${res.id}:${a}`)),
    })),
    bindings: state.people
      .filter((p) => p.status !== "suspended")
      .map((p) => ({ subject: p.email, role: state.roles.find((r) => r.id === p.roleId)?.name ?? null })),
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function auditToCsv(events: AuditEvent[]): string {
  const rows = [["time", "actor", "category", "summary", "detail"]];
  for (const e of events) rows.push([e.at, e.actor, e.category, e.summary, e.detail]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]!.toUpperCase()).join("");
}
