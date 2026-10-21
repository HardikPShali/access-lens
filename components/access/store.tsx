"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { z } from "zod";
import { analyzeWorkspace } from "@/lib/access/engine";
import { reducer, type ActionInput, type AccessAction } from "@/lib/access/reducer";
import { createSeed } from "@/lib/access/seed";
import { ACTIONS, GUARDRAIL_IDS, type AccessState, type Finding } from "@/lib/access/types";

const STORAGE_KEY = "access-lens:workspace:v1";

const iso = z.string().min(1);
const stateSchema = z.object({
  schema: z.literal(1),
  resources: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), sensitivity: z.enum(["low", "medium", "high"]) })).min(1),
  roles: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string(), color: z.string(),
    permissions: z.record(z.array(z.enum(ACTIONS))), system: z.boolean().optional(), version: z.number(), updatedAt: iso,
  })).min(1),
  people: z.array(z.object({
    id: z.string(), name: z.string(), email: z.string(), roleId: z.string(),
    status: z.enum(["active", "invited", "suspended"]), lastActive: iso.nullable(),
  })),
  keys: z.array(z.object({ id: z.string(), name: z.string(), prefix: z.string(), ownerId: z.string(), createdAt: iso, lastUsed: iso.nullable() })),
  audit: z.array(z.object({ id: z.string(), at: iso, actor: z.string(), category: z.enum(["role", "member", "policy", "key", "settings"]), summary: z.string(), detail: z.string() })),
  guardrails: z.object(Object.fromEntries(GUARDRAIL_IDS.map((id) => [id, z.boolean()])) as Record<(typeof GUARDRAIL_IDS)[number], z.ZodBoolean>),
  requests: z.array(z.object({
    id: z.string(), roleId: z.string(), proposed: z.record(z.array(z.enum(ACTIONS))), baseVersion: z.number(),
    requestedBy: z.string(), at: iso, reason: z.string(), status: z.enum(["pending", "approved", "rejected"]),
    resolvedBy: z.string().optional(), resolvedAt: iso.optional(),
  })),
  settings: z.object({
    workspaceName: z.string(), domain: z.string(), environment: z.enum(["Production", "Staging", "Development"]),
    requireApproval: z.boolean(), keyStaleDays: z.number().int().positive(), currentUser: z.string(),
  }),
  lastCheckAt: iso,
});

export function parseState(input: unknown): AccessState {
  return stateSchema.parse(input) as AccessState;
}

export function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function makeKeyPrefix(): string {
  return `al_live_${Math.random().toString(16).slice(2, 6)}`;
}

type Store = {
  state: AccessState;
  findings: Finding[];
  /** Applies an action and returns its unique id (new entities derive their id from it). */
  dispatch: (action: ActionInput) => string;
  reset: () => void;
};

const StoreContext = createContext<Store | null>(null);

function load(): AccessState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return parseState(JSON.parse(raw));
  } catch {
    // Corrupt or unavailable storage falls back to the demo workspace.
  }
  return createSeed();
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, undefined, load);
  const first = useRef(true);
  // Re-evaluate time-based findings (stale keys) once a minute.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be full or blocked; the session still works in memory.
    }
  }, [state]);

  const dispatch = useCallback(
    (action: ActionInput) => {
      const uid = makeId();
      rawDispatch({ ...action, at: new Date().toISOString(), uid } as AccessAction);
      return uid;
    },
    [],
  );
  const reset = useCallback(() => {
    const seed = createSeed();
    dispatch({ type: "state/replace", state: { ...seed, audit: [] }, reason: "reset the demo workspace" });
  }, [dispatch]);

  const findings = useMemo(() => analyzeWorkspace(state, now), [state, now]);
  const value = useMemo(() => ({ state, findings, dispatch, reset }), [state, findings, dispatch, reset]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAccess(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useAccess must be used inside AccessProvider");
  return store;
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
