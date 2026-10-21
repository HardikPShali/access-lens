import { GUARDRAIL_IDS } from "./types.ts";
import type { AccessState, GuardrailId } from "./types.ts";

const DAY = 86_400_000;

/** Synthetic workspace so the app runs without credentials. Times are relative to `now`. */
export function createSeed(now: Date = new Date()): AccessState {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const min = 60_000;
  const actor = "Hardik Shali";

  return {
    schema: 1,
    resources: [
      { id: "projects", name: "Projects", description: "Workspace projects and boards", sensitivity: "low" },
      { id: "deployments", name: "Deployments", description: "Releases to production", sensitivity: "medium" },
      { id: "billing", name: "Billing", description: "Invoices and payment methods", sensitivity: "high" },
      { id: "members", name: "Members", description: "People and role assignments", sensitivity: "high" },
      { id: "keys", name: "API keys", description: "Workspace credentials", sensitivity: "high" },
      { id: "audit", name: "Audit log", description: "Immutable access history", sensitivity: "high" },
    ],
    roles: [
      {
        id: "admin", name: "Admin", description: "Full workspace control", color: "#6548dd", system: true,
        version: 7, updatedAt: ago(9 * DAY),
        permissions: {
          projects: ["view", "create", "edit", "delete"], deployments: ["view", "create", "edit", "delete"],
          billing: ["view", "edit"], members: ["view", "create", "edit", "delete"],
          keys: ["view", "create", "delete"], audit: ["view"],
        },
      },
      {
        id: "builder", name: "Builder", description: "Creates and ships product work", color: "#087d68",
        version: 4, updatedAt: ago(42 * min),
        permissions: {
          projects: ["view", "create", "edit"], deployments: ["view", "create"], billing: [],
          members: ["view"], keys: ["view", "create"], audit: [],
        },
      },
      {
        id: "analyst", name: "Analyst", description: "Reads product and usage data", color: "#ad5c16",
        version: 3, updatedAt: ago(DAY),
        permissions: {
          projects: ["view"], deployments: ["view"], billing: ["view"], members: ["view"], keys: [], audit: ["view"],
        },
      },
      {
        id: "guest", name: "Guest", description: "Limited project visibility", color: "#59606c",
        version: 1, updatedAt: ago(30 * DAY),
        permissions: { projects: ["view"], deployments: [], billing: [], members: [], keys: [], audit: [] },
      },
    ],
    people: [
      { id: "p1", name: "Maya Chen", email: "maya@northstar.io", roleId: "admin", status: "active", lastActive: ago(5 * min) },
      { id: "p2", name: "Hardik Shali", email: "hardik@northstar.io", roleId: "admin", status: "active", lastActive: ago(min) },
      { id: "p3", name: "Leo Park", email: "leo@northstar.io", roleId: "admin", status: "active", lastActive: ago(3 * DAY) },
      { id: "p4", name: "Jon Bell", email: "jon@northstar.io", roleId: "builder", status: "active", lastActive: ago(20 * min) },
      { id: "p5", name: "Ana Ortiz", email: "ana@northstar.io", roleId: "builder", status: "active", lastActive: ago(2 * 3_600_000) },
      { id: "p6", name: "Sam Patel", email: "sam@northstar.io", roleId: "builder", status: "invited", lastActive: null },
      { id: "p7", name: "Nina Shah", email: "nina@northstar.io", roleId: "analyst", status: "active", lastActive: ago(DAY) },
      { id: "p8", name: "Iris Wong", email: "iris@northstar.io", roleId: "analyst", status: "suspended", lastActive: ago(40 * DAY) },
      { id: "p9", name: "Owen Reed", email: "owen@partner.co", roleId: "guest", status: "active", lastActive: ago(4 * DAY) },
      { id: "p10", name: "Kai Müller", email: "kai@agency.dev", roleId: "guest", status: "invited", lastActive: null },
    ],
    keys: [
      { id: "k1", name: "CI deploy bot", prefix: "al_live_3f9a", ownerId: "p4", createdAt: ago(120 * DAY), lastUsed: ago(2 * 3_600_000) },
      { id: "k2", name: "Legacy analytics export", prefix: "al_live_81c2", ownerId: "p7", createdAt: ago(400 * DAY), lastUsed: ago(130 * DAY) },
      { id: "k3", name: "Old staging token", prefix: "al_test_d044", ownerId: "p3", createdAt: ago(200 * DAY), lastUsed: null },
      { id: "k4", name: "Billing webhook", prefix: "al_live_5be7", ownerId: "p1", createdAt: ago(60 * DAY), lastUsed: ago(DAY) },
    ],
    audit: [
      { id: "a1", at: ago(42 * min), actor: "Maya Chen", category: "role", summary: "Maya changed Builder", detail: "API keys: create allowed" },
      { id: "a2", at: ago(2 * 3_600_000), actor: "Jon Bell", category: "member", summary: "Jon invited Sam Patel", detail: "Builder role assigned" },
      { id: "a3", at: ago(DAY), actor: "Maya Chen", category: "role", summary: "Maya changed Analyst", detail: "Billing: edit removed" },
      { id: "a4", at: ago(4 * DAY), actor: actor, category: "member", summary: "Hardik invited Kai Müller", detail: "Guest role assigned" },
      { id: "a5", at: ago(9 * DAY), actor: "Leo Park", category: "role", summary: "Leo changed Admin", detail: "Audit log: delete removed" },
      { id: "a6", at: ago(12 * DAY), actor: "Maya Chen", category: "member", summary: "Maya suspended Iris Wong", detail: "Left the company" },
      { id: "a7", at: ago(20 * DAY), actor: actor, category: "policy", summary: "Hardik enabled Separation of duties", detail: "Guardrail turned on" },
    ],
    guardrails: Object.fromEntries(GUARDRAIL_IDS.map((id) => [id, true])) as Record<GuardrailId, boolean>,
    requests: [],
    settings: {
      workspaceName: "Northstar Labs",
      domain: "northstar.io",
      environment: "Production",
      requireApproval: true,
      keyStaleDays: 90,
      currentUser: actor,
    },
    lastCheckAt: ago(4 * min),
  };
}
