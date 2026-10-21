"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, KeyRound, Plus, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { Switch } from "radix-ui";
import { Confirm } from "@/components/ui/dialog";
import type { Settings } from "@/lib/access/types";
import { Empty, timeAgo } from "./shared";
import { download, makeKeyPrefix, parseState, useAccess } from "./store";

export function SettingsView() {
  const { state, dispatch, reset } = useAccess();
  const [form, setForm] = useState<Settings>(state.settings);
  const [resetting, setResetting] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyOwner, setKeyOwner] = useState(state.people.find((p) => p.name === state.settings.currentUser)?.id ?? state.people[0]?.id ?? "");
  const fileInput = useRef<HTMLInputElement>(null);
  const admins = state.people.filter((p) => p.status === "active" && state.roles.find((r) => r.id === p.roleId)?.system);
  const domainOk = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(form.domain.trim());
  const dirty = JSON.stringify(form) !== JSON.stringify(state.settings);
  const valid = form.workspaceName.trim().length >= 2 && domainOk && form.keyStaleDays >= 1;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    dispatch({ type: "settings/update", patch: { ...form, workspaceName: form.workspaceName.trim(), domain: form.domain.trim().toLowerCase() } });
    toast.success("Settings saved");
  };

  const importBackup = async (file: File) => {
    try {
      const next = parseState(JSON.parse(await file.text()));
      dispatch({ type: "state/replace", state: next, reason: `imported ${file.name}` });
      toast.success("Workspace imported");
    } catch {
      toast.error("That file is not a valid Access Lens backup.");
    }
  };

  const createKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyName.trim().length < 2 || !keyOwner) return;
    const prefix = makeKeyPrefix();
    dispatch({ type: "key/create", name: keyName, ownerId: keyOwner, prefix });
    setKeyName("");
    toast.success("API key created", { description: `${prefix}… (synthetic, not a real secret)` });
  };

  return (
    <section className="page">
      <form className="card form" onSubmit={save}>
        <div className="card-head"><div><h2>Workspace</h2><p>Identity and approval policy for this environment.</p></div></div>
        <div className="form-grid">
          <label>Workspace name<input value={form.workspaceName} onChange={(e) => setForm({ ...form, workspaceName: e.target.value })} maxLength={40} /></label>
          <label>
            Company domain
            <input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} aria-invalid={!domainOk} />
            <small className={domainOk ? "hint" : "error"}>{domainOk ? "Emails outside this domain are treated as external." : "Enter a domain like example.com"}</small>
          </label>
          <label>
            Environment
            <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value as Settings["environment"] })}>
              <option>Production</option><option>Staging</option><option>Development</option>
            </select>
          </label>
          <label>
            Stale key window (days)
            <input type="number" min={1} max={730} value={form.keyStaleDays} onChange={(e) => setForm({ ...form, keyStaleDays: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label>
            Acting as
            <select value={form.currentUser} onChange={(e) => setForm({ ...form, currentUser: e.target.value })}>
              {admins.map((p) => <option key={p.id}>{p.name}</option>)}
              {!admins.some((p) => p.name === form.currentUser) ? <option>{form.currentUser}</option> : null}
            </select>
            <small className="hint">Switch admins to approve someone else&apos;s request.</small>
          </label>
          <div className="switch-field">
            <span><b>Require approval for high-risk changes</b><small>Edits that introduce high or critical findings need a second admin.</small></span>
            <Switch.Root className="switch" checked={form.requireApproval} onCheckedChange={(v) => setForm({ ...form, requireApproval: v })} aria-label="Require approval for high-risk changes">
              <Switch.Thumb className="switch-thumb" />
            </Switch.Root>
          </div>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary" disabled={!dirty} onClick={() => setForm(state.settings)}>Cancel</button>
          <button className="primary" disabled={!dirty || !valid}>Save settings</button>
        </div>
      </form>

      <div className="card" id="keys">
        <div className="card-head"><div><h2>API keys</h2><p>Keys inherit the access of their owner&apos;s role. Values are synthetic.</p></div><span className="count">{state.keys.length}</span></div>
        <form className="toolbar" onSubmit={createKey}>
          <input placeholder="Key name, e.g. Nightly export" value={keyName} onChange={(e) => setKeyName(e.target.value)} aria-label="Key name" maxLength={40} />
          <select value={keyOwner} onChange={(e) => setKeyOwner(e.target.value)} aria-label="Key owner">
            {state.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="primary" disabled={keyName.trim().length < 2}><Plus />Create key</button>
        </form>
        {!state.keys.length ? <Empty title="No API keys" /> : null}
        <ul className="keys">
          {state.keys.map((k) => (
            <li key={k.id}>
              <KeyRound />
              <span><b>{k.name}</b><small><code>{k.prefix}••••</code> · {state.people.find((p) => p.id === k.ownerId)?.name ?? "Unknown owner"} · last used {timeAgo(k.lastUsed).toLowerCase()}</small></span>
              <button className="ghost" onClick={() => { dispatch({ type: "key/rotate", keyId: k.id, prefix: makeKeyPrefix() }); toast.success(`${k.name} rotated`); }}><RefreshCw />Rotate</button>
              <button className="ghost danger-text" onClick={() => { dispatch({ type: "key/revoke", keyId: k.id }); toast.success(`${k.name} revoked`); }}>Revoke</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="card-head"><div><h2>Data</h2><p>Everything is stored in this browser. Back it up or move it between machines.</p></div></div>
        <div className="data-actions">
          <button className="secondary" onClick={() => download("access-lens-backup.json", JSON.stringify(state, null, 2), "application/json")}><Download />Export backup</button>
          <button className="secondary" onClick={() => fileInput.current?.click()}><Upload />Import backup</button>
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ""; }} />
          <button className="secondary danger-text" onClick={() => setResetting(true)}><RotateCcw />Reset demo data</button>
        </div>
      </div>

      <Confirm open={resetting} onOpenChange={setResetting} title="Reset the demo workspace?" description="All roles, people, keys and audit history return to the sample data." confirmLabel="Reset" danger
        onConfirm={() => { reset(); toast.success("Workspace reset"); }} />
    </section>
  );
}
