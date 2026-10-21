"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Command as Cmdk } from "cmdk";
import { Toaster, toast } from "sonner";
import {
  Activity, AlertTriangle, ArrowRight, ChevronDown, Command, FileKey2, KeyRound, Plus, Search, Settings,
  ShieldAlert, ShieldCheck, SlidersHorizontal, UserPlus, Users,
} from "lucide-react";
import { compilePolicy, initials } from "@/lib/access/engine";
import { AuditView } from "./AuditView";
import { PeopleView } from "./PeopleView";
import { PoliciesView } from "./PoliciesView";
import { ChangesModal, RolesView, type Drafts } from "./RolesView";
import { SettingsView } from "./SettingsView";
import { InviteModal, RoleFormModal, timeAgo, type View } from "./shared";
import { AccessProvider, download, useAccess } from "./store";

const VIEWS: { id: View; label: string; title: string; icon: typeof KeyRound }[] = [
  { id: "roles", label: "Roles", title: "Roles and permissions", icon: KeyRound },
  { id: "people", label: "People", title: "People", icon: Users },
  { id: "policies", label: "Policies", title: "Policies and approvals", icon: FileKey2 },
  { id: "audit", label: "Audit log", title: "Audit log", icon: Activity },
  { id: "settings", label: "Settings", title: "Workspace settings", icon: Settings },
];

const noopSubscribe = () => () => {};

function viewFromHash(): View {
  const id = window.location.hash.slice(1);
  return VIEWS.some((v) => v.id === id) ? (id as View) : "roles";
}

export function AccessApp() {
  // The workspace lives in localStorage, so render only after mount to avoid hydration mismatches.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) {
    return <main className="app booting" aria-busy="true"><aside className="nav" /><section className="canvas" /></main>;
  }
  return (
    <AccessProvider>
      <Workspace />
      <Toaster position="bottom-right" richColors closeButton />
    </AccessProvider>
  );
}

