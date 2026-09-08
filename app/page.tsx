"use client";
import {useMemo,useState} from "react";
import {Activity,AlertTriangle,ArrowRight,Check,ChevronDown,Clock3,Command,FileKey2,KeyRound,LockKeyhole,Plus,Search,Settings,ShieldCheck,SlidersHorizontal,Users,X} from "lucide-react";
import {Checkbox} from "@/components/ui/checkbox";

type Action="view"|"create"|"edit"|"delete";
type Role={name:string;description:string;members:number;color:string;permissions:Record<string,Action[]>};
const resources=["Projects","Billing","Members","API keys"];
const roles:Role[]=[
 {name:"Admin",description:"Full workspace control",members:3,color:"#6548dd",permissions:{Projects:["view","create","edit","delete"],Billing:["view","edit"],Members:["view","create","edit","delete"],"API keys":["view","create","delete"]}},
 {name:"Builder",description:"Creates and ships product work",members:12,color:"#087d68",permissions:{Projects:["view","create","edit"],Billing:[],Members:["view"],"API keys":["view","create"]}},
 {name:"Analyst",description:"Reads product and usage data",members:8,color:"#ad5c16",permissions:{Projects:["view"],Billing:["view"],Members:["view"],"API keys":[]}},
 {name:"Guest",description:"Limited project visibility",members:5,color:"#59606c",permissions:{Projects:["view"],Billing:[],Members:[],"API keys":[]}}
];
const people=[["Maya Chen","maya@northstar.io","Admin"],["Jon Bell","jon@northstar.io","Builder"],["Nina Shah","nina@northstar.io","Analyst"],["Owen Reed","owen@partner.co","Guest"]];
const audits=[["12:42","Maya changed Builder","API keys: create allowed"],["11:18","Jon invited Owen","Guest role assigned"],["Yesterday","Maya removed export","Analyst billing access"]];

