export const ACTIONS = ["view", "create", "edit", "delete"] as const;
export type Action = (typeof ACTIONS)[number];

/** Resource id -> granted actions. */
export type PermissionSet = Record<string, Action[]>;

export type Sensitivity = "low" | "medium" | "high";
export type Severity = "critical" | "high" | "medium" | "low";

export type Resource = {
  id: string;
  name: string;
  description: string;
  sensitivity: Sensitivity;
};

export type Role = {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: PermissionSet;
  /** Built-in roles can be edited but not deleted. */
  system?: boolean;
  version: number;
  updatedAt: string;
};

export type PersonStatus = "active" | "invited" | "suspended";

export type Person = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  status: PersonStatus;
  lastActive: string | null;
};

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  ownerId: string;
  createdAt: string;
  lastUsed: string | null;
};

export type AuditCategory = "role" | "member" | "policy" | "key" | "settings";

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  category: AuditCategory;
  summary: string;
  detail: string;
};

export const GUARDRAIL_IDS = [
  "write-requires-view",
  "member-escalation",
  "audit-append-only",
  "separation-of-duties",
  "external-write",
  "sensitive-delete",
  "stale-keys",
] as const;
export type GuardrailId = (typeof GUARDRAIL_IDS)[number];

export type Finding = {
  id: string;
  rule: GuardrailId;
  severity: Severity;
  title: string;
  detail: string;
  roleId?: string;
  keyId?: string;
};

export type ChangeRequest = {
  id: string;
  roleId: string;
  proposed: PermissionSet;
  baseVersion: number;
  requestedBy: string;
  at: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  resolvedBy?: string;
  resolvedAt?: string;
};

export type Settings = {
  workspaceName: string;
  domain: string;
  environment: "Production" | "Staging" | "Development";
  requireApproval: boolean;
  keyStaleDays: number;
  currentUser: string;
};

export type AccessState = {
  schema: 1;
  resources: Resource[];
  roles: Role[];
  people: Person[];
  keys: ApiKey[];
  audit: AuditEvent[];
  guardrails: Record<GuardrailId, boolean>;
  requests: ChangeRequest[];
  settings: Settings;
  lastCheckAt: string;
};
