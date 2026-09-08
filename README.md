# Access Lens

Access Lens is a visual workspace for designing, testing and auditing role-based access before permission mistakes reach production.

## The problem

Access control is usually spread across policy files, database rows and tribal knowledge. That makes a small permission change difficult to review and easy to get wrong. Access Lens gives product, security and engineering teams one understandable view of the system.

## Product capabilities

- Browse workspace roles and assigned members.
- Edit a permission matrix across resources and actions.
- See unsaved changes immediately.
- Simulate whether a real person can perform an action.
- Review recent access changes and security recommendations.
- Use the workflow across desktop and mobile layouts.

## Engineering decisions

- React and TypeScript model permissions as explicit resource and action sets.
- Derived simulation results avoid duplicated access state.
- Radix Checkbox primitives provide accessible permission controls.
- Each role edit is copied into local working state so changes can be reviewed before saving.
- Synthetic workspace data keeps the project safe to run without credentials.
- Reduced motion and keyboard focus behavior are supported.

## Run locally

```bash
npm ci
npm run dev
```

## Verify

```bash
npm run build
npm run lint
```

## Next step

A production version would compile the visual policy into a versioned authorization model, evaluate it server-side and require approval for changes that introduce privilege escalation.