function Workspace() {
  const { state, findings, dispatch } = useAccess();
  const [view, setView] = useState<View>(viewFromHash);
  const [selectedRoleId, setSelectedRoleId] = useState(state.roles.find((r) => r.id === "builder")?.id ?? state.roles[0]!.id);
  const [roleFilter, setRoleFilter] = useState("");
  const [drafts, setDrafts] = useState<Drafts>({});
  const [creatingRole, setCreatingRole] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Warn before leaving with unsaved role drafts.
  const draftCount = Object.keys(drafts).filter((id) => state.roles.some((r) => r.id === id)).length;
  useEffect(() => {
    if (!draftCount) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [draftCount]);

  // Keep the selection valid when roles are deleted or the workspace is replaced.
  const roleId = state.roles.some((r) => r.id === selectedRoleId) ? selectedRoleId : state.roles[0]!.id;

  const navigate = useCallback((next: View, opts?: { roleFilter?: string }) => {
    if (opts?.roleFilter !== undefined) setRoleFilter(opts.roleFilter);
    window.location.hash = next;
    setView(next);
    window.scrollTo({ top: 0 });
  }, []);

  const openRole = useCallback((id: string) => {
    setSelectedRoleId(id);
    navigate("roles");
  }, [navigate]);

  const pendingCount = state.requests.filter((r) => r.status === "pending").length;
  const serious = findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const current = VIEWS.find((v) => v.id === view)!;
  const me = state.settings.currentUser;

  const onRoleCreated = (id: string, name: string) => {
    setSelectedRoleId(id);
    toast.success(`${name} created`, { description: "Grant permissions in the matrix, then save." });
    navigate("roles");
  };

  return (
    <main className="app">
      <aside className="nav">
        <div className="brand"><span><Command /></span><b>ACCESS LENS</b></div>
        <button className="workspace-switch" onClick={() => navigate("settings")}>
          <span>{initials(state.settings.workspaceName)}</span>
          <p><b>{state.settings.workspaceName}</b><small>{state.settings.environment}</small></p>
          <ChevronDown />
        </button>
        <button className="palette-trigger" onClick={() => setPaletteOpen(true)}><Search />Search<kbd>⌘K</kbd></button>
        <nav aria-label="Primary">
          {VIEWS.filter((v) => v.id !== "settings").map((v) => (
            <a key={v.id} href={`#${v.id}`} className={view === v.id ? "active" : undefined} aria-current={view === v.id ? "page" : undefined}
              onClick={(e) => { e.preventDefault(); navigate(v.id); }}>
              <v.icon />{v.label}
              {v.id === "policies" && pendingCount + serious.length ? <em className="badge">{pendingCount + serious.length}</em> : null}
            </a>
          ))}
        </nav>
        <div className="nav-foot">
          <a href="#settings" className={view === "settings" ? "active" : undefined} onClick={(e) => { e.preventDefault(); navigate("settings"); }}><Settings />Settings</a>
          <div><span>{initials(me)}</span><p><b>{me}</b><small>Workspace admin</small></p></div>
        </div>
      </aside>

      <nav className="mobile-tabs" aria-label="Sections">
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id ? "active" : undefined} onClick={() => navigate(v.id)}><v.icon />{v.label}</button>
        ))}
      </nav>

      <section className="canvas">
        <header>
          <div><span>{state.settings.workspaceName} / Access control</span><h1>{current.title}</h1></div>
          <div>
            {view === "roles" ? (
              <>
                <button className="secondary" onClick={() => setChangesOpen(true)}>
                  <SlidersHorizontal />View changes{draftCount ? <em className="badge">{draftCount}</em> : null}
                </button>
                <button className="primary" onClick={() => setCreatingRole(true)}><Plus />New role</button>
              </>
            ) : view === "people" ? (
              <button className="primary" onClick={() => setInviting(true)}><UserPlus />Invite person</button>
            ) : null}
          </div>
        </header>

        {view === "roles" ? (
          <>
            <StatusBanner pending={pendingCount} serious={serious.length} total={findings.length} people={state.people.length} roles={state.roles.length} lastCheckAt={state.lastCheckAt} onReview={() => navigate("policies")} />
            <RolesView selectedRoleId={roleId} onSelectRole={setSelectedRoleId} drafts={drafts} setDrafts={setDrafts} navigate={navigate} onCreateRole={() => setCreatingRole(true)} />
          </>
        ) : view === "people" ? (
          <PeopleView roleFilter={roleFilter} setRoleFilter={setRoleFilter} />
        ) : view === "policies" ? (
          <PoliciesView onOpenRole={openRole} onOpenSettings={() => navigate("settings")} />
        ) : view === "audit" ? (
          <AuditView />
        ) : (
          <SettingsView key={JSON.stringify(state.settings)} />
        )}
      </section>

      {creatingRole ? <RoleFormModal open onOpenChange={setCreatingRole} onCreated={onRoleCreated} /> : null}
      {inviting ? <InviteModal open onOpenChange={setInviting} /> : null}
      <ChangesModal open={changesOpen} onOpenChange={setChangesOpen} drafts={drafts} onOpenRole={openRole} onDiscardAll={() => { setDrafts({}); setChangesOpen(false); }} />

      <Cmdk.Dialog open={paletteOpen} onOpenChange={setPaletteOpen} label="Command menu" overlayClassName="modal-overlay" contentClassName="palette">
        <Cmdk.Input placeholder="Jump to a role, person or action…" />
        <Cmdk.List>
          <Cmdk.Empty>No results.</Cmdk.Empty>
          <Cmdk.Group heading="Go to">
            {VIEWS.map((v) => <Cmdk.Item key={v.id} value={`go ${v.label}`} onSelect={() => { navigate(v.id); setPaletteOpen(false); }}><v.icon />{v.label}</Cmdk.Item>)}
          </Cmdk.Group>
          <Cmdk.Group heading="Actions">
            <Cmdk.Item onSelect={() => { setPaletteOpen(false); setCreatingRole(true); }}><Plus />Create role</Cmdk.Item>
            <Cmdk.Item onSelect={() => { setPaletteOpen(false); setInviting(true); }}><UserPlus />Invite person</Cmdk.Item>
            <Cmdk.Item onSelect={() => { setPaletteOpen(false); dispatch({ type: "check/run" }); navigate("policies"); }}><ShieldCheck />Run policy check</Cmdk.Item>
            <Cmdk.Item onSelect={() => { setPaletteOpen(false); download("access-policy.json", JSON.stringify(compilePolicy(state), null, 2), "application/json"); }}><FileKey2 />Export compiled policy</Cmdk.Item>
          </Cmdk.Group>
          <Cmdk.Group heading="Roles">
            {state.roles.map((r) => <Cmdk.Item key={r.id} value={`role ${r.name}`} onSelect={() => { setPaletteOpen(false); openRole(r.id); }}><i className="dot-color" style={{ background: r.color }} />{r.name}</Cmdk.Item>)}
          </Cmdk.Group>
          <Cmdk.Group heading="People">
            {state.people.map((p) => (
              <Cmdk.Item key={p.id} value={`person ${p.name} ${p.email}`} onSelect={() => { setPaletteOpen(false); navigate("people", { roleFilter: p.roleId }); }}>
                <Users />{p.name}<small>{state.roles.find((r) => r.id === p.roleId)?.name}</small>
              </Cmdk.Item>
            ))}
          </Cmdk.Group>
        </Cmdk.List>
      </Cmdk.Dialog>
    </main>
  );
}

function StatusBanner({ pending, serious, total, people, roles, lastCheckAt, onReview }: {
  pending: number; serious: number; total: number; people: number; roles: number; lastCheckAt: string; onReview: () => void;
}) {
  const tone = serious ? "risk danger" : pending || total ? "risk caution" : "risk";
  const title = serious
    ? `${serious} high-risk access issue${serious === 1 ? "" : "s"}`
    : pending
      ? `${pending} change${pending === 1 ? "" : "s"} awaiting approval`
      : "No critical access conflicts";
  return (
    <div className={tone}>
      <span>{serious ? <ShieldAlert /> : total ? <AlertTriangle /> : <ShieldCheck />}</span>
      <div>
        <b>{title}</b>
        <p>Last policy check {timeAgo(lastCheckAt).toLowerCase()} across {people} members and {roles} roles{total ? ` · ${total} finding${total === 1 ? "" : "s"} total` : ""}.</p>
      </div>
      <button onClick={onReview}>Review report <ArrowRight /></button>
    </div>
  );
}
