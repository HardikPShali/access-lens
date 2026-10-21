import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeRole, analyzeWorkspace, auditToCsv, compilePolicy, diffPermissions, evaluate, introducedFindings, needsApproval,
} from "../lib/access/engine.ts";
import { reducer } from "../lib/access/reducer.ts";
import { createSeed } from "../lib/access/seed.ts";

const NOW = new Date("2026-10-21T12:00:00Z");
let n = 0;
const stamp = () => ({ at: new Date(NOW.getTime() + ++n * 1000).toISOString(), uid: `t${n}` });
const run = (state, action) => reducer(state, { ...action, ...stamp() });
const person = (s, name) => s.people.find((p) => p.name === name);

test("seed workspace only flags the two stale API keys", () => {
  const findings = analyzeWorkspace(createSeed(NOW), NOW);
  assert.deepEqual(findings.map((f) => f.rule), ["stale-keys", "stale-keys"]);
});

test("evaluate honours role grants, suspension and draft overrides", () => {
  const s = createSeed(NOW);
  assert.equal(evaluate(s, person(s, "Jon Bell"), "keys", "create").allowed, true);
  assert.equal(evaluate(s, person(s, "Jon Bell"), "billing", "view").allowed, false);
  assert.equal(evaluate(s, person(s, "Iris Wong"), "projects", "view").allowed, false);
  const draft = { ...s.roles.find((r) => r.id === "builder").permissions, billing: ["view"] };
  assert.equal(evaluate(s, person(s, "Jon Bell"), "billing", "view", { roleId: "builder", permissions: draft }).allowed, true);
});

test("diffPermissions reports additions and removals", () => {
  const changes = diffPermissions({ a: ["view", "edit"] }, { a: ["view", "delete"], b: ["view"] });
  assert.deepEqual(changes.map((c) => `${c.resourceId}:${c.action}:${c.change}`).sort(), [
    "a:delete:added", "a:edit:removed", "b:view:added",
  ]);
});

test("guardrails catch escalation, audit tampering, external writes and separation of duties", () => {
  const s = createSeed(NOW);
  const builder = s.roles.find((r) => r.id === "builder");
  const guest = s.roles.find((r) => r.id === "guest");
  const rules = (role, perms) => analyzeRole(role, perms, s).map((f) => f.rule);

  assert.ok(rules(builder, { ...builder.permissions, members: ["view", "edit"] }).includes("member-escalation"));
  assert.ok(rules(builder, { ...builder.permissions, audit: ["view", "delete"] }).includes("audit-append-only"));
  assert.ok(rules(builder, { ...builder.permissions, billing: ["view", "edit"] }).includes("separation-of-duties"));
  assert.ok(rules(guest, { ...guest.permissions, billing: ["view", "edit"] }).includes("external-write"));
  assert.ok(rules(builder, { ...builder.permissions, deployments: ["create"] }).includes("write-requires-view"));
  // Built-in admin is allowed to manage members.
  const admin = s.roles.find((r) => r.id === "admin");
  assert.deepEqual(rules(admin, admin.permissions), []);
});

test("disabled guardrails produce no findings", () => {
  const s = run(createSeed(NOW), { type: "guardrail/toggle", id: "member-escalation", enabled: false });
  const builder = s.roles.find((r) => r.id === "builder");
  assert.deepEqual(analyzeRole(builder, { ...builder.permissions, members: ["view", "edit"] }, s), []);
});

test("high-risk changes need approval and requesters cannot self-approve", () => {
  let s = createSeed(NOW);
  const builder = s.roles.find((r) => r.id === "builder");
  const proposed = { ...builder.permissions, members: ["view", "edit"] };
  const introduced = introducedFindings(analyzeRole(builder, builder.permissions, s), analyzeRole(builder, proposed, s));
  assert.equal(needsApproval(introduced), true);

  s = run(s, { type: "request/create", roleId: "builder", permissions: proposed, reason: "Team leads invite contractors" });
  const request = s.requests[0];
  assert.equal(request.status, "pending");

  const same = run(s, { type: "request/resolve", requestId: request.id, approve: true });
  assert.equal(same.requests[0].status, "pending", "self-approval is blocked");

  s = run(s, { type: "settings/update", patch: { currentUser: "Maya Chen" } });
  s = run(s, { type: "request/resolve", requestId: request.id, approve: true });
  const updated = s.roles.find((r) => r.id === "builder");
  assert.equal(s.requests[0].status, "approved");
  assert.deepEqual(updated.permissions.members, ["view", "edit"]);
  assert.equal(updated.version, builder.version + 1);
  assert.match(s.audit[0].summary, /^Maya approved a change to Builder/);
});

test("role lifecycle: create, save, delete with reassignment", () => {
  let s = createSeed(NOW);
  s = run(s, { type: "role/create", name: "Support", description: "", color: "#000", copyFrom: "analyst" });
  const support = s.roles.at(-1);
  assert.equal(support.name, "Support");
  assert.deepEqual(support.permissions.billing, ["view"]);

  s = run(s, { type: "person/role", personId: "p4", roleId: support.id });
  s = run(s, { type: "role/save", roleId: support.id, permissions: { ...support.permissions, projects: ["view", "edit"] } });
  assert.match(s.audit[0].detail, /Projects: edit allowed/);

  s = run(s, { type: "role/delete", roleId: support.id, reassignTo: "guest" });
  assert.equal(s.roles.some((r) => r.id === support.id), false);
  assert.equal(s.people.find((p) => p.id === "p4").roleId, "guest");

  assert.equal(run(s, { type: "role/delete", roleId: "admin", reassignTo: "guest" }).roles.length, s.roles.length, "built-in roles survive");
});

test("people: invite, duplicate email guard, removal revokes owned keys", () => {
  let s = createSeed(NOW);
  s = run(s, { type: "person/invite", name: "Alex Morgan", email: "Alex@Northstar.io", roleId: "builder" });
  assert.equal(s.people.at(-1).email, "alex@northstar.io");
  assert.equal(s.people.at(-1).status, "invited");
  const count = s.people.length;
  assert.equal(run(s, { type: "person/invite", name: "Dup", email: "alex@northstar.io", roleId: "guest" }).people.length, count);

  s = run(s, { type: "person/remove", personId: "p4" });
  assert.equal(s.keys.some((k) => k.ownerId === "p4"), false);
});

test("compiled policy and CSV export", () => {
  const s = createSeed(NOW);
  const policy = compilePolicy(s, NOW);
  assert.equal(policy.format, "access-lens/policy@1");
  assert.ok(policy.roles.find((r) => r.name === "Builder").grants.includes("keys:create"));
  assert.equal(policy.bindings.some((b) => b.subject === "iris@northstar.io"), false, "suspended people are unbound");

  const csv = auditToCsv([{ id: "x", at: "t", actor: "A", category: "role", summary: 'He said "hi", ok', detail: "d" }]);
  assert.equal(csv.split("\n")[1], 't,A,role,"He said ""hi"", ok",d');
});
