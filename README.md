# Access Lens

Access Lens is a visual workspace for designing, testing and auditing role-based access before permission mistakes reach production.

## The problem

Access control is usually spread across policy files, database rows and tribal knowledge. That makes a small permission change difficult to review and easy to get wrong. Access Lens gives product, security and engineering teams one understandable view of the system.

## Product capabilities

- **Roles** – search, create (blank or copied), rename, recolor, duplicate and delete roles (members are reassigned). Edit a permission matrix across six resources; unsaved drafts are kept per role, highlighted cell by cell and reviewable in one "View changes" diff.
- **Least-privilege analysis** – seven guardrails (privilege escalation, append-only audit log, separation of duties, external-member writes, destructive actions, blind writes, stale API keys) run live against saved roles and drafts.
- **Approvals** – changes that introduce high or critical findings become change requests that a *different* admin must approve (four-eyes rule).
- **Permission simulator** – check whether any person can perform an action, optionally including unsaved drafts, and see how many people hold that access.
- **People** – invite (with external-domain warnings), change roles, suspend, reactivate, accept invites and remove members; filter by role, status or text.
- **Policies** – severity summary, findings with one-click fixes, guardrail toggles, an effective-access overview and export of a compiled, versioned policy JSON.
- **Audit log** – every change is recorded; filter by category, actor or text, grouped by day, exportable as CSV.
- **Settings** – workspace identity, company domain, approval policy, stale-key window, "acting as" admin switch, API key create/rotate/revoke, backup export/import (validated) and demo reset.
- **⌘K command palette**, hash-based navigation, mobile tab bar, keyboard focus styles and reduced-motion support.

## Engineering decisions

- The domain lives in `lib/access/` as plain TypeScript: `engine.ts` (evaluation, diffing, guardrail analysis, policy compilation), `reducer.ts` (pure state transitions that also write the audit trail) and `seed.ts` (synthetic workspace).
- `components/access/store.tsx` wraps the reducer in React context, persists to `localStorage` and validates imports with Zod.
- Findings are derived from state rather than stored, so they can never drift from the permissions they describe.
- The app renders client-side only after mount, which avoids hydration mismatches with browser-stored data.
- Radix primitives (Checkbox, Dialog, Switch) and cmdk provide accessible controls.

## Run locally

```bash
npm ci
npm run dev
```

## Verify

```bash
npm run build
npm run lint
npm test   # builds, then runs the engine and reducer tests in tests/
```

## Next step

A production version would compile the visual policy into a versioned authorization model, evaluate it server-side and require approval for changes that introduce privilege escalation.