export default function Home(){
 const [selectedRole,setSelectedRole]=useState(roles[1]);const [permissions,setPermissions]=useState(selectedRole.permissions);const [actor,setActor]=useState(people[1][0]);const [resource,setResource]=useState("API keys");const [action,setAction]=useState<Action>("create");const [query,setQuery]=useState("");const [saved,setSaved]=useState(true);
 const selectRole=(role:Role)=>{setSelectedRole(role);setPermissions(structuredClone(role.permissions));setSaved(true)};
 const toggle=(r:string,a:Action,checked:boolean)=>{setPermissions(p=>({...p,[r]:checked?[...p[r],a]:p[r].filter(x=>x!==a)}));setSaved(false)};
 const result=useMemo(()=>{const person=people.find(p=>p[0]===actor);const role=roles.find(r=>r.name===person?.[2])!;return role.permissions[resource].includes(action)},[actor,resource,action]);
 const visibleRoles=roles.filter(r=>r.name.toLowerCase().includes(query.toLowerCase()));
 return <main className="app">
  <aside className="nav">
   <div className="brand"><span><Command/></span><b>ACCESS LENS</b></div>
   <div className="workspace-switch"><span>NS</span><p><b>Northstar Labs</b><small>Production</small></p><ChevronDown/></div>
   <nav><a className="active" href="#roles"><KeyRound/>Roles</a><a href="#people"><Users/>People</a><a href="#policies"><FileKey2/>Policies</a><a href="#audit"><Activity/>Audit log</a></nav>
   <div className="nav-foot"><a href="#settings"><Settings/>Settings</a><div><span>HS</span><p><b>Hardik Shali</b><small>Workspace admin</small></p></div></div>
  </aside>
  <section className="canvas">
   <header><div><span>Security / Access control</span><h1>Roles and permissions</h1></div><div><button className="secondary"><SlidersHorizontal/>View changes</button><button className="primary"><Plus/>New role</button></div></header>
   <div className="risk"><span><ShieldCheck/></span><div><b>No critical access conflicts</b><p>Last policy check completed 4 minutes ago across 28 members and 4 roles.</p></div><button>Review report <ArrowRight/></button></div>
   <section className="main-grid">
    <aside className="roles" id="roles"><div className="panel-title"><span>Roles</span><b>{roles.length}</b></div><label><Search/><input placeholder="Find a role" value={query} onChange={e=>setQuery(e.target.value)}/></label>
     <div>{visibleRoles.map(role=><button key={role.name} className={selectedRole.name===role.name?"role selected": "role"} onClick={()=>selectRole(role)}><i style={{background:role.color}}>{role.name[0]}</i><span><b>{role.name}</b><small>{role.members} members</small></span><ChevronDown/></button>)}</div>
     <button className="add-role"><Plus/>Create role</button>
    </aside>
    <section className="matrix"><div className="matrix-head"><div><span className="role-mark" style={{background:selectedRole.color}}>{selectedRole.name[0]}</span><div><h2>{selectedRole.name}</h2><p>{selectedRole.description}</p></div></div><button onClick={()=>{setSaved(true)}} disabled={saved}>{saved?<><Check/>Saved</>:<>Save changes</>}</button></div>
     <div className="scope-note"><LockKeyhole/><p><b>Least privilege check</b><span>This role has no high-risk permission combinations.</span></p></div>
     <div className="permission-table"><div className="table-row table-head"><span>Resource</span>{(["view","create","edit","delete"] as Action[]).map(a=><span key={a}>{a}</span>)}</div>
      {resources.map(r=><div className="table-row" key={r}><strong>{r}<small>{r==="Billing"?"Invoices and payment methods":r==="API keys"?"Workspace credentials":`Workspace ${r.toLowerCase()}`}</small></strong>{(["view","create","edit","delete"] as Action[]).map(a=><label key={a} aria-label={`${a} ${r}`}><Checkbox checked={permissions[r].includes(a)} onCheckedChange={v=>toggle(r,a,v===true)} className="permission-box"/></label>)}</div>)}
     </div>
     <section className="simulator"><div className="sim-head"><div><span>Permission simulator</span><p>Test access before assigning the role.</p></div><span className="lab">SAFE TEST</span></div><div className="sim-controls"><label>Person<select value={actor} onChange={e=>setActor(e.target.value)}>{people.map(p=><option key={p[0]}>{p[0]}</option>)}</select></label><label>Resource<select value={resource} onChange={e=>setResource(e.target.value)}>{resources.map(r=><option key={r}>{r}</option>)}</select></label><label>Action<select value={action} onChange={e=>setAction(e.target.value as Action)}>{(["view","create","edit","delete"] as Action[]).map(a=><option key={a}>{a}</option>)}</select></label></div>
      <div className={result?"sim-result allowed":"sim-result denied"}><span>{result?<Check/>:<X/>}</span><p><b>{result?"Access allowed":"Access denied"}</b><small>{actor} {result?"can":"cannot"} {action} {resource.toLowerCase()} through the {people.find(p=>p[0]===actor)?.[2]} role.</small></p></div>
     </section>
    </section>
    <aside className="context"><section><div className="panel-title"><span>Members</span><b>{selectedRole.members}</b></div>{people.filter(p=>p[2]===selectedRole.name).map(p=><div className="person" key={p[0]}><span>{p[0].split(" ").map(x=>x[0]).join("")}</span><p><b>{p[0]}</b><small>{p[1]}</small></p></div>)}<button className="text-button">Manage members <ArrowRight/></button></section>
     <section id="audit"><div className="panel-title"><span>Recent activity</span><Clock3/></div>{audits.map(a=><div className="audit" key={a[0]}><time>{a[0]}</time><p><b>{a[1]}</b><small>{a[2]}</small></p></div>)}<button className="text-button">Open audit log <ArrowRight/></button></section>
     <section className="warning"><AlertTriangle/><div><b>1 recommendation</b><p>Two API keys have not been used in 90 days.</p><button>Review keys</button></div></section>
    </aside>
   </section>
  </section>
 </main>
}
