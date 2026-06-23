// src/views/OwnerDashboardView.jsx — MERGED (New Design + All Features)
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  collection, query, where, onSnapshot,
  getDocs, addDoc, updateDoc, doc, deleteDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase/config";
import { useApp } from "../context/AppContext";

/* ─── NEW Design Color Palette ───────────────────────────── */
const C = {
  primary:"#0D7377", primary2:"#14919B", primaryLight:"#E0F4F6", primaryBorder:"#A8DFE5",
  accent:"#FF6B35",  accentLight:"#FFE5D9", accentBorder:"#FFB8A3",
  secondary:"#6B63B5", secondLight:"#F0EDFF", secondBorder:"#D8D3F0",
  success:"#2E8B57",  successLight:"#E8F5E9",
  warning:"#FFA500",  warnLight:"#FFF4E6",
  danger:"#E63946",   dangerLight:"#FCE4E6",
  dark:"#1A1A2E", dark2:"#252641",
  t1:"#2D3142", t2:"#6B7280", t3:"#9CA3AF",
  bg:"#F8F9FB", card:"#FFFFFF", bdr:"#E5E7EB", bdr2:"#F3F4F6",
  overlay:"rgba(10,10,20,0.65)",
  // aliases used throughout feature components
  ind:"#0D7377", ind2:"#14919B", indLight:"#E0F4F6", indBorder:"#A8DFE5",
  vi:"#6B63B5",  vi2:"#8B7EC8",
  brand:"#0D7377", brand2:"#14919B",
  em:"#2E8B57", teal:"#14919B", tealLight:"#E0F4F6",
  amb:"#FFA500", ambLight:"#FFF4E6",
  red:"#E63946", redLight:"#FCE4E6",
};
const G = {
  primary:`linear-gradient(135deg,#0D7377,#14919B)`,
  accent:`linear-gradient(135deg,#FF6B35,#FF8A50)`,
  secondary:`linear-gradient(135deg,#6B63B5,#8B7EC8)`,
  success:`linear-gradient(135deg,#2E8B57,#3BA370)`,
  danger:`linear-gradient(135deg,#E63946,#F04856)`,
  amber:`linear-gradient(135deg,#FFA500,#FF8C00)`,
  // aliases
  brand:`linear-gradient(135deg,#0D7377,#14919B)`,
  violet:`linear-gradient(135deg,#6B63B5,#8B7EC8)`,
  teal:`linear-gradient(135deg,#14919B,#0D7377)`,
  emerald:`linear-gradient(135deg,#2E8B57,#3BA370)`,
  hdr:"#1A1A2E",
};

const inr  = n => "₹" + Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const init = s => s?.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?";
const greet = () => { const h=new Date().getHours(); return h<5?["Night","🌙"]:h<12?["Morning","🌅"]:h<17?["Afternoon","☀️"]:h<21?["Evening","🌆"]:["Night","✨"]; };
const mkCode = () => "RK-"+Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");

const ease=[0.22,1,0.36,1];
const vUp   ={hidden:{opacity:0,y:20},    visible:{opacity:1,y:0,  transition:{duration:.45,ease}}};
const vScale={hidden:{opacity:0,scale:.93},visible:{opacity:1,scale:1,transition:{duration:.4,ease}}};
const vSheet={hidden:{y:"100%"},          visible:{y:0,            transition:{duration:.38,ease}}, exit:{y:"100%",transition:{duration:.28,ease:[.4,0,1,1]}}};
const vFade ={hidden:{opacity:0},         visible:{opacity:1,      transition:{duration:.2}},       exit:{opacity:0,transition:{duration:.15}}};
const stagger=(s=.055)=>({hidden:{},visible:{transition:{staggerChildren:s}}});

function Counter({ value }) {
  const el=useRef(null); const mv=useMotionValue(0);
  useEffect(()=>{const c=animate(mv,value,{duration:1.1,ease:[.16,1,.3,1],onUpdate:v=>{if(el.current)el.current.textContent="₹"+Math.round(v).toLocaleString("en-IN");}});return c.stop;},[value]);
  return <span ref={el} style={{fontFamily:"'IBM Plex Mono',monospace",letterSpacing:"-.02em",fontWeight:600}}>₹0</span>;
}

function Toasts({ list, dismiss }) {
  return (
    <div style={{position:"fixed",bottom:72,left:0,right:0,zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"0 16px",pointerEvents:"none"}}>
      <AnimatePresence>
        {list.map(t=>(
          <motion.div key={t.id} layout initial={{opacity:0,y:12,scale:.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.95}}
            onClick={()=>dismiss(t.id)}
            style={{pointerEvents:"auto",maxWidth:320,width:"100%",padding:"12px 16px",borderRadius:16,cursor:"pointer",color:"white",fontWeight:700,fontSize:14,background:t.type==="error"?G.danger:G.success,boxShadow:"0 8px 24px rgba(0,0,0,.25)"}}>
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Sheet({ onClose, title, children }) {
  return (
    <motion.div variants={vFade} initial="hidden" animate="visible" exit="exit"
      style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:C.overlay}} onClick={onClose}/>
      <motion.div variants={vSheet} initial="hidden" animate="visible" exit="exit"
        style={{position:"relative",zIndex:1,background:"#fff",borderRadius:"20px 20px 0 0",maxHeight:"88dvh",overflowY:"auto",paddingBottom:"max(24px,env(safe-area-inset-bottom))"}}>
        <div style={{width:36,height:4,borderRadius:9,background:C.primaryBorder,margin:"12px auto 0"}}/>
        <div style={{padding:"14px 18px 0"}}>
          {title&&<p style={{fontWeight:700,fontSize:18,color:C.t1,marginBottom:16}}>{title}</p>}
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function SInput({ label, value, onChange, placeholder, type="text", min, max, required }) {
  const [f,setF]=useState(false);
  return (
    <div style={{marginBottom:13}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,color:C.t1,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>{label}{required?" *":""}</label>
      <input type={type} value={value} placeholder={placeholder} required={required} min={min} max={max}
        onChange={e=>onChange(e.target.value)} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
        style={{width:"100%",padding:"12px 14px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",fontFamily:"'Inter',sans-serif",color:C.t1,background:f?C.card:"#F9FAFB",border:`1.5px solid ${f?C.primary:C.bdr}`,boxShadow:f?`0 0 0 3px ${C.primaryLight}`:"none",transition:"all .2s"}}/>
    </div>
  );
}
function SBtn({ loading, label, grad }) {
  return (
    <button type="submit" disabled={loading}
      style={{width:"100%",padding:"13px",borderRadius:12,border:"none",cursor:"pointer",background:grad||G.primary,color:"white",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 16px rgba(13,115,119,.25)",opacity:loading?.6:1,fontFamily:"'Inter',sans-serif",marginTop:4,transition:"all .2s"}}
      onPointerDown={e=>e.currentTarget.style.transform="scale(.96)"} onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
      {loading?<svg style={{width:18,height:18,animation:"spin 1s linear infinite"}} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/></svg>:label}
    </button>
  );
}
function ErrBox({ msg }) { return msg?<div style={{background:C.dangerLight,color:C.danger,padding:"10px 13px",borderRadius:11,fontSize:13,fontWeight:600,marginBottom:12}}>{msg}</div>:null; }

function AddBuildingSheet({ ownerId, onClose, toast }) {
  const [name,setName]=useState(""); const [cnt,setCnt]=useState(""); const [start,setStart]=useState("");
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const go=async e=>{e.preventDefault();setErr("");const n=parseInt(cnt,10);if(!name.trim()||!n||n<1){setErr("Name and room count are required.");return;}setBusy(true);try{const bRef=await addDoc(collection(db,"buildings"),{ownerId,name:name.trim(),createdAt:new Date()});const s=parseInt(start,10)||1;await Promise.all(Array.from({length:n},(_,i)=>addDoc(collection(db,"rooms"),{buildingId:bRef.id,ownerId,roomNo:(s+i).toString(),tenantName:"",rent:0,status:"pending",connectionCode:mkCode(),createdAt:new Date()})));toast(`✓ "${name.trim()}" with ${n} rooms added!`);onClose();}catch(e){setErr(e.message);}setBusy(false);};
  return (<Sheet onClose={onClose} title="Add Building 🏠"><form onSubmit={go}><SInput label="Building Name" value={name} onChange={setName} placeholder="e.g. Sharma Niwas" required/><SInput label="Number of Rooms" type="number" value={cnt} onChange={setCnt} placeholder="6" min="1" max="99" required/><SInput label="Starting Room No. (optional)" value={start} onChange={setStart} placeholder="101 → 101, 102, 103…"/><ErrBox msg={err}/><SBtn loading={busy} label="🏠 Create Building"/><div style={{height:8}}/></form></Sheet>);
}

function AddRoomSheet({ buildingId, ownerId, onClose, toast }) {
  const [no,setNo]=useState(""); const [rent,setRent]=useState(""); const [busy,setBusy]=useState(false);
  const go=async e=>{e.preventDefault();if(!no.trim())return;setBusy(true);try{await addDoc(collection(db,"rooms"),{buildingId,ownerId,roomNo:no.trim(),rent:parseInt(rent,10)||0,tenantName:"",status:"pending",connectionCode:mkCode(),createdAt:new Date()});toast(`✓ Room ${no.trim()} added!`);onClose();}catch{}setBusy(false);};
  return (<Sheet onClose={onClose} title="Add Room"><form onSubmit={go}><SInput label="Room Number" value={no} onChange={setNo} placeholder="201" required/><SInput label="Monthly Rent (₹)" type="number" value={rent} onChange={setRent} placeholder="8000" min="0"/><SBtn loading={busy} label="Add Room" grad={G.secondary}/><div style={{height:8}}/></form></Sheet>);
}

function EditRoomSheet({ room, onClose, toast }) {
  const [tenant,setTenant]=useState(room.tenantName||""); const [rent,setRent]=useState(String(room.rent||"")); const [elec,setElec]=useState(String(room.electricityBill||"")); const [dep,setDep]=useState(String(room.securityDeposit||"")); const [busy,setBusy]=useState(false);
  const go=async e=>{e.preventDefault();setBusy(true);try{await updateDoc(doc(db,"rooms",room.id),{tenantName:tenant.trim(),rent:parseInt(rent,10)||0,electricityBill:parseInt(elec,10)||0,securityDeposit:parseInt(dep,10)||0});toast("✓ Room updated!");onClose();}catch(e){toast(e.message,"error");}setBusy(false);};
  return (<Sheet onClose={onClose} title={`Edit Room ${room.roomNo}`}><form onSubmit={go}><SInput label="Tenant Name" value={tenant} onChange={setTenant} placeholder="Ravi Kumar"/><SInput label="Monthly Rent (₹)" type="number" value={rent} onChange={setRent} placeholder="8000"/><SInput label="Electricity Bill (₹)" type="number" value={elec} onChange={setElec} placeholder="500"/><SInput label="Security Deposit (₹)" type="number" value={dep} onChange={setDep} placeholder="16000"/><SBtn loading={busy} label="Save Changes" grad={G.secondary}/><div style={{height:8}}/></form></Sheet>);
}

function Bell({ rooms }) {
  const [open,setOpen]=useState(false); const ref=useRef(null);
  const notifs=useMemo(()=>{const list=[];rooms.filter(r=>r.status==="pending_verification"&&r.tenantName?.trim()).forEach(r=>list.push({id:`pv-${r.id}`,icon:"fa-solid fa-eye",col:C.secondary,bg:C.secondLight,title:"Verify payment",sub:`Room ${r.roomNo} · ${r.tenantName}`}));rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim()).slice(0,3).forEach(r=>list.push({id:`pd-${r.id}`,icon:"fa-solid fa-clock",col:C.danger,bg:C.dangerLight,title:"Rent due",sub:`Room ${r.roomNo} · ${r.tenantName} · ${inr(r.rent)}`}));return list;},[rooms]);
  useEffect(()=>{if(!open)return;const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("pointerdown",h);return()=>document.removeEventListener("pointerdown",h);},[open]);
  return (
    <div ref={ref} style={{position:"relative",zIndex:50}}>
      <motion.button whileTap={{scale:.88}} onClick={()=>setOpen(p=>!p)}
        style={{width:40,height:40,borderRadius:"50%",cursor:"pointer",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",background:open?"rgba(255,255,255,.2)":"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.15)"}}>
        <motion.i className="fa-regular fa-bell" style={{fontSize:16,color:"rgba(255,255,255,.88)"}} animate={notifs.length&&!open?{rotate:[0,-15,15,-10,10,0]}:{}} transition={{duration:.5,repeat:Infinity,repeatDelay:4}}/>
        <AnimatePresence>{notifs.length>0&&(<motion.span key="dot" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{type:"spring",stiffness:500,damping:25}} style={{position:"absolute",top:-3,right:-3,minWidth:16,height:16,borderRadius:9,background:C.danger,color:"white",fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",boxShadow:"0 0 0 2px rgba(26,26,46,.7)"}}>{notifs.length>9?"9+":notifs.length}</motion.span>)}</AnimatePresence>
      </motion.button>
      <AnimatePresence>
        {open&&(<motion.div initial={{opacity:0,y:-8,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.96}} transition={{duration:.2,ease}}
          style={{position:"absolute",top:48,right:0,width:270,background:"rgba(10,7,25,.95)",backdropFilter:"blur(20px)",border:"1px solid rgba(255,255,255,.1)",borderRadius:20,boxShadow:"0 20px 60px rgba(0,0,0,.5)",overflow:"hidden"}}>
          <div style={{padding:"11px 14px 9px",borderBottom:"1px solid rgba(255,255,255,.07)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:7}}><i className="fa-solid fa-bell" style={{fontSize:11,color:C.primary2}}/><span style={{fontWeight:700,fontSize:12,color:"rgba(255,255,255,.85)"}}>Notifications</span>{notifs.length>0&&<span style={{background:C.danger,color:"white",fontSize:9,fontWeight:900,padding:"1px 5px",borderRadius:6}}>{notifs.length}</span>}</div>
            <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.4)",fontSize:14}}><i className="fa-solid fa-xmark"/></button>
          </div>
          <div style={{maxHeight:260,overflowY:"auto"}}>
            {notifs.length===0?<div style={{padding:"28px 16px",textAlign:"center",color:"rgba(255,255,255,.28)",fontSize:13}}>All caught up ✨</div>
              :notifs.map((n,i)=>(<div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderBottom:i<notifs.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                <div style={{width:30,height:30,borderRadius:10,background:n.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",marginTop:2}}><i className={n.icon} style={{fontSize:11,color:n.col}}/></div>
                <div style={{flex:1,minWidth:0}}><p style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.88)",marginBottom:2}}>{n.title}</p><p style={{fontSize:11,color:"rgba(255,255,255,.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.sub}</p></div>
              </div>))}
          </div>
          {notifs.length>0&&<div style={{padding:"8px 14px 12px",borderTop:"1px solid rgba(255,255,255,.07)"}}><button onClick={()=>setOpen(false)} style={{width:"100%",background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,color:C.primary2}}>Mark all as read</button></div>}
        </motion.div>)}
      </AnimatePresence>
    </div>
  );
}

const SC = {
  paid:                {lbl:"✓ Paid",   bdr:"#86EFAC",bdg:["#DCFCE7","#15803D"],btn:G.success,btnL:"Undo",   av:G.secondary},
  partial:             {lbl:"◑ Partial",bdr:"#93C5FD",bdg:["#DBEAFE","#1D4ED8"],btn:G.success,btnL:"Receive",av:G.secondary},
  pending_verification:{lbl:"👀 Verify",bdr:C.secondBorder,bdg:[C.secondLight,"#7C3AED"],btn:G.secondary,btnL:"Verify",av:G.secondary},
  pending:             {lbl:"⏳ Pending",bdr:C.accentBorder,bdg:[C.warnLight,"#B45309"],btn:G.primary,btnL:"Receive",av:G.secondary},
  vacant:              {lbl:"Vacant",   bdr:C.bdr,bdg:[C.bdr2,"#64748B"],av:"linear-gradient(135deg,#CBD5E1,#94A3B8)"},
};

function RoomCard({ room, onToggle, onEdit, onInvite, onDelete, onAddBill, onAssign, onViewDetail }) {
  const {roomNo,tenantName,rent=0,electricityBill=0,status="pending"}=room;
  const vacant=!tenantName?.trim();
  const cfg=SC[vacant?"vacant":(status||"pending")]||SC.pending;
  const total=rent+(electricityBill||0);
  const badge=vacant?{text:"Vacant",bg:C.successLight,color:C.success}:status==="paid"?{text:"Paid",bg:C.successLight,color:C.success}:status==="pending_verification"?{text:"Verify",bg:C.secondLight,color:C.secondary}:status==="partial"?{text:"Partial",bg:"#DBEAFE",color:"#1D4ED8"}:{text:"Pending",bg:C.warnLight,color:C.warning};
  const avBg=vacant?C.bdr2:status==="paid"?C.primaryLight:status==="partial"?"#DBEAFE":C.accentLight;
  const avColor=vacant?C.t3:status==="paid"?C.primary:status==="partial"?"#3B82F6":C.accent;
  return (
    <div style={{background:C.card,borderRadius:16,border:`1.5px solid ${C.bdr}`,overflow:"hidden",flexShrink:0,cursor:"pointer",transition:"box-shadow .2s"}}
      onClick={()=>onViewDetail(room)} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(13,115,119,.12)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
      <div style={{height:76,display:"flex",alignItems:"center",justifyContent:"center",background:avBg,position:"relative"}}>
        {room.tenantPhoto?<img src={room.tenantPhoto} alt={tenantName} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:vacant?<i className="fa-solid fa-door-open" style={{fontSize:26,color:C.t3}}/>:<span style={{fontSize:22,fontWeight:700,color:avColor}}>{init(tenantName)}</span>}
        <span style={{position:"absolute",top:8,left:8,fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:20,background:badge.bg,color:badge.color}}>{badge.text}</span>
        <div style={{position:"absolute",top:6,right:6,display:"flex",gap:3}} onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onEdit(room)} style={{width:22,height:22,borderRadius:6,background:"rgba(255,255,255,.9)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="fa-solid fa-pen" style={{fontSize:7,color:C.t2}}/></button>
          <button onClick={()=>onDelete("room",room.id,`Room ${roomNo}`)} style={{width:22,height:22,borderRadius:6,background:`${C.dangerLight}ee`,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="fa-solid fa-trash" style={{fontSize:7,color:C.danger}}/></button>
        </div>
      </div>
      <div style={{padding:"10px 10px 12px"}} onClick={e=>e.stopPropagation()}>
        <p style={{fontSize:16,fontWeight:700,color:C.t1,lineHeight:1}}>{roomNo}</p>
        <p style={{fontSize:11,color:C.t2,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{vacant?"Vacant room":tenantName}</p>
        <p style={{fontSize:12,fontWeight:700,color:C.primary,marginTop:6}}>{inr(total)} / mo</p>
        {(electricityBill||0)>0&&<p style={{fontSize:10,color:C.warning,fontWeight:600,marginTop:2}}>⚡ +{inr(electricityBill)}</p>}
        <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}} onClick={e=>e.stopPropagation()}>
          {!vacant?(status==="pending_verification"?
            <button style={{width:"100%",padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",background:C.secondLight,color:C.secondary,fontWeight:700,fontSize:11}}>✓ Verify</button>:
            <><button onClick={()=>onToggle(room.id,status)} style={{width:"100%",padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",background:status==="paid"?C.warnLight:C.primary,color:status==="paid"?C.warning:"white",fontWeight:700,fontSize:11}}>{status==="paid"?"⏳ Undo":"₹ Receive"}</button>
            <button onClick={()=>onAddBill(room)} style={{width:"100%",padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",background:C.warnLight,color:C.warning,fontWeight:700,fontSize:11}}>⚡ Add Bill</button></>):
          <div style={{display:"flex",gap:5}}>
            <button onClick={()=>onAssign(room)} style={{flex:1,padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",background:C.primaryLight,color:C.primary,fontWeight:700,fontSize:10}}>+ Assign</button>
            <button onClick={()=>onInvite(room)} style={{flex:1,padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",background:C.primary,color:"white",fontWeight:700,fontSize:10}}>🔗 Invite</button>
          </div>}
        </div>
      </div>
    </div>
  );
}

function BuildingGroup({ bid, name, rooms, onToggle, onEdit, onAddRoom, onInvite, onDelete, onAddBill, onAssign, onViewDetail }) {
  const occ=rooms.filter(r=>r.tenantName?.trim()).length;
  return (
    <div style={{marginBottom:24}}>
      <div style={{background:C.card,border:`1.5px solid ${C.bdr}`,borderRadius:16,padding:"12px 14px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:12,background:C.primaryLight,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="fa-solid fa-building" style={{fontSize:18,color:C.primary}}/></div>
          <div style={{flex:1,minWidth:0}}><p style={{fontSize:11,color:C.t3,fontWeight:600,marginBottom:1}}>Building</p><p style={{fontSize:16,fontWeight:700,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</p></div>
          {bid!=="no-building"&&<div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={()=>onAddRoom(bid)} style={{height:32,padding:"0 12px",borderRadius:10,border:"none",cursor:"pointer",background:C.primary,color:"white",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}><i className="fa-solid fa-plus" style={{fontSize:9}}/> Room</button>
            <button onClick={()=>onDelete("building",bid,name)} style={{width:32,height:32,borderRadius:10,border:"none",cursor:"pointer",background:C.dangerLight,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="fa-solid fa-trash" style={{fontSize:11,color:C.danger}}/></button>
          </div>}
        </div>
        <div style={{display:"flex",marginTop:10,paddingTop:10,borderTop:`1px solid ${C.bdr2}`}}>
          {[{l:"Occupied",v:occ,c:C.primary},{l:"Vacant",v:rooms.length-occ,c:C.success},{l:"Total",v:rooms.length,c:C.t2}].map(s=>(
            <div key={s.l} style={{flex:1,textAlign:"center"}}><p style={{fontSize:18,fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</p><p style={{fontSize:10,fontWeight:600,color:C.t3,marginTop:2}}>{s.l}</p></div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
        {rooms.map(r=>(<div key={r.id} style={{minWidth:140,maxWidth:140}}><RoomCard room={r} onToggle={onToggle} onEdit={onEdit} onInvite={onInvite} onDelete={onDelete} onAddBill={onAddBill} onAssign={onAssign} onViewDetail={onViewDetail}/></div>))}
      </div>
    </div>
  );
}

const TABS=[{k:"home",ic:"fa-solid fa-house",l:"Home"},{k:"tenants",ic:"fa-solid fa-users",l:"Tenants"},{k:"payments",ic:"fa-solid fa-receipt",l:"Rent"},{k:"complaints",ic:"fa-solid fa-triangle-exclamation",l:"Issues"},{k:"you",ic:"fa-solid fa-bars",l:"More"}];
function BottomNav({ active, onTab }) {
  return (
    <nav style={{flexShrink:0,display:"flex",background:C.card,borderTop:`1.5px solid ${C.bdr}`,padding:"10px 4px 16px",paddingBottom:"max(16px,env(safe-area-inset-bottom))",boxShadow:"0 -4px 16px rgba(0,0,0,.05)"}}>
      {TABS.map(t=>{const on=active===t.k;return(<button key={t.k} onClick={()=>onTab(t.k)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",padding:"0 4px"}}><div style={{width:40,height:36,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",background:on?C.primaryLight:"transparent",color:on?C.primary:C.t3,transition:"all .2s"}}><i className={t.ic} style={{fontSize:18}}/></div><span style={{fontSize:10,fontWeight:600,color:on?C.primary:C.t3}}>{t.l}</span></button>);})}
    </nav>
  );
}

function QuickTiles({ onAnalytics, onExpenses, onRemind }) {
  const tiles=[{ic:"fa-solid fa-chart-line",l:"Analytics",bg:C.secondLight,ic2:C.secondary,fn:onAnalytics},{ic:"fa-solid fa-receipt",l:"Expenses",bg:C.warnLight,ic2:C.warning,fn:onExpenses},{ic:"fa-brands fa-whatsapp",l:"Remind",bg:C.successLight,ic2:C.success,fn:onRemind},{ic:"fa-solid fa-file-pdf",l:"Report",bg:"#DBEAFE",ic2:"#1D4ED8",fn:()=>{}}];
  return (
    <motion.div variants={stagger(.05)} initial="hidden" animate="visible" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
      {tiles.map(t=>(<motion.button key={t.l} variants={vScale} whileTap={{scale:.88}} onClick={t.fn} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"14px 4px 12px",borderRadius:16,background:C.card,border:`1.5px solid ${C.bdr}`,cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}><div style={{width:42,height:42,borderRadius:12,background:t.bg,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:7}}><i className={t.ic} style={{fontSize:18,color:t.ic2}}/></div><span style={{fontSize:11,fontWeight:600,color:C.t2}}>{t.l}</span></motion.button>))}
    </motion.div>
  );
}

function AnalyticsSheet({ rooms, onClose }) {
  const total=rooms.length,occupied=rooms.filter(r=>r.tenantName?.trim()).length,vacant=total-occupied,paid=rooms.filter(r=>r.status==="paid").length,pending=rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim()).length,revenue=rooms.reduce((s,r)=>s+(r.amountPaid||0),0),dues=rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).reduce((s,r)=>s+(r.balanceDue||r.rent||0),0),totalRent=rooms.filter(r=>r.tenantName?.trim()).reduce((s,r)=>s+(r.rent||0),0),pct=totalRent>0?Math.round(revenue/totalRent*100):0;
  const StatCard=({label,value,sub,color})=>(<div style={{background:C.bg,borderRadius:14,padding:"14px 16px",border:`1.5px solid ${C.bdr}`}}><p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>{label}</p><p style={{fontSize:24,fontWeight:700,color:color||C.t1,lineHeight:1,fontFamily:"'IBM Plex Mono',monospace"}}>{value}</p>{sub&&<p style={{fontSize:11,color:C.t2,marginTop:4}}>{sub}</p>}</div>);
  return (
    <Sheet onClose={onClose} title="📊 Analytics">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <StatCard label="Revenue" value={inr(revenue)} sub="This month" color={C.warning}/>
        <StatCard label="Dues" value={inr(dues)} sub="Pending collection" color={C.danger}/>
        <StatCard label="Occupied" value={`${occupied}/${total}`} sub="Rooms filled" color={C.primary}/>
        <StatCard label="Paid" value={`${paid}/${occupied||1}`} sub="Paid this month" color={C.success}/>
      </div>
      <div style={{background:C.bg,borderRadius:14,padding:"14px 16px",border:`1.5px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><p style={{fontSize:12,fontWeight:700,color:C.t1}}>Collection Rate</p><p style={{fontSize:14,fontWeight:700,color:C.primary,fontFamily:"'IBM Plex Mono',monospace"}}>{pct}%</p></div>
        <div style={{height:8,borderRadius:99,background:C.bdr,overflow:"hidden"}}><motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:.8,ease:[.4,0,.2,1]}} style={{height:"100%",borderRadius:99,background:G.primary}}/></div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}><p style={{fontSize:11,color:C.t3}}>Collected: {inr(revenue)}</p><p style={{fontSize:11,color:C.t3}}>Expected: {inr(totalRent)}</p></div>
      </div>
      <div style={{background:C.bg,borderRadius:14,padding:"14px 16px",border:`1.5px solid ${C.bdr}`}}>
        <p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:10}}>Room Status Breakdown</p>
        {[{l:"Paid",v:paid,c:C.success,pct:total?Math.round(paid/total*100):0},{l:"Pending",v:pending,c:C.danger,pct:total?Math.round(pending/total*100):0},{l:"Vacant",v:vacant,c:C.t3,pct:total?Math.round(vacant/total*100):0}].map(row=>(<div key={row.l} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:600,color:C.t2}}>{row.l}</span><span style={{fontSize:12,fontWeight:700,color:row.c}}>{row.v} rooms ({row.pct}%)</span></div><div style={{height:5,borderRadius:99,background:C.bdr,overflow:"hidden"}}><div style={{height:"100%",borderRadius:99,background:row.c,width:`${row.pct}%`,transition:"width .6s"}}/></div></div>))}
      </div>
      <div style={{height:8}}/>
    </Sheet>
  );
}

function ExpensesSheet({ ownerId, onClose, toast }) {
  const [expenses,setExpenses]=useState([]); const [loading,setLoading]=useState(true); const [adding,setAdding]=useState(false); const [desc,setDesc]=useState(""); const [amount,setAmount]=useState(""); const [category,setCategory]=useState("maintenance"); const [saving,setSaving]=useState(false);
  const CATS=[{k:"maintenance",l:"🔧 Maintenance"},{k:"electricity",l:"⚡ Electricity"},{k:"water",l:"💧 Water"},{k:"cleaning",l:"🧹 Cleaning"},{k:"other",l:"📦 Other"}];
  useEffect(()=>{if(!ownerId)return;getDocs(query(collection(db,"expenses"),where("ownerId","==",ownerId))).then(s=>{const list=s.docs.map(d=>({id:d.id,...d.data()}));list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));setExpenses(list);}).catch(()=>{}).finally(()=>setLoading(false));},[ownerId]);
  const handleAdd=async e=>{e.preventDefault();if(!desc.trim()||!amount)return;setSaving(true);try{const newExp={ownerId,description:desc.trim(),amount:parseInt(amount,10)||0,category,createdAt:new Date().toISOString()};const ref=await addDoc(collection(db,"expenses"),newExp);setExpenses(p=>[{id:ref.id,...newExp},...p]);setDesc("");setAmount("");setAdding(false);toast("✓ Expense added!");}catch(e){toast(e.message,"error");}setSaving(false);};
  const total=expenses.reduce((s,e)=>s+(e.amount||0),0);
  return (
    <Sheet onClose={onClose} title="🧾 Expenses">
      <div style={{background:G.primary,borderRadius:14,padding:"16px",marginBottom:16,textAlign:"center"}}><p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.6)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Total Expenses</p><p style={{fontSize:28,fontWeight:700,color:"white",fontFamily:"'IBM Plex Mono',monospace"}}>{inr(total)}</p></div>
      {!adding&&<button onClick={()=>setAdding(true)} style={{width:"100%",padding:"12px",borderRadius:12,border:`1.5px dashed ${C.bdr}`,background:"none",cursor:"pointer",color:C.primary,fontWeight:700,fontSize:14,marginBottom:16}}><i className="fa-solid fa-plus" style={{marginRight:8}}/>Add Expense</button>}
      {adding&&<form onSubmit={handleAdd} style={{background:C.bg,borderRadius:14,padding:"14px",marginBottom:16,border:`1.5px solid ${C.bdr}`}}>
        <SInput label="Description" value={desc} onChange={setDesc} placeholder="e.g. Plumber repair" required/>
        <SInput label="Amount (₹)" type="number" value={amount} onChange={setAmount} placeholder="500" required min="1"/>
        <div style={{marginBottom:14}}><label style={{fontSize:11,fontWeight:700,color:C.t1,textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:6}}>Category</label><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{CATS.map(c=>(<button key={c.k} type="button" onClick={()=>setCategory(c.k)} style={{padding:"5px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:category===c.k?G.primary:C.card,color:category===c.k?"white":C.t2}}>{c.l}</button>))}</div></div>
        <div style={{display:"flex",gap:8}}><SBtn loading={saving} label="Save" grad={G.primary}/><button type="button" onClick={()=>setAdding(false)} style={{flex:1,padding:"13px",borderRadius:12,border:"none",cursor:"pointer",background:C.bg,color:C.t2,fontWeight:700,fontSize:14}}>Cancel</button></div>
      </form>}
      {loading?<p style={{textAlign:"center",color:C.t3,fontSize:13}}>Loading…</p>:expenses.length===0?<p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"20px 0"}}>No expenses recorded yet.</p>:expenses.map(e=>(<div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${C.bdr}`}}><div style={{width:36,height:36,borderRadius:10,background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>{CATS.find(c=>c.k===e.category)?.l.split(" ")[0]||"📦"}</div><div style={{flex:1}}><p style={{fontWeight:700,fontSize:13,color:C.t1}}>{e.description}</p><p style={{fontSize:11,color:C.t3}}>{new Date(e.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p></div><p style={{fontWeight:700,fontSize:14,color:C.danger,fontFamily:"'IBM Plex Mono',monospace"}}>-{inr(e.amount)}</p></div>))}
      <div style={{height:8}}/>
    </Sheet>
  );
}

function RemindSheet({ rooms, onClose }) {
  const pendingTenants=rooms.filter(r=>r.status!=="paid"&&r.tenantPhone?.trim()&&r.tenantName?.trim());
  const sendReminder=room=>{const msg=encodeURIComponent(`🏠 *RoomKhata Pro — Rent Reminder*\n\nनमस्ते ${room.tenantName}! 🙏\n\nRoom *${room.roomNo}* का किराया अभी तक नहीं आया है।\n\nDue Amount: *₹${(room.rent||0)+(room.electricityBill||0)}*\n\nकृपया जल्दी payment करें। धन्यवाद! 🙏`);window.open(`https://wa.me/91${room.tenantPhone}?text=${msg}`,"_blank");};
  const sendAll=()=>pendingTenants.forEach(r=>{const msg=encodeURIComponent(`🏠 *RoomKhata Pro — Rent Reminder*\n\nनमस्ते ${r.tenantName}! 🙏\n\nRoom *${r.roomNo}* का किराया pending है।\n\nDue: *₹${(r.rent||0)+(r.electricityBill||0)}*\n\nPlease pay soon. धन्यवाद! 🙏`);window.open(`https://wa.me/91${r.tenantPhone}?text=${msg}`,"_blank");});
  return (
    <Sheet onClose={onClose} title="📲 WhatsApp Remind">
      <div style={{background:C.successLight,border:"1.5px solid #86EFAC",borderRadius:12,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:8}}><i className="fa-solid fa-circle-info" style={{color:C.success,marginTop:2,fontSize:13}}/><p style={{fontSize:12,color:"#14532D",fontWeight:500,lineHeight:1.5}}>यह WhatsApp पर rent reminder भेजेगा। केवल उन tenants के लिए जिनका phone number registered है।</p></div>
      {pendingTenants.length===0?(<div style={{textAlign:"center",padding:"32px 0"}}><p style={{fontSize:40,marginBottom:8}}>🎉</p><p style={{fontWeight:700,fontSize:16,color:C.t1}}>सबने किराया दे दिया!</p><p style={{fontSize:13,color:C.t2,marginTop:4}}>All pending tenants have paid.</p></div>):(
        <><button onClick={sendAll} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:16,boxShadow:"0 4px 14px rgba(34,197,94,.3)"}}><i className="fa-brands fa-whatsapp" style={{fontSize:18}}/>Send to All ({pendingTenants.length})</button>
        {pendingTenants.map(r=>(<div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${C.bdr}`}}><div style={{width:40,height:40,borderRadius:12,background:G.secondary,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"white",fontWeight:700,fontSize:14}}>{init(r.tenantName)}</div><div style={{flex:1}}><p style={{fontWeight:700,fontSize:13,color:C.t1}}>{r.tenantName}</p><p style={{fontSize:11,color:C.t3}}>Room {r.roomNo} · +91 {r.tenantPhone}</p></div><button onClick={()=>sendReminder(r)} style={{padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:700,fontSize:11,display:"flex",alignItems:"center",gap:5}}><i className="fa-brands fa-whatsapp"/>Send</button></div>))}</>
      )}
      <div style={{height:8}}/>
    </Sheet>
  );
}

function TenantsSheet({ rooms, onClose, onEditRoom }) {
  const tenants=rooms.filter(r=>r.tenantName?.trim()); const [search,setSearch]=useState("");
  const filtered=tenants.filter(r=>{const q=search.toLowerCase();return !q||r.tenantName?.toLowerCase().includes(q)||r.roomNo?.toString().includes(q);});
  return (
    <Sheet onClose={onClose} title={`👥 Tenants (${tenants.length})`}>
      <div style={{position:"relative",marginBottom:14}}><i className="fa-solid fa-magnifying-glass" style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.t3,pointerEvents:"none"}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tenant or room…" style={{width:"100%",padding:"11px 12px 11px 38px",borderRadius:12,border:`1.5px solid ${C.bdr}`,background:C.bg,fontSize:14,fontWeight:500,color:C.t1,outline:"none",fontFamily:"'Inter',sans-serif"}} onFocus={e=>{e.target.style.borderColor=C.primary;}} onBlur={e=>{e.target.style.borderColor=C.bdr;}}/></div>
      {filtered.length===0?<p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"24px 0"}}>No tenants found.</p>:filtered.map(r=>{const SC2={paid:C.success,pending:C.danger,partial:C.warning,pending_verification:C.secondary};const statusCol=SC2[r.status]||C.danger;return(<div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.bdr}`}}><div style={{width:44,height:44,borderRadius:14,background:G.secondary,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"white",fontWeight:700,fontSize:15}}>{init(r.tenantName)}</div><div style={{flex:1,minWidth:0}}><p style={{fontWeight:700,fontSize:14,color:C.t1}}>{r.tenantName}</p><p style={{fontSize:11,color:C.t3}}>Room {r.roomNo} · {inr(r.rent)}/mo</p>{r.tenantPhone&&<p style={{fontSize:11,color:C.t3}}>+91 {r.tenantPhone}</p>}</div><div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}><span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:statusCol+"22",color:statusCol}}>{r.status==="paid"?"✓ Paid":r.status==="pending"?"⏳ Due":r.status==="pending_verification"?"👀 Verify":"◑ Partial"}</span><button onClick={()=>{onEditRoom(r);onClose();}} style={{fontSize:11,fontWeight:700,color:C.primary,background:"none",border:"none",cursor:"pointer",padding:0}}>Edit →</button></div></div>);})}
      <div style={{height:8}}/>
    </Sheet>
  );
}

function PaymentsSheet({ rooms, onClose }) {
  const paid=rooms.filter(r=>r.status==="paid"&&r.tenantName?.trim()),pending=rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim()),partial=rooms.filter(r=>r.status==="partial"&&r.tenantName?.trim()),verify=rooms.filter(r=>r.status==="pending_verification"&&r.tenantName?.trim()),totalCollected=paid.reduce((s,r)=>s+(r.amountPaid||r.rent||0),0),totalDue=pending.reduce((s,r)=>s+(r.rent||0),0);
  const Row=({r,col,badge})=>(<div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}><div style={{width:38,height:38,borderRadius:12,background:G.secondary,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"white",fontWeight:700,fontSize:13}}>{init(r.tenantName)}</div><div style={{flex:1,minWidth:0}}><p style={{fontWeight:700,fontSize:13,color:C.t1}}>{r.tenantName}</p><p style={{fontSize:11,color:C.t3}}>Room {r.roomNo}</p></div><div style={{textAlign:"right"}}><p style={{fontWeight:700,fontSize:13,color:col,fontFamily:"'IBM Plex Mono',monospace"}}>{inr(r.amountPaid||r.rent||0)}</p><span style={{fontSize:10,fontWeight:700,color:col,background:col+"22",padding:"2px 6px",borderRadius:6}}>{badge}</span></div></div>);
  return (
    <Sheet onClose={onClose} title="💰 Payments">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:C.successLight,borderRadius:12,padding:"12px",border:"1.5px solid #86EFAC"}}><p style={{fontSize:10,fontWeight:700,color:"#14532D",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Collected</p><p style={{fontSize:20,fontWeight:700,color:C.success,fontFamily:"'IBM Plex Mono',monospace"}}>{inr(totalCollected)}</p><p style={{fontSize:11,color:C.success,marginTop:2}}>{paid.length} tenants</p></div>
        <div style={{background:C.dangerLight,borderRadius:12,padding:"12px",border:"1.5px solid #FECACA"}}><p style={{fontSize:10,fontWeight:700,color:"#7F1D1D",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Pending</p><p style={{fontSize:20,fontWeight:700,color:C.danger,fontFamily:"'IBM Plex Mono',monospace"}}>{inr(totalDue)}</p><p style={{fontSize:11,color:C.danger,marginTop:2}}>{pending.length} tenants</p></div>
      </div>
      {verify.length>0&&<><p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:8}}>👀 Awaiting Verification</p>{verify.map(r=><Row key={r.id} r={r} col={C.secondary} badge="Verify"/>)}<div style={{marginBottom:12}}/></>}
      {paid.length>0&&<><p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:8}}>✓ Paid</p>{paid.map(r=><Row key={r.id} r={r} col={C.success} badge="Paid"/>)}<div style={{marginBottom:12}}/></>}
      {partial.length>0&&<><p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:8}}>◑ Partial</p>{partial.map(r=><Row key={r.id} r={r} col={C.warning} badge="Partial"/>)}<div style={{marginBottom:12}}/></>}
      {pending.length>0&&<><p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:8}}>⏳ Pending</p>{pending.map(r=><Row key={r.id} r={r} col={C.danger} badge="Due"/>)}</>}
      <div style={{height:8}}/>
    </Sheet>
  );
}

function ComplaintsSheet({ ownerId, rooms, onClose }) {
  const [list,setList]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{if(!ownerId)return;const unsub=onSnapshot(query(collection(db,"complaints"),where("ownerId","==",ownerId)),snap=>{const l=snap.docs.map(d=>({id:d.id,...d.data()}));l.sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0));setList(l);setLoading(false);},()=>setLoading(false));return unsub;},[ownerId]);
  const resolve=async id=>{try{await updateDoc(doc(db,"complaints",id),{status:"resolved",resolvedAt:new Date().toISOString()});}catch{}};
  const prioColor={low:C.success,medium:C.warning,high:C.danger},typeIcon={water:"💧",electricity:"⚡",maintenance:"🔧",noise:"🔊",other:"📝"},open=list.filter(c=>c.status!=="resolved"),resolved=list.filter(c=>c.status==="resolved");
  return (
    <Sheet onClose={onClose} title={`🚨 Complaints (${open.length} open)`}>
      {loading?<p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"20px 0"}}>Loading…</p>:list.length===0?(<div style={{textAlign:"center",padding:"40px 0"}}><p style={{fontSize:42,marginBottom:10}}>🎉</p><p style={{fontWeight:700,fontSize:16,color:C.t1}}>कोई complaint नहीं!</p><p style={{fontSize:13,color:C.t2,marginTop:4}}>All tenants are happy 😊</p></div>):(
        <>{open.length>0&&<><p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Open</p>{open.map(c=>{const room=rooms.find(r=>r.id===c.roomId);return(<div key={c.id} style={{background:C.bg,borderRadius:14,padding:"14px",marginBottom:10,border:`1.5px solid ${C.bdr}`}}><div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}><span style={{fontSize:22,flexShrink:0}}>{typeIcon[c.type]||"📝"}</span><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}><span style={{fontSize:12,fontWeight:700,color:C.t1,textTransform:"capitalize"}}>{c.type}</span><span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,background:(prioColor[c.priority]||C.warning)+"22",color:prioColor[c.priority]||C.warning}}>{c.priority} priority</span></div><p style={{fontSize:13,color:C.t1,lineHeight:1.5,marginBottom:4}}>{c.description}</p><p style={{fontSize:11,color:C.t3}}>Room {room?.roomNo||c.roomId?.slice(-4)} · {room?.tenantName||"Tenant"} · {c.createdAt?new Date(c.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):""}</p></div></div><div style={{display:"flex",gap:8}}><button onClick={()=>resolve(c.id)} style={{flex:1,padding:"8px",borderRadius:10,border:"none",cursor:"pointer",background:G.success,color:"white",fontWeight:700,fontSize:12}}>✓ Mark Resolved</button>{room?.tenantPhone&&<button onClick={()=>window.open(`https://wa.me/91${room.tenantPhone}?text=${encodeURIComponent(`नमस्ते ${room.tenantName}! आपकी complaint मिल गई। हम जल्दी ठीक करेंगे। 🙏`)}`,"_blank")} style={{padding:"8px 12px",borderRadius:10,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}><i className="fa-brands fa-whatsapp"/>Reply</button>}</div></div>);})}</>}
        {resolved.length>0&&<><p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",margin:"16px 0 10px"}}>Resolved ({resolved.length})</p>{resolved.map(c=>{const room=rooms.find(r=>r.id===c.roomId);return(<div key={c.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`,opacity:.6}}><span style={{fontSize:18,flexShrink:0}}>{typeIcon[c.type]||"📝"}</span><div style={{flex:1,minWidth:0}}><p style={{fontSize:13,fontWeight:600,color:C.t1}}>{c.description}</p><p style={{fontSize:11,color:C.t3}}>Room {room?.roomNo||""} · {room?.tenantName||"Tenant"}</p></div><span style={{fontSize:10,fontWeight:700,color:C.success,background:C.successLight,padding:"2px 8px",borderRadius:8,flexShrink:0}}>✓ Done</span></div>);})}  </>}
        </>
      )}
      <div style={{height:8}}/>
    </Sheet>
  );
}

function YouSheet({ ownerName, authUser, onClose, onAction }) {
  const { language, setLanguage }=useApp();
  const Row=({ icon, bg, iconColor, label, sub, right, onClick, red })=>(<button onClick={onClick} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 0",background:"none",border:"none",cursor:"pointer",borderBottom:`1px solid ${C.bdr2}`,textAlign:"left"}}><div style={{width:40,height:40,borderRadius:12,background:bg||C.primaryLight,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><i className={icon} style={{fontSize:16,color:iconColor||C.primary}}/></div><div style={{flex:1,minWidth:0}}><p style={{fontWeight:700,fontSize:14,color:red?C.danger:C.t1}}>{label}</p>{sub&&<p style={{fontSize:11,color:C.t2,marginTop:1}}>{sub}</p>}</div>{right||<i className="fa-solid fa-chevron-right" style={{fontSize:12,color:C.bdr,flexShrink:0}}/>}</button>);
  return (
    <Sheet onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:14,padding:14,borderRadius:14,background:C.bg,marginBottom:8,border:`1.5px solid ${C.bdr}`}}><div style={{width:52,height:52,borderRadius:14,background:G.primary,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:18}}>{init(ownerName||authUser?.email||"O")}</div><div style={{flex:1,minWidth:0}}><p style={{fontWeight:700,fontSize:16,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ownerName||"Owner"}</p><p style={{fontSize:12,color:C.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser?.email}</p></div><button onClick={()=>{onClose();onAction("profile");}} style={{padding:"6px 12px",borderRadius:10,border:"none",cursor:"pointer",background:C.primaryLight,color:C.primary,fontWeight:700,fontSize:12}}>Edit</button></div>
      <Row icon="fa-solid fa-chart-line" bg={C.secondLight} iconColor={C.secondary} label="Analytics" sub="Revenue & occupancy trends" onClick={()=>{onClose();onAction("analytics");}}/>
      <Row icon="fa-solid fa-user-pen" bg={C.warnLight} iconColor={C.warning} label="Edit Profile" sub="Name, address, UPI ID" onClick={()=>{onClose();onAction("profile");}}/>
      <Row icon="fa-solid fa-cloud-arrow-down" bg={C.successLight} iconColor={C.success} label="Backup Data" sub="Download JSON snapshot" onClick={()=>{onClose();onAction("backup");}}/>
      <Row icon="fa-solid fa-language" bg={C.primaryLight} iconColor={C.primary} label="Language" sub={language==="hi"?"हिंदी चालू है":"English is on"} onClick={()=>setLanguage(language==="hi"?"en":"hi")} right={<div style={{width:46,height:26,borderRadius:99,flexShrink:0,position:"relative",cursor:"pointer",background:language==="hi"?C.primary:C.bdr2,transition:"background .25s"}}><div style={{position:"absolute",top:3,width:20,height:20,borderRadius:"50%",background:"white",boxShadow:"0 1px 4px rgba(0,0,0,.2)",transition:"left .25s",left:language==="hi"?"calc(100% - 23px)":3}}/></div>}/>
      <Row icon="fa-solid fa-right-from-bracket" bg={C.dangerLight} iconColor={C.danger} label="Logout" sub="Sign out of your account" onClick={()=>onAction("logout")} red/>
      <div style={{height:8}}/>
    </Sheet>
  );
}

function InviteSheet({ room, onClose }) {
  const [copied,setCopied]=useState(false); const code=room.connectionCode||"N/A";
  const copyCode=async()=>{try{await navigator.clipboard.writeText(code);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{const el=document.createElement("textarea");el.value=code;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);setCopied(true);setTimeout(()=>setCopied(false),2000);}};
  const shareWhatsApp=()=>{const msg=encodeURIComponent(`🏠 *RoomKhata Pro — Room Invitation*\n\nHello! आपको Room *${room.roomNo}* में invite किया गया है।\n\n*Connection Code: ${code}*\n\nSteps:\n1️⃣ App open करें\n2️⃣ "किरायेदार" select करें\n3️⃣ अपना WhatsApp number डालें\n4️⃣ यह code: *${code}* डालें\n\n✅ Done!`);window.open(`https://wa.me/?text=${msg}`,"_blank");};
  return (
    <Sheet onClose={onClose} title={`🔗 Invite — Room ${room.roomNo}`}>
      <p style={{fontSize:13,color:C.t2,marginBottom:20,lineHeight:1.6}}>Tenant को यह code share करें। Login करते समय यह code डालकर वो इस room से connect हो जाएगा।</p>
      <div style={{background:`linear-gradient(135deg,${C.dark},${C.dark2})`,borderRadius:18,padding:"28px 20px",textAlign:"center",marginBottom:16,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",background:"rgba(20,145,155,.2)",pointerEvents:"none"}}/><p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".14em",marginBottom:10}}>Connection Code</p><p style={{fontSize:36,fontWeight:700,color:"white",letterSpacing:".2em",fontFamily:"'IBM Plex Mono',monospace",lineHeight:1}}>{code}</p><p style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:10}}>Room {room.roomNo}{room.tenantName?` · Currently: ${room.tenantName}`:""}</p></div>
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        <button onClick={copyCode} style={{flex:1,padding:"13px",borderRadius:12,border:`1.5px solid ${copied?"transparent":C.bdr}`,cursor:"pointer",background:copied?G.success:C.bg,color:copied?"white":C.primary,fontWeight:700,fontSize:14,transition:"all .2s"}}>{copied?"✓ Copied!":"📋 Copy Code"}</button>
        <button onClick={shareWhatsApp} style={{flex:1,padding:"13px",borderRadius:12,border:"none",cursor:"pointer",background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}><i className="fa-brands fa-whatsapp" style={{fontSize:16}}/>Share</button>
      </div>
      <div style={{background:C.bg,borderRadius:14,padding:"14px 16px",border:`1.5px solid ${C.bdr}`}}><p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:10}}>Tenant कैसे join करे?</p>{["App open करें और \"किरायेदार\" select करें","अपना WhatsApp number डालें",`Connection Code डालें: ${code}`,"Done! Room automatically connect हो जाएगा"].map((s,i)=>(<div key={i} style={{display:"flex",gap:10,marginBottom:8}}><div style={{width:22,height:22,borderRadius:"50%",background:G.primary,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:11}}>{i+1}</div><p style={{fontSize:12,color:C.t2,paddingTop:2,lineHeight:1.5}}>{s}</p></div>))}</div>
      <div style={{height:8}}/>
    </Sheet>
  );
}

function AddBillSheet({ room, onClose, toast }) {
  const [amount,setAmount]=useState(String(room.electricityBill||"")); const [month,setMonth]=useState(new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})); const [busy,setBusy]=useState(false);
  const go=async e=>{e.preventDefault();const bill=parseInt(amount,10);if(!bill||bill<0)return;setBusy(true);try{await updateDoc(doc(db,"rooms",room.id),{electricityBill:bill,lastBillMonth:month,...(room.status==="paid"?{status:"pending",amountPaid:0,balanceDue:(room.rent||0)+bill}:{})});toast(`⚡ Bill ₹${bill.toLocaleString("en-IN")} added for Room ${room.roomNo}`);onClose();}catch(e){toast(e.message,"error");}setBusy(false);};
  const currentTotal=(room.rent||0)+(parseInt(amount,10)||0);
  return (
    <Sheet onClose={onClose} title={`⚡ Electricity Bill — Room ${room.roomNo}`}>
      <form onSubmit={go}>
        <div style={{background:G.primary,borderRadius:14,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}><div style={{width:42,height:42,borderRadius:12,background:"rgba(255,255,255,.15)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:700,fontSize:15}}>{init(room.tenantName)}</div><div><p style={{fontSize:14,fontWeight:700,color:"white"}}>{room.tenantName}</p><p style={{fontSize:11,color:"rgba(255,255,255,.6)"}}>Room {room.roomNo} · Rent {inr(room.rent)}</p></div></div>
        <SInput label="Electricity Bill Amount (₹)" type="number" value={amount} onChange={setAmount} placeholder="e.g. 850" required min="1"/>
        <SInput label="Billing Month" value={month} onChange={setMonth} placeholder="e.g. June 2025"/>
        {parseInt(amount,10)>0&&<div style={{background:C.warnLight,border:"1.5px solid #FEF08A",borderRadius:12,padding:"12px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><p style={{fontSize:11,color:"#92400E",fontWeight:600}}>New Total Due</p><p style={{fontSize:11,color:C.warning}}>Rent {inr(room.rent)} + ⚡ {inr(parseInt(amount,10)||0)}</p></div><p style={{fontSize:22,fontWeight:700,color:C.warning,fontFamily:"'IBM Plex Mono',monospace"}}>{inr(currentTotal)}</p></div>}
        {room.status==="paid"&&<div style={{background:C.warnLight,border:"1.5px solid #FDE68A",borderRadius:12,padding:"10px 14px",marginBottom:14}}><p style={{fontSize:12,color:"#92400E",fontWeight:600}}>⚠️ Room की status "Paid" है — bill add करने पर status वापस "Pending" हो जाएगी।</p></div>}
        <SBtn loading={busy} label="⚡ Bill Save करें" grad={G.amber}/>
        <div style={{height:8}}/>
      </form>
    </Sheet>
  );
}

function AssignTenantSheet({ room, onClose, toast }) {
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [rent,setRent]=useState(String(room.rent||"")); const [deposit,setDeposit]=useState(String(room.securityDeposit||"")); const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const go=async e=>{e.preventDefault();setErr("");if(!name.trim()){setErr("Tenant का नाम जरूरी है।");return;}if(phone&&phone.length!==10){setErr("Phone 10 digits का होना चाहिए।");return;}setBusy(true);try{await updateDoc(doc(db,"rooms",room.id),{tenantName:name.trim(),tenantPhone:phone.trim()||"",rent:parseInt(rent,10)||0,securityDeposit:parseInt(deposit,10)||0,status:"pending",tenantUid:"",amountPaid:0,balanceDue:parseInt(rent,10)||0,assignedAt:new Date().toISOString()});toast(`✓ ${name.trim()} को Room ${room.roomNo} में assign किया!`);onClose();}catch(e){setErr(e.message);}setBusy(false);};
  return (
    <Sheet onClose={onClose} title={`🏠 Assign Tenant — Room ${room.roomNo}`}>
      <form onSubmit={go}>
        <div style={{background:C.bg,border:`1.5px solid ${C.bdr}`,borderRadius:12,padding:"12px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}><div style={{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#CBD5E1,#94A3B8)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><i className="fa-solid fa-door-open" style={{fontSize:16,color:"white",opacity:.7}}/></div><div><p style={{fontSize:13,fontWeight:700,color:C.t1}}>Room {room.roomNo}</p><p style={{fontSize:11,color:C.t3}}>Currently Vacant</p></div></div>
        <SInput label="Tenant का नाम *" value={name} onChange={setName} placeholder="Ravi Kumar" required/>
        <div style={{marginBottom:14}}><label style={{display:"block",fontSize:11,fontWeight:700,color:C.t1,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>WhatsApp Number (optional)</label><div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,fontWeight:700,color:C.primary,pointerEvents:"none"}}>+91</span><input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit number" style={{width:"100%",padding:"12px 14px 12px 48px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",color:C.t1,fontFamily:"'Inter',sans-serif",background:"#F9FAFB",border:`1.5px solid ${C.bdr}`,transition:"all .2s"}} onFocus={e=>{e.target.style.borderColor=C.primary;e.target.style.background=C.card;}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F9FAFB";}}/></div><p style={{fontSize:11,color:C.t3,marginTop:4}}>Number देने पर tenant को WhatsApp reminder भेज सकते हैं।</p></div>
        <SInput label="Monthly Rent (₹) *" type="number" value={rent} onChange={setRent} placeholder="8000" required min="1"/>
        <SInput label="Security Deposit (₹)" type="number" value={deposit} onChange={setDeposit} placeholder="16000" min="0"/>
        {name.trim()&&parseInt(rent,10)>0&&<div style={{background:C.successLight,border:"1.5px solid #86EFAC",borderRadius:12,padding:"12px 16px",marginBottom:14}}><p style={{fontSize:12,fontWeight:700,color:"#14532D",marginBottom:6}}>Assignment Summary</p><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#166534"}}>Tenant</span><span style={{fontSize:12,fontWeight:700,color:"#14532D"}}>{name.trim()}</span></div><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#166534"}}>Monthly Rent</span><span style={{fontSize:12,fontWeight:700,color:"#14532D"}}>{inr(parseInt(rent,10)||0)}</span></div>{parseInt(deposit,10)>0&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:"#166534"}}>Security Deposit</span><span style={{fontSize:12,fontWeight:700,color:"#14532D"}}>{inr(parseInt(deposit,10))}</span></div>}</div>}
        <ErrBox msg={err}/>
        <SBtn loading={busy} label="✓ Tenant Assign करें" grad={G.success}/>
        <div style={{background:C.bg,border:`1.5px solid ${C.bdr}`,borderRadius:12,padding:"10px 14px",marginTop:12}}><p style={{fontSize:11,color:C.t2,lineHeight:1.5}}>💡 अगर tenant app use करना चाहे तो बाद में <strong>🔗 Invite</strong> button से Connection Code share करें।</p></div>
        <div style={{height:8}}/>
      </form>
    </Sheet>
  );
}

function pickPhoto(onChange) {
  const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; inp.capture="environment";
  inp.onchange=e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=ev=>onChange(ev.target.result);reader.readAsDataURL(file);};
  inp.click();
}
function Avatar({ src, name, size=64, grad, onPick, label="Photo" }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <div onClick={onPick?()=>pickPhoto(onPick):undefined} style={{width:size,height:size,borderRadius:size*.28,flexShrink:0,cursor:onPick?"pointer":"default",background:src?"transparent":grad||G.secondary,overflow:"hidden",position:"relative",border:`2px solid ${src?C.primaryBorder:"transparent"}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
        {src?<img src={src} alt={name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{color:"white",fontWeight:700,fontSize:size*.24}}>{init(name)}</span>}
        {onPick&&<div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.35)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .2s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}><i className="fa-solid fa-camera" style={{color:"white",fontSize:size*.2}}/></div>}
      </div>
      {onPick&&<span style={{fontSize:10,fontWeight:600,color:C.t3,cursor:"pointer"}} onClick={()=>pickPhoto(onPick)}><i className="fa-solid fa-camera" style={{marginRight:4}}/>{label}</span>}
    </div>
  );
}

function TenantDetailSheet({ room, onClose, toast }) {
  const [photo,setPhoto]=useState(room.tenantPhoto||""); const [name,setName]=useState(room.tenantName||""); const [phone,setPhone]=useState(room.tenantPhone||""); const [aadhaar,setAadhaar]=useState(room.tenantAadhaar||""); const [address,setAddress]=useState(room.tenantAddress||""); const [occupation,setOccupation]=useState(room.tenantOccupation||""); const [emergencyName,setEmName]=useState(room.emergencyName||""); const [emergencyPhone,setEmPhone]=useState(room.emergencyPhone||""); const [dob,setDob]=useState(room.tenantDob||""); const [busy,setBusy]=useState(false); const [tab,setTab]=useState("details");
  const save=async e=>{e.preventDefault();setBusy(true);try{await updateDoc(doc(db,"rooms",room.id),{tenantPhoto:photo,tenantName:name.trim(),tenantPhone:phone.trim(),tenantAadhaar:aadhaar.trim(),tenantAddress:address.trim(),tenantOccupation:occupation.trim(),emergencyName:emergencyName.trim(),emergencyPhone:emergencyPhone.trim(),tenantDob:dob});toast(`✓ ${name.trim()} का profile update हो गया!`);onClose();}catch(e){toast(e.message,"error");}setBusy(false);};
  const TAB=(k,l)=>(<button type="button" onClick={()=>setTab(k)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,background:tab===k?G.primary:C.bg,color:tab===k?"white":C.t2,transition:"all .2s"}}>{l}</button>);
  return (
    <Sheet onClose={onClose} title="">
      <div style={{padding:"0 18px"}}>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18,paddingTop:4}}>
          <Avatar src={photo} name={name||"?"} size={72} onPick={setPhoto} label="Change Photo"/>
          <div style={{flex:1}}><p style={{fontWeight:700,fontSize:18,color:C.t1,lineHeight:1.1}}>{name||"New Tenant"}</p><p style={{fontSize:12,color:C.t3,marginTop:3}}>Room {room.roomNo}</p>{occupation&&<p style={{fontSize:12,color:C.primary,fontWeight:600,marginTop:2}}>{occupation}</p>}</div>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16}}><TAB k="details" l="👤 Details"/><TAB k="docs" l="📄 Documents"/><TAB k="emergency" l="🆘 Emergency"/></div>
        <form onSubmit={save}>
          {tab==="details"&&<>
            <SInput label="Full Name *" value={name} onChange={setName} placeholder="Ravi Kumar" required/>
            <div style={{marginBottom:13}}><label style={{display:"block",fontSize:11,fontWeight:700,color:C.t1,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>WhatsApp Number</label><div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,fontWeight:700,color:C.primary,pointerEvents:"none"}}>+91</span><input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit number" style={{width:"100%",padding:"12px 14px 12px 48px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",color:C.t1,fontFamily:"'Inter',sans-serif",background:"#F9FAFB",border:`1.5px solid ${C.bdr}`,transition:"all .2s"}} onFocus={e=>{e.target.style.borderColor=C.primary;e.target.style.background=C.card;}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F9FAFB";}}/></div></div>
            <SInput label="Occupation / Profession" value={occupation} onChange={setOccupation} placeholder="e.g. Software Engineer, Student"/>
            <SInput label="Date of Birth" type="date" value={dob} onChange={setDob}/>
            <div style={{marginBottom:13}}><label style={{display:"block",fontSize:11,fontWeight:700,color:C.t1,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Permanent Address</label><textarea rows={3} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Permanent home address…" style={{width:"100%",padding:"12px 14px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",color:C.t1,fontFamily:"'Inter',sans-serif",resize:"none",background:"#F9FAFB",border:`1.5px solid ${C.bdr}`,transition:"all .2s"}} onFocus={e=>{e.target.style.borderColor=C.primary;e.target.style.background=C.card;}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F9FAFB";}}/></div>
          </>}
          {tab==="docs"&&<>
            <div style={{background:C.warnLight,border:"1.5px solid #FED7AA",borderRadius:12,padding:"10px 14px",marginBottom:16}}><p style={{fontSize:12,color:"#92400E",fontWeight:600}}>📸 Aadhaar card का photo click करके upload करें।</p></div>
            <SInput label="Aadhaar Number" value={aadhaar} onChange={v=>setAadhaar(v.replace(/\D/g,"").slice(0,12))} placeholder="12-digit Aadhaar number"/>
            <div style={{marginBottom:16}}><label style={{display:"block",fontSize:11,fontWeight:700,color:C.t1,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>Aadhaar Card Photo</label><div style={{display:"flex",gap:10}}>{["aadhaarFront","aadhaarBack"].map(k=>{const src=k==="aadhaarFront"?room.aadhaarFront:room.aadhaarBack;return(<div key={k} onClick={()=>pickPhoto(b64=>{updateDoc(doc(db,"rooms",room.id),{[k]:b64}).then(()=>toast(`✓ ${k==="aadhaarFront"?"Front":"Back"} uploaded!`)).catch(()=>toast("Upload failed","error"));})} style={{flex:1,aspectRatio:"1.6",borderRadius:12,cursor:"pointer",border:`2px dashed ${C.bdr}`,overflow:"hidden",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6}}>{src?<img src={src} alt={k} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<><i className="fa-solid fa-id-card" style={{fontSize:22,color:C.t3}}/><span style={{fontSize:10,fontWeight:600,color:C.t3}}>{k==="aadhaarFront"?"Front":"Back"}</span></>}</div>);})</div></div>
          </>}
          {tab==="emergency"&&<>
            <div style={{background:C.dangerLight,border:"1.5px solid #FECACA",borderRadius:12,padding:"10px 14px",marginBottom:16}}><p style={{fontSize:12,color:"#991B1B",fontWeight:600}}>🆘 Emergency में इस व्यक्ति से संपर्क करें।</p></div>
            <SInput label="Emergency Contact Name" value={emergencyName} onChange={setEmName} placeholder="Father / Mother / Spouse name"/>
            <div style={{marginBottom:13}}><label style={{display:"block",fontSize:11,fontWeight:700,color:C.t1,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Emergency Phone</label><div style={{position:"relative"}}><span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,fontWeight:700,color:C.primary,pointerEvents:"none"}}>+91</span><input type="tel" value={emergencyPhone} onChange={e=>setEmPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="Emergency number" style={{width:"100%",padding:"12px 14px 12px 48px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",color:C.t1,fontFamily:"'Inter',sans-serif",background:"#F9FAFB",border:`1.5px solid ${C.bdr}`,transition:"all .2s"}} onFocus={e=>{e.target.style.borderColor=C.primary;e.target.style.background=C.card;}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F9FAFB";}}/></div></div>
          </>}
          <SBtn loading={busy} label="💾 Save Profile" grad={G.secondary}/>
          <div style={{height:8}}/>
        </form>
      </div>
    </Sheet>
  );
}

function RoomDetailSheet({ room, buildings, onClose, onEdit, onToggle, onAddBill, onAssign, onInvite, onDelete, toast }) {
  const vacant=!room.tenantName?.trim(),total=(room.rent||0)+(room.electricityBill||0),cfg=SC[vacant?"vacant":(room.status||"pending")]||SC.pending,bName=buildings[room.buildingId]?.name||"";
  const [showTenant,setShowTenant]=useState(false);
  const Row=({icon,label,value,mono,color})=>value?(<div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 0",borderBottom:`1px solid ${C.bdr}`}}><i className={icon} style={{fontSize:14,color:C.primary,marginTop:2,width:16,textAlign:"center"}}/><div style={{flex:1}}><p style={{fontSize:11,color:C.t3,fontWeight:600,marginBottom:2}}>{label}</p><p style={{fontSize:14,fontWeight:700,color:color||C.t1,fontFamily:mono?"'IBM Plex Mono',monospace":"inherit"}}>{value}</p></div></div>):null;
  return (
    <><Sheet onClose={onClose} title="">
      <div style={{background:G.hdr,padding:"0 0 20px"}}>
        <div style={{padding:"16px 18px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}><div style={{width:52,height:52,borderRadius:14,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><i className="fa-solid fa-door-open" style={{fontSize:22,color:"white"}}/></div><div style={{flex:1}}><p style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:600,marginBottom:2}}>{bName||"Room"}</p><p style={{fontSize:22,fontWeight:700,color:"white"}}>Room {room.roomNo}</p></div><span style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,background:cfg.bdg[0]+"33",color:"white",border:"1px solid rgba(255,255,255,.2)"}}>{cfg.lbl}</span></div>
          <div style={{display:"flex",gap:8}}>{[{l:"Rent",v:inr(room.rent||0),c:"#F5A623"},{l:"Electricity",v:inr(room.electricityBill||0),c:"#FCD34D"},{l:"Total Due",v:inr(total),c:"#86EFAC"}].map(s=>(<div key={s.l} style={{flex:1,background:"rgba(255,255,255,.08)",borderRadius:10,padding:"10px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,.10)"}}><p style={{fontSize:9,color:"rgba(255,255,255,.45)",fontWeight:600,textTransform:"uppercase",marginBottom:4}}>{s.l}</p><p style={{fontSize:14,fontWeight:700,color:s.c,fontFamily:"'IBM Plex Mono',monospace"}}>{s.v}</p></div>))}</div>
        </div>
      </div>
      <div style={{padding:"4px 18px 0"}}>
        <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 10px"}}>Tenant</p>
        {vacant?(<div style={{background:C.bg,borderRadius:14,padding:"16px",textAlign:"center",border:`1.5px dashed ${C.bdr}`,marginBottom:14}}><i className="fa-solid fa-user-slash" style={{fontSize:24,color:C.t3,marginBottom:8,display:"block"}}/><p style={{fontWeight:700,color:C.t2,marginBottom:10}}>Room Vacant है</p><button onClick={()=>{onClose();onAssign(room);}} style={{padding:"9px 20px",borderRadius:12,border:"none",cursor:"pointer",background:G.primary,color:"white",fontWeight:700,fontSize:13}}>+ Assign Tenant</button></div>):
        (<div onClick={()=>setShowTenant(true)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.bg,borderRadius:14,border:`1.5px solid ${C.bdr}`,cursor:"pointer",marginBottom:4,transition:"all .15s"}} onPointerDown={e=>e.currentTarget.style.background=C.primaryLight} onPointerUp={e=>e.currentTarget.style.background=C.bg}>
          <Avatar src={room.tenantPhoto} name={room.tenantName} size={48} grad={G.secondary}/>
          <div style={{flex:1,minWidth:0}}><p style={{fontWeight:700,fontSize:15,color:C.t1}}>{room.tenantName}</p><p style={{fontSize:12,color:C.t3}}>{room.tenantOccupation||""}{room.tenantPhone?` · +91 ${room.tenantPhone}`:""}</p></div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}><span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,background:cfg.bdg[0],color:cfg.bdg[1]}}>{cfg.lbl}</span><span style={{fontSize:11,color:C.primary,fontWeight:600}}>View Profile →</span></div>
        </div>)}
        <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 4px"}}>Room Details</p>
        <Row icon="fa-solid fa-key" label="Connection Code" value={room.connectionCode} mono/>
        <Row icon="fa-solid fa-calendar" label="Move-in Date" value={room.assignedAt?new Date(room.assignedAt).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}):room.createdAt?.toDate?room.createdAt.toDate().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"}):null}/>
        <Row icon="fa-solid fa-shield" label="Security Deposit" value={room.securityDeposit>0?inr(room.securityDeposit):null} color={C.secondary}/>
        <Row icon="fa-solid fa-bolt" label="Last Bill Month" value={room.lastBillMonth}/>
        <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",margin:"16px 0 10px"}}>Actions</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          {!vacant&&<><button onClick={()=>{onClose();onToggle(room.id,room.status);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:cfg.btn,color:"white",fontWeight:700,fontSize:13}}>₹ {cfg.btnL}</button><button onClick={()=>{onClose();onAddBill(room);}} style={{padding:"11px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:13,background:C.warnLight,color:C.warning,border:"1px solid #FEF08A"}}>⚡ Add Bill</button><button onClick={()=>{onClose();onEdit(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:C.bg,color:C.primary,fontWeight:700,fontSize:13}}>✏️ Edit Room</button><button onClick={()=>{onClose();onInvite(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:G.primary,color:"white",fontWeight:700,fontSize:13}}>🔗 Invite</button></>}
          {vacant&&<><button onClick={()=>{onClose();onAssign(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:G.primary,color:"white",fontWeight:700,fontSize:13}}>+ Assign</button><button onClick={()=>{onClose();onInvite(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:G.secondary,color:"white",fontWeight:700,fontSize:13}}>🔗 Invite</button></>}
        </div>
        <button onClick={()=>{onClose();onDelete("room",room.id,`Room ${room.roomNo}`);}} style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #FECACA",cursor:"pointer",background:C.dangerLight,color:C.danger,fontWeight:700,fontSize:13}}>🗑️ Delete Room</button>
        <div style={{height:16}}/>
      </div>
    </Sheet>
    <AnimatePresence>{showTenant&&<TenantDetailSheet key="td" room={room} onClose={()=>setShowTenant(false)} toast={toast}/>}</AnimatePresence>
    </>
  );
}

function DeleteConfirmSheet({ target, onClose, onConfirm }) {
  const [busy,setBusy]=useState(false); const isBuilding=target?.type==="building";
  return (
    <Sheet onClose={onClose} title="">
      <div style={{padding:"8px 18px 0",textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:12}}>{isBuilding?"🏚️":"🚪"}</div>
        <p style={{fontWeight:700,fontSize:20,color:C.t1,marginBottom:8}}>{isBuilding?"Building Delete करें?":"Room Delete करें?"}</p>
        <p style={{fontSize:14,color:C.t2,marginBottom:8,lineHeight:1.6}}><strong style={{color:C.danger}}>{target?.name}</strong> को permanently delete करना चाहते हैं?</p>
        {isBuilding&&<div style={{background:C.warnLight,border:"1.5px solid #FDE68A",borderRadius:12,padding:"10px 14px",marginBottom:16,textAlign:"left"}}><p style={{fontSize:12,color:"#92400E",fontWeight:600}}>⚠️ Building delete करने से उसके <strong>सभी rooms भी delete</strong> हो जाएंगे।</p></div>}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={onClose} style={{flex:1,padding:"13px",borderRadius:12,border:`1.5px solid ${C.bdr}`,cursor:"pointer",background:C.bg,color:C.t2,fontWeight:700,fontSize:15}}>Cancel</button>
          <button disabled={busy} onClick={async()=>{setBusy(true);onClose();await onConfirm();}} style={{flex:1,padding:"13px",borderRadius:12,border:"none",cursor:"pointer",background:G.danger,color:"white",fontWeight:700,fontSize:15,opacity:busy?.6:1}}>{busy?"Deleting…":"हाँ, Delete करो"}</button>
        </div>
        <div style={{height:8}}/>
      </div>
    </Sheet>
  );
}

function Header({ ownerName, rooms, loading, scrollY }) {
  const rev=useMemo(()=>rooms.reduce((s,r)=>s+(r.amountPaid||0),0),[rooms]);
  const pend=useMemo(()=>rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).reduce((s,r)=>s+(r.balanceDue||r.rent||0),0),[rooms]);
  const total=rooms.length,occupied=rooms.filter(r=>r.tenantName?.trim()).length;
  const [g]=greet();
  const CS=10,CE=90;
  const exOp=useTransform(scrollY,[CS,CE],[1,0]),exY=useTransform(scrollY,[CS,CE],[0,-8]),miOp=useTransform(scrollY,[CS+15,CE],[0,1]);
  const greetMax=useTransform(scrollY,[CS,CE],["130px","0px"]),kpiMax=useTransform(scrollY,[CS,CE],["240px","0px"]),kpiPadT=useTransform(scrollY,[CS,CE],["14px","0px"]),kpiPadB=useTransform(scrollY,[CS,CE],["18px","0px"]);
  return (
    <header style={{background:`linear-gradient(160deg,${C.dark} 0%,#0D4A50 100%)`,flexShrink:0,position:"relative",overflow:"hidden",paddingTop:"max(44px,env(safe-area-inset-top))",transform:"translateZ(0)",willChange:"transform"}}>
      <div style={{position:"absolute",width:200,height:200,borderRadius:"50%",background:"rgba(13,115,119,.22)",top:-70,right:-60,pointerEvents:"none"}}/>
      <div style={{position:"absolute",width:110,height:110,borderRadius:"50%",background:"rgba(20,145,155,.12)",bottom:-35,left:-25,pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:1,padding:"12px 16px 0"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <div style={{flex:1,minWidth:0,marginRight:12,position:"relative",height:38}}>
            <motion.div style={{opacity:exOp,y:exY,position:"absolute",top:0,left:0,willChange:"opacity,transform"}}><p style={{fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:500,marginBottom:2}}>Your property</p><div style={{display:"flex",alignItems:"center",gap:4}}><i className="fa-solid fa-map-pin" style={{fontSize:12,color:C.primary2}}/><p style={{fontSize:14,fontWeight:700,color:"white"}}>{ownerName?`${ownerName.split(" ")[0]}'s Properties`:"Properties"}</p></div></motion.div>
            <motion.div style={{opacity:miOp,position:"absolute",top:0,left:0,willChange:"opacity,transform"}}><p style={{fontWeight:700,fontSize:16,color:"white",lineHeight:1.1}}>{ownerName?.split(" ")[0]||"Dashboard"}</p><p style={{fontSize:11,color:"rgba(255,255,255,.5)",fontWeight:600,marginTop:2}}>{inr(rev)} · {occupied}/{total} occupied</p></motion.div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <Bell rooms={rooms}/>
            <div style={{width:38,height:38,borderRadius:12,background:G.primary,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"white",position:"relative"}}>
              {ownerName?ownerName.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase():"RK"}
              <div style={{position:"absolute",inset:-2,borderRadius:14,border:`1.5px solid ${C.primary2}`,opacity:.45,pointerEvents:"none"}}/>
            </div>
          </div>
        </div>
        <motion.div style={{opacity:exOp,y:exY,maxHeight:greetMax,overflow:"hidden",willChange:"opacity,transform,max-height"}}>
          <p style={{fontSize:13,color:"rgba(255,255,255,.55)",fontWeight:500,marginBottom:2}}>Good {g},</p>
          <p style={{fontSize:22,fontWeight:700,color:"white",lineHeight:1.1,marginBottom:12}}>{ownerName?.split(" ")[0]||"Owner"} <span style={{color:C.primary2}}>👋</span></p>
          <div style={{background:"rgba(255,255,255,.1)",border:"1px solid rgba(255,255,255,.15)",borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:9,marginBottom:12}}><i className="fa-solid fa-magnifying-glass" style={{fontSize:15,color:"rgba(255,255,255,.35)"}}/><span style={{fontSize:13,color:"rgba(255,255,255,.4)",fontWeight:500}}>Search rooms, tenants…</span></div>
        </motion.div>
      </div>
      <motion.div style={{opacity:exOp,maxHeight:kpiMax,paddingTop:kpiPadT,paddingBottom:kpiPadB,paddingLeft:"14px",paddingRight:"14px",overflow:"hidden",display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,willChange:"opacity,max-height"}}>
        {[
          {label:"Total Rooms",val:total,   sub:`${total-occupied} vacant`,                                                                   bg:C.primary, icon:"fa-solid fa-building"},
          {label:"Tenants",    val:occupied,sub:`${rooms.filter(r=>r.status==="paid").length} paid`,                                          bg:C.success, icon:"fa-solid fa-users"},
          {label:"Collected",  val:inr(rev),sub:"This month",                                                                                 bg:C.warning, icon:"fa-solid fa-indian-rupee-sign",mono:true},
          {label:"Dues Left",  val:inr(pend),sub:`${rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).length} tenants`,bg:C.danger,icon:"fa-solid fa-clock",mono:true},
        ].map(k=>(<div key={k.label} style={{borderRadius:16,padding:"14px",position:"relative",overflow:"hidden",background:k.bg,minHeight:90}}><div style={{position:"absolute",right:10,top:10,width:34,height:34,borderRadius:10,background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center"}}><i className={k.icon} style={{fontSize:15,color:"rgba(255,255,255,.9)"}}/></div><div style={{position:"absolute",width:65,height:65,borderRadius:"50%",background:"rgba(255,255,255,.07)",bottom:-18,left:-10}}/><p style={{fontSize:10,fontWeight:600,color:"rgba(255,255,255,.7)",textTransform:"uppercase",letterSpacing:".3px",marginBottom:6}}>{k.label}</p><p style={{fontSize:22,fontWeight:700,color:"white",lineHeight:1,fontFamily:k.mono?"'IBM Plex Mono',monospace":"inherit"}}>{loading?"—":k.val}</p><p style={{fontSize:10,color:"rgba(255,255,255,.6)",marginTop:4}}>{k.sub}</p></div>))}
      </motion.div>
    </header>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT — OwnerDashboardView
═══════════════════════════════════════════════════════════ */
export default function OwnerDashboardView() {
  const { authUser, setUserRole }=useApp(); const navigate=useNavigate();
  const [rooms,setRooms]=useState([]); const [buildings,setBuildings]=useState({}); const [ownerName,setOwnerName]=useState(""); const [loading,setLoading]=useState(true); const [filter,setFilter]=useState("all"); const [search,setSearch]=useState(""); const [tab,setTab]=useState("home"); const [toasts,setToasts]=useState([]);
  const [addBldg,setAddBldg]=useState(false); const [addRoomBid,setAddRoomBid]=useState(null); const [editRoom,setEditRoom]=useState(null); const [youOpen,setYouOpen]=useState(false); const [inviteRoom,setInviteRoom]=useState(null); const [addBillRoom,setAddBillRoom]=useState(null); const [assignRoom,setAssignRoom]=useState(null); const [viewRoom,setViewRoom]=useState(null); const [showAnalytics,setShowAnalytics]=useState(false); const [showExpenses,setShowExpenses]=useState(false); const [showRemind,setShowRemind]=useState(false); const [showTenants,setShowTenants]=useState(false); const [showPayments,setShowPayments]=useState(false); const [showComplaints,setShowComplaints]=useState(false); const [deleteTarget,setDeleteTarget]=useState(null);
  const unsubR=useRef(null); const unsubB=useRef(null); const scrollRef=useRef(null); const scrollY=useMotionValue(0);

  const toast=useCallback((msg,type="success")=>{const id=Date.now();setToasts(p=>[...p,{id,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);},[]);
  const handleDelete=useCallback((type,id,name)=>{setDeleteTarget({type,id,name});},[]);
  const confirmDelete=useCallback(async()=>{if(!deleteTarget)return;const{type,id}=deleteTarget;try{if(type==="room"){await deleteDoc(doc(db,"rooms",id));toast("🗑️ Room deleted");}else if(type==="building"){const roomSnap=await getDocs(query(collection(db,"rooms"),where("buildingId","==",id)));await Promise.all(roomSnap.docs.map(d=>deleteDoc(doc(db,"rooms",d.id))));await deleteDoc(doc(db,"buildings",id));toast("🗑️ Building and all rooms deleted");}}catch(e){toast(e.message,"error");}},[deleteTarget,toast]);

  useEffect(()=>{if(!authUser)return;getDocs(query(collection(db,"ownerProfiles"),where("uid","==",authUser.uid))).then(s=>{if(!s.empty)setOwnerName(s.docs[0].data().name||"");}).catch(()=>{});},[authUser]);
  useEffect(()=>{if(!authUser)return;setLoading(true);unsubR.current=onSnapshot(query(collection(db,"rooms"),where("ownerId","==",authUser.uid)),s=>{setRooms(s.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},()=>setLoading(false));return()=>unsubR.current?.();},[authUser]);
  useEffect(()=>{if(!authUser)return;unsubB.current=onSnapshot(query(collection(db,"buildings"),where("ownerId","==",authUser.uid)),s=>{const m={};s.docs.forEach(d=>{m[d.id]={id:d.id,...d.data()};});setBuildings(m);},()=>{});return()=>unsubB.current?.();},[authUser]);

  const handleToggle=useCallback(async(roomId,status)=>{const r=rooms.find(x=>x.id===roomId);if(!r)return;try{if(status==="paid"){await updateDoc(doc(db,"rooms",roomId),{status:"pending",amountPaid:0,balanceDue:r.rent||0,paidDate:null});toast("⏳ Marked as pending");}else{const tot=(r.rent||0)+(r.electricityBill||0);await updateDoc(doc(db,"rooms",roomId),{status:"paid",amountPaid:tot,balanceDue:0,paidDate:new Date().toISOString()});toast("✓ Payment received!");}}catch(e){toast(e.message,"error");}},[rooms,toast]);
  const handleYou=useCallback(async action=>{if(action==="logout"){const uid=authUser?.uid;await signOut(auth);if(uid)localStorage.removeItem(`rkp_role_${uid}`);setUserRole(null);navigate("/login",{replace:true});}else if(action==="profile"){navigate("/settings");}else if(action==="backup"){const b=new Blob([JSON.stringify({rooms,backup_date:new Date().toISOString()},null,2)],{type:"application/json"});const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(b),download:"khata-backup.json"});document.body.appendChild(a);a.click();document.body.removeChild(a);toast("☁️ Backup downloaded!");}else if(action==="analytics"){setShowAnalytics(true);}},[rooms,navigate,setUserRole,toast]);
  const handleTab=useCallback(k=>{setTab(k);if(k==="you")setYouOpen(true);if(k==="tenants")setShowTenants(true);if(k==="payments")setShowPayments(true);if(k==="complaints")setShowComplaints(true);},[]);

  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return rooms.filter(r=>{const mf=filter==="all"?true:filter==="paid"?r.status==="paid":["pending","partial"].includes(r.status);const ms=!q||r.roomNo?.toString().toLowerCase().includes(q)||r.tenantName?.toLowerCase().includes(q);return mf&&ms;});},[rooms,filter,search]);
  const grouped=useMemo(()=>{const g={};filtered.forEach(r=>{const bid=r.buildingId||"no-building";(g[bid]=g[bid]||[]).push(r);});return Object.entries(g);},[filtered]);
  const hasFilter=filter!=="all"||search.trim()!=="";

  return (
    <>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box} body{margin:0}
        .sk{background:linear-gradient(90deg,${C.bdr} 25%,${C.bdr2} 50%,${C.bdr} 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:8px}
        @keyframes shimmer{to{background-position:-200% 0}}
        div::-webkit-scrollbar{width:6px} div::-webkit-scrollbar-track{background:transparent} div::-webkit-scrollbar-thumb{background:${C.primary}30;border-radius:4px} div::-webkit-scrollbar-thumb:hover{background:${C.primary}50}
      `}</style>

      <div style={{display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden",background:C.bg,fontFamily:"'Inter',-apple-system,sans-serif"}}>
        <Header ownerName={ownerName} rooms={rooms} loading={loading} scrollY={scrollY}/>

        <div ref={scrollRef} onScroll={e=>scrollY.set(e.currentTarget.scrollTop)}
          style={{flex:1,overflowY:"auto",overflowX:"hidden",background:C.bg,WebkitOverflowScrolling:"touch",scrollBehavior:"smooth",minHeight:0,scrollbarWidth:"thin",scrollbarColor:`${C.primary}30 transparent`}}>
          <div style={{padding:"16px 14px 28px"}}>
            <QuickTiles onAnalytics={()=>setShowAnalytics(true)} onExpenses={()=>setShowExpenses(true)} onRemind={()=>setShowRemind(true)}/>

            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <p style={{fontWeight:700,fontSize:17,color:C.t1}}>Buildings</p>
              <button onClick={()=>setAddBldg(true)} style={{height:34,padding:"0 14px",borderRadius:10,border:"none",cursor:"pointer",background:C.primary,color:"white",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}><i className="fa-solid fa-plus" style={{fontSize:10}}/> Add Building</button>
            </div>

            <div style={{position:"relative",marginBottom:12}}>
              <i className="fa-solid fa-magnifying-glass" style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.t3,pointerEvents:"none"}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search room or tenant…"
                style={{width:"100%",padding:"11px 40px",borderRadius:12,border:`1.5px solid ${C.bdr}`,background:C.card,fontSize:14,fontWeight:500,color:C.t1,outline:"none",fontFamily:"'Inter',sans-serif",boxSizing:"border-box"}}
                onFocus={e=>{e.target.style.borderColor=C.primary;e.target.style.boxShadow=`0 0 0 3px ${C.primaryLight}`;}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.boxShadow="none";}}/>
              {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:C.t3,fontSize:16}}><i className="fa-solid fa-xmark"/></button>}
            </div>

            <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
              {[{k:"all",l:"All"},{k:"pending",l:"⏳ Pending"},{k:"paid",l:"✓ Paid"}].map(c=>{const on=filter===c.k;return(<button key={c.k} onClick={()=>setFilter(c.k)} style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",whiteSpace:"nowrap",fontWeight:600,fontSize:12,flexShrink:0,transition:"all .2s",background:on?C.primary:C.card,color:on?"white":C.t2,boxShadow:on?`0 2px 8px ${C.primary}33`:"0 1px 3px rgba(0,0,0,.06)"}}>{c.l}</button>);})}
            </div>

            {loading&&<div style={{display:"flex",gap:10,overflowX:"auto"}}>{[...Array(3)].map((_,i)=>(<div key={i} style={{minWidth:140,background:C.card,borderRadius:16,padding:10,border:`1.5px solid ${C.bdr}`,flexShrink:0}}><div className="sk" style={{width:"100%",height:76,marginBottom:8}}/><div className="sk" style={{height:14,width:"60%",marginBottom:6}}/><div className="sk" style={{height:11,width:"80%",marginBottom:8}}/><div className="sk" style={{height:30,width:"100%"}}/></div>))}</div>}

            {!loading&&grouped.length===0&&(<div style={{textAlign:"center",padding:"52px 0"}}>
              <div style={{width:72,height:72,borderRadius:20,background:C.primaryLight,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}><i className={hasFilter?"fa-solid fa-filter":"fa-regular fa-building"} style={{fontSize:28,color:C.primary}}/></div>
              <p style={{fontWeight:700,fontSize:18,color:C.t1,marginBottom:6}}>{hasFilter?"No matching rooms":"No buildings yet"}</p>
              <p style={{fontSize:13,color:C.t2,marginBottom:20}}>{hasFilter?"Try a different filter or search":"Add your first building to get started"}</p>
              {!hasFilter&&<button onClick={()=>setAddBldg(true)} style={{padding:"12px 28px",borderRadius:12,border:"none",cursor:"pointer",background:C.primary,color:"white",fontWeight:700,fontSize:14}}><i className="fa-solid fa-plus" style={{marginRight:8}}/>Add Building</button>}
            </div>)}

            {!loading&&grouped.map(([bid,bRooms])=>(<BuildingGroup key={bid} bid={bid} name={bid==="no-building"?"Uncategorized":buildings[bid]?.name||"Building"} rooms={bRooms} onToggle={handleToggle} onEdit={r=>setEditRoom(r)} onAddRoom={id=>setAddRoomBid(id)} onInvite={r=>setInviteRoom(r)} onDelete={handleDelete} onAddBill={r=>setAddBillRoom(r)} onAssign={r=>setAssignRoom(r)} onViewDetail={r=>setViewRoom(r)}/>))}
          </div>
        </div>

        <BottomNav active={tab} onTab={handleTab}/>
      </div>

      <Toasts list={toasts} dismiss={useCallback(id=>setToasts(p=>p.filter(t=>t.id!==id)),[])}/>

      <AnimatePresence>
        {viewRoom&&<RoomDetailSheet key="rd" room={viewRoom} buildings={buildings} onClose={()=>setViewRoom(null)} onEdit={r=>{setViewRoom(null);setEditRoom(r);}} onToggle={(id,s)=>{setViewRoom(null);handleToggle(id,s);}} onAddBill={r=>{setViewRoom(null);setAddBillRoom(r);}} onAssign={r=>{setViewRoom(null);setAssignRoom(r);}} onInvite={r=>{setViewRoom(null);setInviteRoom(r);}} onDelete={(t,id,n)=>{setViewRoom(null);handleDelete(t,id,n);}} toast={toast}/>}
        {addBillRoom&&<AddBillSheet key="bill" room={addBillRoom} onClose={()=>setAddBillRoom(null)} toast={toast}/>}
        {assignRoom&&<AssignTenantSheet key="assign" room={assignRoom} onClose={()=>setAssignRoom(null)} toast={toast}/>}
        {deleteTarget&&<DeleteConfirmSheet key="del" target={deleteTarget} onClose={()=>setDeleteTarget(null)} onConfirm={confirmDelete}/>}
        {addBldg&&<AddBuildingSheet key="ab" ownerId={authUser?.uid} onClose={()=>setAddBldg(false)} toast={toast}/>}
        {addRoomBid&&<AddRoomSheet key="ar" buildingId={addRoomBid} ownerId={authUser?.uid} onClose={()=>setAddRoomBid(null)} toast={toast}/>}
        {editRoom&&<EditRoomSheet key="er" room={editRoom} onClose={()=>setEditRoom(null)} toast={toast}/>}
        {inviteRoom&&<InviteSheet key="iv" room={inviteRoom} onClose={()=>setInviteRoom(null)}/>}
        {showAnalytics&&<AnalyticsSheet key="an" rooms={rooms} onClose={()=>setShowAnalytics(false)}/>}
        {showExpenses&&<ExpensesSheet key="ex" ownerId={authUser?.uid} onClose={()=>setShowExpenses(false)} toast={toast}/>}
        {showRemind&&<RemindSheet key="rm" rooms={rooms} onClose={()=>setShowRemind(false)}/>}
        {showComplaints&&<ComplaintsSheet key="comp" ownerId={authUser?.uid} rooms={rooms} onClose={()=>{setShowComplaints(false);setTab("home");}}/>}
        {showTenants&&<TenantsSheet key="tn" rooms={rooms} onClose={()=>{setShowTenants(false);setTab("home");}} onEditRoom={r=>setEditRoom(r)}/>}
        {showPayments&&<PaymentsSheet key="py" rooms={rooms} onClose={()=>{setShowPayments(false);setTab("home");}}/>}
        {youOpen&&<YouSheet key="you" ownerName={ownerName} authUser={authUser} onClose={()=>{setYouOpen(false);setTab("home");}} onAction={handleYou}/>}
      </AnimatePresence>
    </>
  );
}
