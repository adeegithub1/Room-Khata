// src/views/OwnerDashboardView.jsx
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  collection, query, where, onSnapshot,
  getDocs, addDoc, updateDoc, doc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { auth, db } from "../firebase/config";
import { useApp } from "../context/AppContext";

/* ─── Brand tokens ───────────────────────────────────────── */
const C = {
  brand:  "#FF6B35", brand2: "#F5A623",
  vi:     "#4158D0", vi2:    "#C850C0",
  em:     "#00C9A7", rose:   "#FB7185",
  indigo: "#1E1B4B",
  bg:     "#F5F3FF", card:   "#FFFFFF",
  bdr:    "#EDE9FE",
  t1:     "#1A1D2E", t2:     "#6B7280", t3:     "#A0AEC0",
};
const G = {
  brand:   `linear-gradient(135deg,${C.brand},${C.brand2})`,
  violet:  `linear-gradient(135deg,${C.vi},${C.vi2})`,
  emerald: `linear-gradient(135deg,${C.em},#00B4D8)`,
  danger:  `linear-gradient(135deg,#E11D48,#9F1239)`,
  hdr:     `linear-gradient(160deg,#07050F 0%,#130D2E 40%,#2A1860 75%,#130D2E 100%)`,
};

/* ─── Helpers ────────────────────────────────────────────── */
const inr  = n => "₹" + Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const init = s => s?.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?";
const greet = () => {
  const h = new Date().getHours();
  return h<5?["Night","🌙"]:h<12?["Morning","🌅"]:h<17?["Afternoon","☀️"]:h<21?["Evening","🌆"]:["Night","✨"];
};
const mkCode = () =>
  "RK-" + Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");

/* ─── Motion ─────────────────────────────────────────────── */
const ease   = [0.22,1,0.36,1];
const vUp    = { hidden:{opacity:0,y:20},    visible:{opacity:1,y:0,  transition:{duration:.45,ease}} };
const vScale = { hidden:{opacity:0,scale:.93},visible:{opacity:1,scale:1,transition:{duration:.4, ease}} };
const vSheet = { hidden:{y:"100%"},          visible:{y:0,            transition:{duration:.38,ease}},
                 exit:  {y:"100%",           transition:{duration:.28,ease:[.4,0,1,1]}} };
const vFade  = { hidden:{opacity:0},         visible:{opacity:1,      transition:{duration:.2}},
                 exit:  {opacity:0,          transition:{duration:.15}} };
const stagger = (s=.055) => ({ hidden:{}, visible:{transition:{staggerChildren:s}} });

/* ─── Animated counter ───────────────────────────────────── */
function Counter({ value }) {
  const el = useRef(null);
  const mv = useMotionValue(0);
  useEffect(() => {
    const c = animate(mv, value, {
      duration:1.1, ease:[.16,1,.3,1],
      onUpdate: v => { if(el.current) el.current.textContent = "₹"+Math.round(v).toLocaleString("en-IN"); }
    });
    return c.stop;
  }, [value]);
  return <span ref={el} style={{fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-.03em"}}>₹0</span>;
}

/* ─── Toast stack ────────────────────────────────────────── */
function Toasts({ list, dismiss }) {
  return (
    <div style={{position:"fixed",bottom:72,left:0,right:0,zIndex:300,
      display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"0 16px",pointerEvents:"none"}}>
      <AnimatePresence>
        {list.map(t=>(
          <motion.div key={t.id} layout
            initial={{opacity:0,y:12,scale:.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:.95}}
            onClick={()=>dismiss(t.id)}
            style={{pointerEvents:"auto",maxWidth:320,width:"100%",padding:"12px 16px",borderRadius:16,
              cursor:"pointer",color:"white",fontWeight:700,fontSize:14,
              background:t.type==="error"?G.danger:G.emerald,
              boxShadow:"0 8px 24px rgba(0,0,0,.25)"}}>
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── Bottom sheet wrapper ───────────────────────────────── */
function Sheet({ onClose, title, children }) {
  return (
    <motion.div variants={vFade} initial="hidden" animate="visible" exit="exit"
      style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(7,5,15,.72)"}} onClick={onClose}/>
      <motion.div variants={vSheet} initial="hidden" animate="visible" exit="exit"
        style={{position:"relative",zIndex:1,background:"#fff",borderRadius:"22px 22px 0 0",
          maxHeight:"88dvh",overflowY:"auto",
          paddingBottom:"max(24px,env(safe-area-inset-bottom))"}}>
        <div style={{width:36,height:4,borderRadius:9,background:"#DDD6FE",margin:"12px auto 0"}}/>
        <div style={{padding:"14px 18px 0"}}>
          {title && <p style={{fontWeight:900,fontSize:18,color:C.indigo,marginBottom:16}}>{title}</p>}
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─── Sheet field + button ───────────────────────────────── */
function SInput({ label, value, onChange, placeholder, type="text", min, max, required }) {
  const [f,setF] = useState(false);
  return (
    <div style={{marginBottom:13}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
        textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>
        {label}{required?" *":""}
      </label>
      <input type={type} value={value} placeholder={placeholder}
        required={required} min={min} max={max}
        onChange={e=>onChange(e.target.value)}
        onFocus={()=>setF(true)} onBlur={()=>setF(false)}
        style={{width:"100%",padding:"13px 14px",borderRadius:13,fontSize:15,fontWeight:500,outline:"none",
          fontFamily:"'Poppins',sans-serif",color:C.t1,
          background:f?"#fff":"#F5F3FF",
          border:`1.5px solid ${f?C.brand:C.bdr}`,
          boxShadow:f?`0 0 0 3px rgba(255,107,53,.1)`:"none",
          transition:"all .2s"}}/>
    </div>
  );
}
function SBtn({ loading, label, grad }) {
  return (
    <button type="submit" disabled={loading}
      style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
        background:grad||G.brand,color:"white",fontWeight:900,fontSize:15,
        display:"flex",alignItems:"center",justifyContent:"center",gap:8,
        boxShadow:"0 5px 18px rgba(255,107,53,.28)",opacity:loading?.5:1,
        fontFamily:"'Poppins',sans-serif",marginTop:4,
        transition:"opacity .2s,transform .1s"}}
      onPointerDown={e=>e.currentTarget.style.transform="scale(.96)"}
      onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
      {loading
        ? <svg style={{width:20,height:20,animation:"spin 1s linear infinite"}} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
          </svg>
        : label}
    </button>
  );
}
function ErrBox({ msg }) {
  return msg
    ? <div style={{background:"#FEE2E2",color:"#991B1B",padding:"10px 13px",borderRadius:11,fontSize:13,fontWeight:600,marginBottom:12}}>{msg}</div>
    : null;
}

/* ─── Add Building sheet ─────────────────────────────────── */
function AddBuildingSheet({ ownerId, onClose, toast }) {
  const [name,setName]=useState(""); const [cnt,setCnt]=useState(""); const [start,setStart]=useState("");
  const [busy,setBusy]=useState(false); const [err,setErr]=useState("");
  const go = async e => {
    e.preventDefault(); setErr("");
    const n=parseInt(cnt,10);
    if(!name.trim()||!n||n<1){setErr("Name and room count are required.");return;}
    setBusy(true);
    try {
      const bRef = await addDoc(collection(db,"buildings"),{ownerId,name:name.trim(),createdAt:new Date()});
      const s=parseInt(start,10)||1;
      await Promise.all(Array.from({length:n},(_,i)=>addDoc(collection(db,"rooms"),{
        buildingId:bRef.id,ownerId,roomNo:(s+i).toString(),tenantName:"",rent:0,
        status:"pending",connectionCode:mkCode(),createdAt:new Date(),
      })));
      toast(`✓ "${name.trim()}" with ${n} rooms added!`);
      onClose();
    } catch(e){setErr(e.message);}
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose} title="Add Building 🏠">
      <form onSubmit={go}>
        <SInput label="Building Name" value={name} onChange={setName} placeholder="e.g. Sharma Niwas" required/>
        <SInput label="Number of Rooms" type="number" value={cnt} onChange={setCnt} placeholder="6" min="1" max="99" required/>
        <SInput label="Starting Room No. (optional)" value={start} onChange={setStart} placeholder="101 → 101, 102, 103…"/>
        <ErrBox msg={err}/>
        <SBtn loading={busy} label="🏠 Create Building"/>
        <div style={{height:8}}/>
      </form>
    </Sheet>
  );
}

/* ─── Add Room sheet ─────────────────────────────────────── */
function AddRoomSheet({ buildingId, ownerId, onClose, toast }) {
  const [no,setNo]=useState(""); const [rent,setRent]=useState(""); const [busy,setBusy]=useState(false);
  const go = async e => {
    e.preventDefault(); if(!no.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db,"rooms"),{buildingId,ownerId,roomNo:no.trim(),
        rent:parseInt(rent,10)||0,tenantName:"",status:"pending",connectionCode:mkCode(),createdAt:new Date()});
      toast(`✓ Room ${no.trim()} added!`);
      onClose();
    } catch {}
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose} title="Add Room">
      <form onSubmit={go}>
        <SInput label="Room Number" value={no} onChange={setNo} placeholder="201" required/>
        <SInput label="Monthly Rent (₹)" type="number" value={rent} onChange={setRent} placeholder="8000" min="0"/>
        <SBtn loading={busy} label="Add Room" grad={G.violet}/>
        <div style={{height:8}}/>
      </form>
    </Sheet>
  );
}

/* ─── Edit Room sheet ────────────────────────────────────── */
function EditRoomSheet({ room, onClose, toast }) {
  const [tenant,setTenant]=useState(room.tenantName||"");
  const [rent,setRent]=useState(String(room.rent||""));
  const [elec,setElec]=useState(String(room.electricityBill||""));
  const [dep,setDep]=useState(String(room.securityDeposit||""));
  const [busy,setBusy]=useState(false);
  const go = async e => {
    e.preventDefault(); setBusy(true);
    try {
      await updateDoc(doc(db,"rooms",room.id),{
        tenantName:tenant.trim(),rent:parseInt(rent,10)||0,
        electricityBill:parseInt(elec,10)||0,securityDeposit:parseInt(dep,10)||0,
      });
      toast("✓ Room updated!"); onClose();
    } catch(e){toast(e.message,"error");}
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose} title={`Edit Room ${room.roomNo}`}>
      <form onSubmit={go}>
        <SInput label="Tenant Name" value={tenant} onChange={setTenant} placeholder="Ravi Kumar"/>
        <SInput label="Monthly Rent (₹)" type="number" value={rent} onChange={setRent} placeholder="8000"/>
        <SInput label="Electricity Bill (₹)" type="number" value={elec} onChange={setElec} placeholder="500"/>
        <SInput label="Security Deposit (₹)" type="number" value={dep} onChange={setDep} placeholder="16000"/>
        <SBtn loading={busy} label="Save Changes" grad={G.violet}/>
        <div style={{height:8}}/>
      </form>
    </Sheet>
  );
}

/* ─── Notification Bell ──────────────────────────────────── */
function Bell({ rooms }) {
  const [open,setOpen] = useState(false);
  const ref = useRef(null);
  const notifs = useMemo(()=>{
    const list=[];
    rooms.filter(r=>r.status==="pending_verification"&&r.tenantName?.trim())
      .forEach(r=>list.push({id:`pv-${r.id}`,icon:"fa-solid fa-eye",col:"#C850C0",bg:"rgba(200,80,192,.13)",
        title:"Verify payment",sub:`Room ${r.roomNo} · ${r.tenantName}`}));
    rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim()).slice(0,3)
      .forEach(r=>list.push({id:`pd-${r.id}`,icon:"fa-solid fa-clock",col:"#FB7185",bg:"rgba(251,113,133,.13)",
        title:"Rent due",sub:`Room ${r.roomNo} · ${r.tenantName} · ${inr(r.rent)}`}));
    return list;
  },[rooms]);

  useEffect(()=>{
    if(!open) return;
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("pointerdown",h);
    return()=>document.removeEventListener("pointerdown",h);
  },[open]);

  return (
    <div ref={ref} style={{position:"relative",zIndex:50}}>
      <motion.button whileTap={{scale:.88}} onClick={()=>setOpen(p=>!p)}
        style={{width:40,height:40,borderRadius:"50%",cursor:"pointer",position:"relative",
          display:"flex",alignItems:"center",justifyContent:"center",
          background:open?"rgba(255,255,255,.2)":"rgba(255,255,255,.09)",
          border:"1px solid rgba(255,255,255,.15)"}}>
        <motion.i className="fa-regular fa-bell" style={{fontSize:16,color:"rgba(255,255,255,.88)"}}
          animate={notifs.length&&!open?{rotate:[0,-15,15,-10,10,0]}:{}}
          transition={{duration:.5,repeat:Infinity,repeatDelay:4}}/>
        <AnimatePresence>
          {notifs.length>0&&(
            <motion.span key="dot"
              initial={{scale:0}} animate={{scale:1}} exit={{scale:0}}
              transition={{type:"spring",stiffness:500,damping:25}}
              style={{position:"absolute",top:-3,right:-3,minWidth:16,height:16,
                borderRadius:9,background:"#E11D48",color:"white",fontSize:9,fontWeight:900,
                display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
                boxShadow:"0 0 0 2px rgba(7,5,15,.7)"}}>
              {notifs.length>9?"9+":notifs.length}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open&&(
          <motion.div initial={{opacity:0,y:-8,scale:.96}} animate={{opacity:1,y:0,scale:1}}
            exit={{opacity:0,y:-8,scale:.96}} transition={{duration:.2,ease}}
            style={{position:"absolute",top:48,right:0,width:270,
              background:"rgba(10,7,25,.95)",backdropFilter:"blur(20px)",
              border:"1px solid rgba(255,255,255,.1)",borderRadius:20,
              boxShadow:"0 20px 60px rgba(0,0,0,.5)",overflow:"hidden"}}>
            {/* Header */}
            <div style={{padding:"11px 14px 9px",borderBottom:"1px solid rgba(255,255,255,.07)",
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:7}}>
                <i className="fa-solid fa-bell" style={{fontSize:11,color:C.brand2}}/>
                <span style={{fontWeight:800,fontSize:12,color:"rgba(255,255,255,.85)"}}>Notifications</span>
                {notifs.length>0&&(
                  <span style={{background:"#E11D48",color:"white",fontSize:9,fontWeight:900,
                    padding:"1px 5px",borderRadius:6}}>{notifs.length}</span>
                )}
              </div>
              <button onClick={()=>setOpen(false)}
                style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.4)",fontSize:14}}>
                <i className="fa-solid fa-xmark"/>
              </button>
            </div>
            {/* Rows */}
            <div style={{maxHeight:260,overflowY:"auto"}}>
              {notifs.length===0
                ? <div style={{padding:"28px 16px",textAlign:"center",color:"rgba(255,255,255,.28)",fontSize:13}}>All caught up ✨</div>
                : notifs.map((n,i)=>(
                  <div key={n.id}
                    style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",
                      borderBottom:i<notifs.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                    <div style={{width:30,height:30,borderRadius:10,background:n.bg,flexShrink:0,
                      display:"flex",alignItems:"center",justifyContent:"center",marginTop:2}}>
                      <i className={n.icon} style={{fontSize:11,color:n.col}}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,.88)",marginBottom:2}}>{n.title}</p>
                      <p style={{fontSize:11,color:"rgba(255,255,255,.4)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.sub}</p>
                    </div>
                  </div>
                ))
              }
            </div>
            {notifs.length>0&&(
              <div style={{padding:"8px 14px 12px",borderTop:"1px solid rgba(255,255,255,.07)"}}>
                <button onClick={()=>setOpen(false)}
                  style={{width:"100%",background:"none",border:"none",cursor:"pointer",
                    fontSize:11,fontWeight:700,color:C.brand2}}>
                  Mark all as read
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Status config ──────────────────────────────────────── */
const SC = {
  paid:                 {lbl:"✓ Paid",    bdr:"#86EFAC",bdg:["#DCFCE7","#15803D"],btn:G.emerald,btnL:"Undo",    av:G.violet},
  partial:              {lbl:"◑ Partial", bdr:"#93C5FD",bdg:["#DBEAFE","#1D4ED8"],btn:G.emerald,btnL:"Receive", av:G.violet},
  pending_verification: {lbl:"👀 Verify", bdr:"#C4B5FD",bdg:["#F3E8FF","#7C3AED"],btn:G.violet, btnL:"Verify",  av:G.violet},
  pending:              {lbl:"⏳ Pending", bdr:"#FCA5A5",bdg:["#FEF3C7","#B45309"],btn:G.brand,  btnL:"Receive", av:G.violet},
  vacant:               {lbl:"Vacant",    bdr:C.bdr,    bdg:["#F1F5F9","#64748B"],av:"linear-gradient(135deg,#CBD5E1,#94A3B8)"},
};

/* ─── Room Card ──────────────────────────────────────────── */
function RoomCard({ room, onToggle, onEdit, onInvite, onVerify }) {
  const {roomNo,tenantName,rent=0,electricityBill=0,status="pending",balanceDue=0,securityDeposit=0} = room;
  const vacant = !tenantName?.trim();
  const cfg = SC[vacant?"vacant":(status||"pending")] || SC.pending;
  const total = rent+(electricityBill||0);

  return (
    <motion.div variants={vUp} layout
      style={{background:C.card,border:`1.5px solid ${cfg.bdr}`,borderRadius:18,
        padding:"10px 10px 12px",boxShadow:"0 2px 8px rgba(30,27,75,.07)",
        display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>

      {/* Edit */}
      <button onClick={()=>onEdit(room)}
        style={{position:"absolute",top:8,right:8,width:24,height:24,borderRadius:8,
          background:"#F5F3FF",border:"none",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",zIndex:2}}>
        <i className="fa-solid fa-pen" style={{fontSize:8,color:C.t2}}/>
      </button>

      {/* Avatar square */}
      <div style={{width:"100%",aspectRatio:"1",borderRadius:12,background:cfg.av,
        display:"flex",alignItems:"center",justifyContent:"center",
        color:"white",fontWeight:900,fontSize:vacant?18:15,marginBottom:8}}>
        {vacant
          ? <i className="fa-solid fa-door-open" style={{opacity:.5,fontSize:20}}/>
          : init(tenantName)}
      </div>

      {/* Name */}
      <p style={{textAlign:"center",fontWeight:900,fontSize:13,color:C.t1,lineHeight:1.2}}>Room {roomNo}</p>
      <p style={{textAlign:"center",fontSize:11,color:C.t2,marginBottom:5,
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {vacant?"Vacant":tenantName}
      </p>

      {/* Badges */}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,marginBottom:4}}>
        {(electricityBill||0)>0&&<span style={{fontSize:9,fontWeight:700,background:"#FEFCE8",color:"#CA8A04",padding:"2px 6px",borderRadius:6}}>⚡ +{inr(electricityBill)}</span>}
        {securityDeposit>0&&<span style={{fontSize:9,fontWeight:700,background:"#F3E8FF",color:"#7C3AED",padding:"2px 6px",borderRadius:6}}>🔒 {inr(securityDeposit)}</span>}
      </div>

      {/* Rent row */}
      <div style={{textAlign:"center",padding:"5px 0",margin:"0 0 6px",
        borderTop:`1px solid ${C.bdr}`,borderBottom:`1px solid ${C.bdr}`}}>
        <p style={{fontSize:9,color:C.t3}}>Rent{electricityBill>0?"+Elec":""}</p>
        <p style={{fontWeight:900,fontSize:13,color:C.t1}}>{inr(total)}</p>
      </div>

      {status==="partial"&&balanceDue>0&&(
        <p style={{textAlign:"center",fontSize:9,fontWeight:700,color:"#991B1B",
          background:"#FEE2E2",padding:"2px 6px",borderRadius:6,marginBottom:5}}>Due {inr(balanceDue)}</p>
      )}

      {/* Status badge */}
      <div style={{textAlign:"center",marginBottom:8}}>
        <span style={{fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:8,display:"inline-block",
          background:cfg.bdg[0],color:cfg.bdg[1]}}>{cfg.lbl}</span>
      </div>

      {/* Action buttons */}
      {!vacant ? (
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          {status==="pending_verification" ? (
            <>
              <button onClick={() => onVerify(room.id, true)} style={{width:"100%",padding:"8px",borderRadius:10,border:"none",cursor:"pointer",
                background:G.violet,color:"white",fontWeight:800,fontSize:11}}>✓ Verify</button>
              <button onClick={() => onVerify(room.id, false)} style={{width:"100%",padding:"8px",borderRadius:10,border:"none",cursor:"pointer",
                background:"#F5F3FF",color:C.t2,fontWeight:700,fontSize:11}}>✗ Reject</button>
            </>
          ) : (
            <>
              <button onClick={()=>onToggle(room.id,status)}
                style={{width:"100%",padding:"8px",borderRadius:10,border:"none",cursor:"pointer",
                  background:cfg.btn,color:"white",fontWeight:800,fontSize:11}}
                onPointerDown={e=>e.currentTarget.style.opacity=".75"}
                onPointerUp={e=>e.currentTarget.style.opacity="1"}>
                ₹ {cfg.btnL}
              </button>
              <button style={{width:"100%",padding:"8px",borderRadius:10,cursor:"pointer",
                background:"#FEFCE8",color:"#CA8A04",fontWeight:700,fontSize:11,
                border:"1px solid #FEF08A"}}>
                ⚡ Add Bill
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{display:"flex",gap:5}}>
          <button style={{flex:1,padding:"8px",borderRadius:10,border:"none",cursor:"pointer",
            background:"#F5F3FF",color:C.indigo,fontWeight:700,fontSize:10}}>+ Assign</button>
          <button onClick={()=>onInvite(room)}
            style={{flex:1,padding:"8px",borderRadius:10,border:"none",cursor:"pointer",
              background:G.brand,color:"white",fontWeight:800,fontSize:10}}>🔗 Invite</button>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Building Group ─────────────────────────────────────── */
function BuildingGroup({ bid, name, rooms, onToggle, onEdit, onAddRoom, onInvite, onVerify }) {
  const occ = rooms.filter(r=>r.tenantName?.trim()).length;
  return (
    <div style={{marginBottom:24}}>
      {/* Header card */}
      <div style={{background:C.card,border:`1.5px solid ${C.bdr}`,borderRadius:18,
        padding:14,marginBottom:10,boxShadow:"0 2px 8px rgba(30,27,75,.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <div style={{width:44,height:44,borderRadius:14,background:G.violet,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className="fa-solid fa-building" style={{fontSize:18,color:"white"}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:10,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em"}}>Building</p>
            <p style={{fontSize:17,fontWeight:900,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</p>
          </div>
          {bid!=="no-building"&&(
            <button onClick={()=>onAddRoom(bid)}
              style={{height:34,padding:"0 12px",borderRadius:10,border:"none",cursor:"pointer",
                background:G.brand,color:"white",fontWeight:800,fontSize:11,flexShrink:0,
                display:"flex",alignItems:"center",gap:5,
                boxShadow:"0 3px 10px rgba(255,107,53,.28)"}}>
              <i className="fa-solid fa-plus" style={{fontSize:9}}/> Room
            </button>
          )}
        </div>
        {/* Stats strip */}
        <div style={{display:"flex",paddingTop:10,borderTop:`1px solid ${C.bdr}`}}>
          {[
            {l:"Occupied",v:occ,      c:"#16A34A"},
            {l:"Vacant",  v:rooms.length-occ, c:C.brand},
            {l:"Total",   v:rooms.length,c:C.vi},
          ].map(s=>(
            <div key={s.l} style={{flex:1,textAlign:"center"}}>
              <p style={{fontSize:18,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</p>
              <p style={{fontSize:10,fontWeight:600,color:C.t3,marginTop:2}}>{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Room grid */}
      <motion.div variants={stagger(.04)} initial="hidden" animate="visible"
        style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
        {rooms.map(r=><RoomCard key={r.id} room={r} onToggle={onToggle} onEdit={onEdit} onInvite={onInvite} onVerify={onVerify}/>)}
      </motion.div>
    </div>
  );
}

/* ─── "You" profile sheet ────────────────────────────────── */
function YouSheet({ ownerName, authUser, onClose, onAction }) {
  const { language, setLanguage } = useApp();
  const Row = ({ icon, grad, label, sub, right, onClick, red }) => (
    <button onClick={onClick}
      style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 0",
        background:"none",border:"none",cursor:"pointer",
        borderBottom:`1px solid ${C.bdr}`,textAlign:"left"}}>
      <div style={{width:40,height:40,borderRadius:12,background:grad,flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <i className={icon} style={{fontSize:14,color:"white"}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontWeight:700,fontSize:14,color:red?"#E11D48":C.t1}}>{label}</p>
        {sub&&<p style={{fontSize:11,color:C.t2,marginTop:1}}>{sub}</p>}
      </div>
      {right||<i className="fa-solid fa-chevron-right" style={{fontSize:12,color:C.bdr,flexShrink:0}}/>}
    </button>
  );
  return (
    <Sheet onClose={onClose}>
      {/* Profile card */}
      <div style={{display:"flex",alignItems:"center",gap:14,padding:14,borderRadius:16,
        background:C.bg,marginBottom:4}}>
        <div style={{width:52,height:52,borderRadius:16,background:G.brand,flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center",
          color:"white",fontWeight:900,fontSize:18}}>
          {init(ownerName||authUser?.email||"O")}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontWeight:900,fontSize:16,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {ownerName||"Owner"}
          </p>
          <p style={{fontSize:12,color:C.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {authUser?.email}
          </p>
        </div>
      </div>

      <Row icon="fa-solid fa-chart-line"       grad={G.violet}  label="Analytics"    sub="Revenue & occupancy trends"   onClick={()=>{onClose();onAction("analytics");}}/>
      <Row icon="fa-solid fa-user-pen"         grad={G.brand}   label="Edit Profile" sub="Name, address, UPI ID"        onClick={()=>{onClose();onAction("profile");}}/>
      <Row icon="fa-solid fa-cloud-arrow-down" grad={G.emerald} label="Backup Data"  sub="Download JSON snapshot"       onClick={()=>{onClose();onAction("backup");}}/>
      <Row
        icon="fa-solid fa-language" grad={G.violet}
        label="Language" sub={language==="hi"?"हिंदी चालू":"English on"}
        onClick={()=>setLanguage(language==="hi"?"en":"hi")}
        right={
          <div style={{width:46,height:24,borderRadius:99,flexShrink:0,position:"relative",cursor:"pointer",
            background:language==="hi"?G.brand:"#E2E8F0",transition:"background .25s"}}>
            <div style={{position:"absolute",top:2,width:20,height:20,borderRadius:"50%",background:"white",
              boxShadow:"0 1px 4px rgba(0,0,0,.2)",transition:"left .25s",
              left:language==="hi"?"calc(100% - 22px)":2}}/>
          </div>
        }
      />
      <Row icon="fa-solid fa-right-from-bracket" grad={G.danger} label="Logout" sub="Sign out of your account"
        onClick={()=>onAction("logout")} red/>
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ─── Bottom Nav ─────────────────────────────────────────── */
const TABS = [
  {k:"home",    ic:"fa-solid fa-house",     l:"Home"},
  {k:"tenants", ic:"fa-solid fa-users",     l:"Tenants"},
  {k:"payments",ic:"fa-solid fa-wallet",    l:"Payments"},
  {k:"you",     ic:"fa-solid fa-circle-user",l:"You"},
];
function BottomNav({ active, onTab }) {
  return (
    <nav style={{flexShrink:0,display:"flex",
      background:"rgba(255,255,255,.97)",
      borderTop:`1px solid ${C.bdr}`,
      boxShadow:"0 -2px 16px rgba(30,27,75,.07)",
      paddingBottom:"max(10px,env(safe-area-inset-bottom))",
      paddingTop:8,paddingLeft:4,paddingRight:4,zIndex:10}}>
      {TABS.map(t=>{
        const on=active===t.k;
        return (
          <button key={t.k} onClick={()=>onTab(t.k)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              background:"none",border:"none",cursor:"pointer",padding:"4px 0",
              color:on?C.brand:C.t3,
              transform:on?"scale(1.08) translateY(-1px)":"scale(1)",
              transition:"all .25s cubic-bezier(.34,1.56,.64,1)"}}>
            <i className={t.ic} style={{fontSize:21}}/>
            <span style={{fontSize:10,fontWeight:on?800:600}}>{t.l}</span>
            <div style={{width:4,height:4,borderRadius:"50%",background:C.brand,
              opacity:on?1:0,transition:"opacity .2s"}}/>
          </button>
        );
      })}
    </nav>
  );
}

/* ─── Finance Header ─────────────────────────────────────── */
function Header({ ownerName, rooms, loading, scrollY }) {
  const rev  = useMemo(()=>rooms.reduce((s,r)=>s+(r.amountPaid||0),0),[rooms]);
  const pend = useMemo(()=>rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).reduce((s,r)=>s+(r.balanceDue||r.rent||0),0),[rooms]);
  const exp  = useMemo(()=>rooms.filter(r=>r.tenantName?.trim()).reduce((s,r)=>s+(r.rent||0),0),[rooms]);
  const pct  = exp>0?Math.round(rev/exp*100):0;
  const [g,em] = greet();

  const CS=30, CE=110;
  const exOp  = useTransform(scrollY, [CS, CE],   [1, 0]);
  const exY   = useTransform(scrollY, [CS, CE],   [0, -16]);
  const exSc  = useTransform(scrollY, [CS, CE],   [1, 0.95]);
  // This is the key fix: drive maxHeight so the element collapses in the layout
  const exMax = useTransform(scrollY, [0, CE],    ["320px", "0px"]);
  const miOp  = useTransform(scrollY, [CS+15, CE],[0, 1]);
  const miY   = useTransform(scrollY, [CS+15, CE],[10, 0]);

  return (
    <header style={{background:G.hdr,flexShrink:0,position:"relative",overflow:"hidden",
      paddingTop:"max(44px,env(safe-area-inset-top))"}}>
      {/* Ambient orbs */}
      {[[{t:-60,r:-40,w:200,cl:"rgba(200,80,192,.2)"},{b:-30,l:-20,w:160,cl:"rgba(65,88,208,.18)"}][0],
         [{t:-60,r:-40,w:200,cl:"rgba(200,80,192,.2)"},{b:-30,l:-20,w:160,cl:"rgba(65,88,208,.18)"}][1]].map((o,i)=>(
        <div key={i} style={{position:"absolute",pointerEvents:"none",top:o.t,bottom:o.b,left:o.l,right:o.r,
          width:o.w,height:o.w,borderRadius:"50%",
          background:`radial-gradient(circle,${o.cl} 0%,transparent 70%)`}}/>
      ))}
      {/* Top shimmer line */}
      <motion.div style={{position:"absolute",top:0,left:0,right:0,height:1,pointerEvents:"none",
        background:`linear-gradient(90deg,transparent,${C.brand2},${C.vi2},${C.brand2},transparent)`}}
        animate={{backgroundPosition:["0% 0%","200% 0%"]}} transition={{duration:4,repeat:Infinity,ease:"linear"}}/>

      <div style={{position:"relative",zIndex:1,padding:"14px 16px 16px"}}>

        {/* Top bar: always visible */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          {/* Brand pill (expanded) / name (collapsed) */}
          <div style={{position:"relative",flex:1,height:38,overflow:"hidden",marginRight:8}}>
            <motion.div style={{opacity:exOp,position:"absolute",left:0,top:0,
              display:"flex",alignItems:"center",gap:8,paddingTop:4}}>
              <div style={{width:26,height:26,borderRadius:8,background:G.brand,flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10L12 3l9 7"/><path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                </svg>
              </div>
              <span style={{fontWeight:900,fontSize:12,color:C.brand2,letterSpacing:".04em",whiteSpace:"nowrap"}}>
                RoomKhata <span style={{color:"rgba(255,255,255,.32)",fontWeight:600}}>PRO</span>
              </span>
            </motion.div>
            <motion.div style={{opacity:miOp,y:miY,position:"absolute",left:0,top:0}}>
              <p style={{fontWeight:900,fontSize:16,color:"white",lineHeight:1.1}}>{ownerName?.split(" ")[0]||"Dashboard"}</p>
              <p style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:600}}>{inr(rev)} collected</p>
            </motion.div>
          </div>

          {/* Mini chips (collapsed) + Bell */}
          <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
            <motion.div style={{opacity:miOp,y:miY,display:"flex",gap:5}}>
              <span style={{padding:"3px 7px",borderRadius:8,background:"rgba(245,166,35,.18)",
                border:"1px solid rgba(245,166,35,.22)",fontSize:10,fontWeight:700,
                color:C.brand2,fontFamily:"'JetBrains Mono',monospace"}}>{inr(rev)}</span>
              <span style={{padding:"3px 7px",borderRadius:8,background:"rgba(251,113,133,.18)",
                border:"1px solid rgba(251,113,133,.22)",fontSize:10,fontWeight:700,
                color:"#FB7185",fontFamily:"'JetBrains Mono',monospace"}}>{inr(pend)}</span>
            </motion.div>
            <Bell rooms={rooms}/>
          </div>
        </div>

        {/* Expandable section — maxHeight drives the layout collapse */}
        <motion.div style={{
          opacity:exOp, y:exY, scale:exSc,
          maxHeight:exMax, overflow:"hidden",
        }}>
          {/* Greeting */}
          <div style={{marginBottom:14}}>
            <p style={{fontSize:10,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",
              color:"rgba(255,255,255,.42)",marginBottom:3}}>{g} {em}</p>
            <h2 style={{fontWeight:900,fontSize:26,letterSpacing:"-.03em",color:"white",
              fontFamily:"'Poppins',sans-serif",lineHeight:1.1}}>{ownerName||"Dashboard"}</h2>
          </div>

          {/* Finance widget */}
          <div style={{borderRadius:18,background:"rgba(255,255,255,.055)",
            border:"1px solid rgba(255,255,255,.10)",overflow:"hidden",position:"relative",
            backdropFilter:"blur(18px)",WebkitBackdropFilter:"blur(18px)"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:1,
              background:"linear-gradient(90deg,transparent 5%,rgba(255,255,255,.18) 50%,transparent 95%)"}}/>
            {/* Two stat cols */}
            <div style={{display:"flex"}}>
              {[
                {label:"Revenue",val:rev,col:C.brand2,ibg:"rgba(245,166,35,.2)",ic:"fa-solid fa-arrow-trend-up"},
                {label:"Pending",val:pend,col:"#FB7185",ibg:"rgba(251,113,133,.16)",ic:"fa-solid fa-clock"},
              ].map((s,i)=>(
                <div key={s.label} style={{flex:1,padding:"13px 15px 11px",
                  borderRight:i===0?"1px solid rgba(255,255,255,.07)":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                    <div style={{width:15,height:15,borderRadius:5,background:s.ibg,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <i className={s.ic} style={{fontSize:7,color:s.col}}/>
                    </div>
                    <span style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,.42)",
                      textTransform:"uppercase",letterSpacing:".12em"}}>{s.label}</span>
                  </div>
                  <div style={{fontWeight:700,fontSize:20,color:s.col,lineHeight:1}}>
                    {loading
                      ? <div style={{width:80,height:24,borderRadius:8,background:"rgba(255,255,255,.08)"}}/>
                      : <Counter value={s.val}/>}
                  </div>
                  <p style={{fontSize:9,color:"rgba(255,255,255,.28)",fontWeight:600,marginTop:4}}>This month</p>
                </div>
              ))}
            </div>
            {/* Progress */}
            <div style={{padding:"0 15px 13px"}}>
              <div style={{height:1,background:"rgba(255,255,255,.06)",marginBottom:8}}/>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:9,fontWeight:600,color:"rgba(255,255,255,.35)"}}>Collection progress</span>
                <span style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.6)",fontFamily:"'JetBrains Mono',monospace"}}>{pct}%</span>
              </div>
              <div style={{height:3,borderRadius:99,background:"rgba(255,255,255,.07)",overflow:"hidden"}}>
                <motion.div initial={{width:0}} animate={{width:`${pct}%`}}
                  transition={{duration:1,delay:.5,ease:[.4,0,.2,1]}}
                  style={{height:"100%",borderRadius:99,background:G.brand}}/>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </header>
  );
}

/* ─── Quick action tiles  (no Add Building — it's in section header) ── */
function QuickTiles({ onAnalytics, onExpenses, onRemind }) {
  const tiles = [
    {ic:"fa-solid fa-chart-line", l:"Analytics", grad:G.violet,                                    fn:onAnalytics},
    {ic:"fa-solid fa-receipt",    l:"Expenses",  grad:G.danger,                                    fn:onExpenses},
    {ic:"fa-brands fa-whatsapp",  l:"Remind",    grad:"linear-gradient(135deg,#22C55E,#16A34A)",  fn:onRemind},
    {ic:"fa-solid fa-file-pdf",   l:"Report",    grad:"linear-gradient(135deg,#0EA5E9,#0284C7)",  fn:()=>{}},
  ];
  return (
    <motion.div variants={stagger(.05)} initial="hidden" animate="visible"
      style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
      {tiles.map(t=>(
        <motion.button key={t.l} variants={vScale} whileTap={{scale:.88}} onClick={t.fn}
          style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"12px 4px",
            borderRadius:16,background:C.card,border:`1.5px solid ${C.bdr}`,
            cursor:"pointer",boxShadow:"0 1px 6px rgba(30,27,75,.05)"}}>
          <div style={{width:36,height:36,borderRadius:12,background:t.grad,
            display:"flex",alignItems:"center",justifyContent:"center",marginBottom:6}}>
            <i className={t.ic} style={{fontSize:14,color:"white"}}/>
          </div>
          <span style={{fontSize:10,fontWeight:700,color:C.t2}}>{t.l}</span>
        </motion.button>
      ))}
    </motion.div>
  );
}

/* ─── Analytics Sheet ────────────────────────────────────── */
function AnalyticsSheet({ rooms, onClose }) {
  const total    = rooms.length;
  const occupied = rooms.filter(r=>r.tenantName?.trim()).length;
  const vacant   = total - occupied;
  const paid     = rooms.filter(r=>r.status==="paid").length;
  const pending  = rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim()).length;
  const revenue  = rooms.reduce((s,r)=>s+(r.amountPaid||0),0);
  const dues     = rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim())
                        .reduce((s,r)=>s+(r.balanceDue||r.rent||0),0);
  const totalRent= rooms.filter(r=>r.tenantName?.trim()).reduce((s,r)=>s+(r.rent||0),0);
  const pct      = totalRent>0?Math.round(revenue/totalRent*100):0;

  const StatCard = ({label,value,sub,color,bg})=>(
    <div style={{background:bg||C.bg,borderRadius:16,padding:"14px 16px",border:`1.5px solid ${C.bdr}`}}>
      <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>{label}</p>
      <p style={{fontSize:24,fontWeight:900,color:color||C.t1,lineHeight:1,fontFamily:"'JetBrains Mono',monospace"}}>{value}</p>
      {sub&&<p style={{fontSize:11,color:C.t2,marginTop:4}}>{sub}</p>}
    </div>
  );

  return (
    <Sheet onClose={onClose} title="📊 Analytics">
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <StatCard label="Revenue"  value={inr(revenue)}  sub="This month"         color="#F5A623"/>
        <StatCard label="Dues"     value={inr(dues)}     sub="Pending collection" color="#FB7185"/>
        <StatCard label="Occupied" value={`${occupied}/${total}`} sub="Rooms filled" color={C.vi}/>
        <StatCard label="Paid"     value={`${paid}/${occupied||1}`} sub="Paid this month" color="#00C9A7"/>
      </div>

      {/* Collection bar */}
      <div style={{background:C.bg,borderRadius:16,padding:"14px 16px",border:`1.5px solid ${C.bdr}`,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <p style={{fontSize:12,fontWeight:700,color:C.t1}}>Collection Rate</p>
          <p style={{fontSize:14,fontWeight:900,color:C.brand,fontFamily:"'JetBrains Mono',monospace"}}>{pct}%</p>
        </div>
        <div style={{height:8,borderRadius:99,background:C.bdr,overflow:"hidden"}}>
          <motion.div initial={{width:0}} animate={{width:`${pct}%`}}
            transition={{duration:.8,ease:[.4,0,.2,1]}}
            style={{height:"100%",borderRadius:99,background:G.brand}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
          <p style={{fontSize:11,color:C.t3}}>Collected: {inr(revenue)}</p>
          <p style={{fontSize:11,color:C.t3}}>Expected: {inr(totalRent)}</p>
        </div>
      </div>

      {/* Rooms summary */}
      <div style={{background:C.bg,borderRadius:16,padding:"14px 16px",border:`1.5px solid ${C.bdr}`}}>
        <p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:10}}>Room Status Breakdown</p>
        {[
          {l:"Paid",      v:paid,    c:"#00C9A7",pct:total?Math.round(paid/total*100):0},
          {l:"Pending",   v:pending, c:"#FB7185", pct:total?Math.round(pending/total*100):0},
          {l:"Vacant",    v:vacant,  c:C.t3,      pct:total?Math.round(vacant/total*100):0},
        ].map(row=>(
          <div key={row.l} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:600,color:C.t2}}>{row.l}</span>
              <span style={{fontSize:12,fontWeight:700,color:row.c}}>{row.v} rooms ({row.pct}%)</span>
            </div>
            <div style={{height:5,borderRadius:99,background:C.bdr,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:99,background:row.c,width:`${row.pct}%`,transition:"width .6s"}}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ─── Expenses Sheet ─────────────────────────────────────── */
function ExpensesSheet({ ownerId, onClose, toast }) {
  const [expenses, setExpenses] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [desc,     setDesc]     = useState("");
  const [amount,   setAmount]   = useState("");
  const [category, setCategory] = useState("maintenance");
  const [saving,   setSaving]   = useState(false);

  const CATS = [
    {k:"maintenance",l:"🔧 Maintenance"},{k:"electricity",l:"⚡ Electricity"},
    {k:"water",l:"💧 Water"},{k:"cleaning",l:"🧹 Cleaning"},{k:"other",l:"📦 Other"},
  ];

  useEffect(()=>{
    if(!ownerId) return;
    getDocs(query(collection(db,"expenses"),where("ownerId","==",ownerId)))
      .then(s=>{
        const list=s.docs.map(d=>({id:d.id,...d.data()}));
        list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
        setExpenses(list);
      }).catch(()=>{}).finally(()=>setLoading(false));
  },[ownerId]);

  const handleAdd = async e => {
    e.preventDefault();
    if(!desc.trim()||!amount) return;
    setSaving(true);
    try {
      const newExp = {ownerId,description:desc.trim(),amount:parseInt(amount,10)||0,
        category,createdAt:new Date().toISOString()};
      const ref = await addDoc(collection(db,"expenses"),newExp);
      setExpenses(p=>[{id:ref.id,...newExp},...p]);
      setDesc("");setAmount("");setAdding(false);
      toast("✓ Expense added!");
    }catch(e){toast(e.message,"error");}
    setSaving(false);
  };

  const total = expenses.reduce((s,e)=>s+(e.amount||0),0);

  return (
    <Sheet onClose={onClose} title="🧾 Expenses">
      {/* Total */}
      <div style={{background:`linear-gradient(135deg,#1E1B4B,#4C1D95)`,borderRadius:16,
        padding:"16px",marginBottom:16,textAlign:"center"}}>
        <p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Total Expenses</p>
        <p style={{fontSize:28,fontWeight:900,color:"white",fontFamily:"'JetBrains Mono',monospace"}}>{inr(total)}</p>
      </div>

      {/* Add button */}
      {!adding && (
        <button onClick={()=>setAdding(true)}
          style={{width:"100%",padding:"12px",borderRadius:14,border:`1.5px dashed ${C.bdr}`,
            background:"none",cursor:"pointer",color:C.vi,fontWeight:700,fontSize:14,marginBottom:16}}>
          <i className="fa-solid fa-plus" style={{marginRight:8}}/>Add Expense
        </button>
      )}

      {/* Add form */}
      {adding && (
        <form onSubmit={handleAdd} style={{background:C.bg,borderRadius:16,padding:"14px",marginBottom:16,border:`1.5px solid ${C.bdr}`}}>
          <SInput label="Description" value={desc} onChange={setDesc} placeholder="e.g. Plumber repair" required/>
          <SInput label="Amount (₹)" type="number" value={amount} onChange={setAmount} placeholder="500" required min="1"/>
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11,fontWeight:700,color:C.vi,textTransform:"uppercase",letterSpacing:".07em",display:"block",marginBottom:6}}>Category</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {CATS.map(c=>(
                <button key={c.k} type="button" onClick={()=>setCategory(c.k)}
                  style={{padding:"5px 10px",borderRadius:20,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,
                    background:category===c.k?G.brand:C.card,color:category===c.k?"white":C.t2}}>
                  {c.l}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <SBtn loading={saving} label="Save" grad={G.brand}/>
            <button type="button" onClick={()=>setAdding(false)}
              style={{flex:1,padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:C.bg,color:C.t2,fontWeight:700,fontSize:15}}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      {loading
        ? <p style={{textAlign:"center",color:C.t3,fontSize:13}}>Loading…</p>
        : expenses.length===0
          ? <p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"20px 0"}}>No expenses recorded yet.</p>
          : expenses.map(e=>(
            <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${C.bdr}`}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.bg,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>
                {CATS.find(c=>c.k===e.category)?.l.split(" ")[0]||"📦"}
              </div>
              <div style={{flex:1}}>
                <p style={{fontWeight:700,fontSize:13,color:C.t1}}>{e.description}</p>
                <p style={{fontSize:11,color:C.t3}}>{new Date(e.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p>
              </div>
              <p style={{fontWeight:900,fontSize:14,color:"#E11D48",fontFamily:"'JetBrains Mono',monospace"}}>-{inr(e.amount)}</p>
            </div>
          ))
      }
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ─── WhatsApp Remind Sheet ──────────────────────────────── */
function RemindSheet({ rooms, onClose }) {
  const pendingTenants = rooms.filter(r=>
    r.status!=="paid" && r.tenantPhone?.trim() && r.tenantName?.trim()
  );

  const sendReminder = (room) => {
    const msg = encodeURIComponent(
      `🏠 *RoomKhata Pro — Rent Reminder*\n\nनमस्ते ${room.tenantName}! 🙏\n\nRoom *${room.roomNo}* का किराया अभी तक नहीं आया है。\n\nDue Amount: *₹${(room.rent||0)+(room.electricityBill||0)}*\n\nकृपया जल्दी payment करें। धन्यवाद! 🙏`
    );
    window.open(`https://wa.me/91${room.tenantPhone}?text=${msg}`, "_blank");
  };

  const sendAll = () => pendingTenants.forEach(r => {
    const msg = encodeURIComponent(
      `🏠 *RoomKhata Pro — Rent Reminder*\n\nनमस्ते ${r.tenantName}! 🙏\n\nRoom *${r.roomNo}* का किराया pending है。\n\nDue: *₹${(r.rent||0)+(r.electricityBill||0)}*\n\nPlease pay soon. धन्यवाद! 🙏`
    );
    window.open(`https://wa.me/91${r.tenantPhone}?text=${msg}`, "_blank");
  });

  return (
    <Sheet onClose={onClose} title="📲 WhatsApp Remind">
      <div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:14,
        padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:8}}>
        <i className="fa-solid fa-circle-info" style={{color:"#16A34A",marginTop:2,fontSize:13}}/>
        <p style={{fontSize:12,color:"#14532D",fontWeight:500,lineHeight:1.5}}>
          यह WhatsApp पर rent reminder भेजेगा। केवल उन tenants के लिए जिनका phone number registered है।
        </p>
      </div>

      {pendingTenants.length === 0 ? (
        <div style={{textAlign:"center",padding:"32px 0"}}>
          <p style={{fontSize:40,marginBottom:8}}>🎉</p>
          <p style={{fontWeight:800,fontSize:16,color:C.t1}}>सबने किराया दे दिया!</p>
          <p style={{fontSize:13,color:C.t2,marginTop:4}}>All pending tenants have paid.</p>
        </div>
      ) : (
        <>
          <button onClick={sendAll}
            style={{width:"100%",padding:"13px",borderRadius:14,border:"none",cursor:"pointer",
              background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:900,fontSize:15,
              display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:16,
              boxShadow:"0 4px 14px rgba(34,197,94,.3)"}}>
            <i className="fa-brands fa-whatsapp" style={{fontSize:18}}/>
            Send to All ({pendingTenants.length})
          </button>

          {pendingTenants.map(r=>(
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${C.bdr}`}}>
              <div style={{width:40,height:40,borderRadius:12,background:G.violet,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                color:"white",fontWeight:900,fontSize:14}}>
                {init(r.tenantName)}
              </div>
              <div style={{flex:1}}>
                <p style={{fontWeight:700,fontSize:13,color:C.t1}}>{r.tenantName}</p>
                <p style={{fontSize:11,color:C.t3}}>Room {r.roomNo} · +91 {r.tenantPhone}</p>
              </div>
              <button onClick={()=>sendReminder(r)}
                style={{padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",
                  background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:700,fontSize:11,
                  display:"flex",alignItems:"center",gap:5}}>
                <i className="fa-brands fa-whatsapp"/>Send
              </button>
            </div>
          ))}
        </>
      )}
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ─── Tenants Sheet (footer tab) ─────────────────────────── */
function TenantsSheet({ rooms, onClose, onEditRoom }) {
  const tenants = rooms.filter(r=>r.tenantName?.trim());
  const [search,setSearch] = useState("");
  const filtered = tenants.filter(r=>{
    const q=search.toLowerCase();
    return !q||r.tenantName?.toLowerCase().includes(q)||r.roomNo?.toString().includes(q);
  });

  return (
    <Sheet onClose={onClose} title={`👥 Tenants (${tenants.length})`}>
      {/* Search */}
      <div style={{position:"relative",marginBottom:14}}>
        <i className="fa-solid fa-magnifying-glass"
          style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.t3,pointerEvents:"none"}}/>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search tenant or room…"
          style={{width:"100%",padding:"11px 12px 11px 38px",borderRadius:12,
            border:`1.5px solid ${C.bdr}`,background:C.bg,fontSize:14,
            fontWeight:500,color:C.t1,outline:"none",fontFamily:"'Poppins',sans-serif"}}
          onFocus={e=>{e.target.style.borderColor=C.brand;}}
          onBlur={e=>{e.target.style.borderColor=C.bdr;}}/>
      </div>

      {filtered.length===0
        ? <p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"24px 0"}}>No tenants found.</p>
        : filtered.map(r=>{
          const SC2={paid:"#00C9A7",pending:"#FB7185",partial:"#F5A623",pending_verification:"#C850C0"};
          const statusCol = SC2[r.status]||"#FB7185";
          return (
            <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:`1px solid ${C.bdr}`}}>
              <div style={{width:44,height:44,borderRadius:14,background:G.violet,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
                color:"white",fontWeight:900,fontSize:15}}>
                {init(r.tenantName)}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <p style={{fontWeight:700,fontSize:14,color:C.t1}}>{r.tenantName}</p>
                <p style={{fontSize:11,color:C.t3}}>Room {r.roomNo} · {inr(r.rent)}/mo</p>
                {r.tenantPhone && <p style={{fontSize:11,color:C.t3}}>+91 {r.tenantPhone}</p>}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}>
                <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,
                  background:statusCol+"22",color:statusCol}}>
                  {r.status==="paid"?"✓ Paid":r.status==="pending"?"⏳ Due":r.status==="pending_verification"?"👀 Verify":"◑ Partial"}
                </span>
                <button onClick={()=>{onEditRoom(r);onClose();}}
                  style={{fontSize:11,fontWeight:700,color:C.vi,background:"none",border:"none",cursor:"pointer",padding:0}}>
                  Edit →
                </button>
              </div>
            </div>
          );
        })
      }
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ─── Payments Sheet (footer tab) ────────────────────────── */
function PaymentsSheet({ rooms, onClose }) {
  const paid    = rooms.filter(r=>r.status==="paid"&&r.tenantName?.trim());
  const pending = rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim());
  const partial = rooms.filter(r=>r.status==="partial"&&r.tenantName?.trim());
  const verify  = rooms.filter(r=>r.status==="pending_verification"&&r.tenantName?.trim());
  const totalCollected = paid.reduce((s,r)=>s+(r.amountPaid||r.rent||0),0);
  const totalDue       = pending.reduce((s,r)=>s+(r.rent||0),0);

  const Row = ({r,col,badge})=>(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}>
      <div style={{width:38,height:38,borderRadius:12,background:G.violet,
        display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        color:"white",fontWeight:900,fontSize:13}}>
        {init(r.tenantName)}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontWeight:700,fontSize:13,color:C.t1}}>{r.tenantName}</p>
        <p style={{fontSize:11,color:C.t3}}>Room {r.roomNo}</p>
      </div>
      <div style={{textAlign:"right"}}>
        <p style={{fontWeight:900,fontSize:13,color:col,fontFamily:"'JetBrains Mono',monospace"}}>{inr(r.amountPaid||r.rent||0)}</p>
        <span style={{fontSize:10,fontWeight:700,color:col,background:col+"22",padding:"2px 6px",borderRadius:6}}>{badge}</span>
      </div>
    </div>
  );

  return (
    <Sheet onClose={onClose} title="💰 Payments">
      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:"#F0FDF4",borderRadius:14,padding:"12px",border:"1.5px solid #86EFAC"}}>
          <p style={{fontSize:10,fontWeight:700,color:"#14532D",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Collected</p>
          <p style={{fontSize:20,fontWeight:900,color:"#16A34A",fontFamily:"'JetBrains Mono',monospace"}}>{inr(totalCollected)}</p>
          <p style={{fontSize:11,color:"#16A34A",marginTop:2}}>{paid.length} tenants</p>
        </div>
        <div style={{background:"#FEF2F2",borderRadius:14,padding:"12px",border:"1.5px solid #FECACA"}}>
          <p style={{fontSize:10,fontWeight:700,color:"#7F1D1D",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Pending</p>
          <p style={{fontSize:20,fontWeight:900,color:"#E11D48",fontFamily:"'JetBrains Mono',monospace"}}>{inr(totalDue)}</p>
          <p style={{fontSize:11,color:"#E11D48",marginTop:2}}>{pending.length} tenants</p>
        </div>
      </div>

      {verify.length>0&&<>
        <p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>👀 Awaiting Verification</p>
        {verify.map(r=><Row key={r.id} r={r} col="#C850C0" badge="Verify"/>)}
        <div style={{marginBottom:12}}/>
      </>}
      {paid.length>0&&<>
        <p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>✓ Paid</p>
        {paid.map(r=><Row key={r.id} r={r} col="#16A34A" badge="Paid"/>)}
        <div style={{marginBottom:12}}/>
      </>}
      {partial.length>0&&<>
        <p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>◑ Partial</p>
        {partial.map(r=><Row key={r.id} r={r} col="#F5A623" badge="Partial"/>)}
        <div style={{marginBottom:12}}/>
      </>}
      {pending.length>0&&<>
        <p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>⏳ Pending</p>
        {pending.map(r=><Row key={r.id} r={r} col="#E11D48" badge="Due"/>)}
      </>}
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ─── Invite Code Sheet ──────────────────────────────────── */
function InviteSheet({ room, onClose }) {
  const [copied,setCopied] = useState(false);
  const code = room.connectionCode || "N/A";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(()=>setCopied(false),2000);
    } catch {
      // fallback for older devices
      const el = document.createElement("textarea");
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(()=>setCopied(false),2000);
    }
  };

  const shareWhatsApp = () => {
    const msg = encodeURIComponent(
      `🏠 *RoomKhata Pro — Room Invitation*\n\nHello! आपको Room *${room.roomNo}* में invite किया गया है।\n\n*Connection Code: ${code}*\n\nSteps:\n1️⃣ App open करें\n2️⃣ "किरायेदार" select करें\n3️⃣ अपना WhatsApp number डालें\n4️⃣ यह code: *${code}* डालें\n\n✅ Done! आप room से connect हो जाएंगे।`
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  return (
    <Sheet onClose={onClose} title={`🔗 Invite — Room ${room.roomNo}`}>
      <p style={{fontSize:13,color:C.t2,marginBottom:20,lineHeight:1.6}}>
        Tenant को यह code share करें। Login करते समय यह code डालकर वो इस room से connect हो जाएगा।
      </p>

      {/* Big code display */}
      <div style={{background:`linear-gradient(135deg,#1E1B4B,#4C1D95)`,borderRadius:20,
        padding:"28px 20px",textAlign:"center",marginBottom:16,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",
          background:"rgba(200,80,192,.15)",pointerEvents:"none"}}/>
        <p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.5)",
          textTransform:"uppercase",letterSpacing:".14em",marginBottom:10}}>Connection Code</p>
        <p style={{fontSize:36,fontWeight:900,color:"white",letterSpacing:".2em",
          fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{code}</p>
        <p style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:10}}>
          Room {room.roomNo}{room.tenantName?` · Currently: ${room.tenantName}`:""}
        </p>
      </div>

      {/* Action buttons */}
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        <button onClick={copyCode}
          style={{flex:1,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",
            background:copied?"linear-gradient(135deg,#00C9A7,#00B4D8)":C.bg,
            color:copied?"white":C.vi,fontWeight:800,fontSize:14,
            transition:"all .2s",border:`1.5px solid ${copied?"transparent":C.bdr}`}}>
          {copied ? "✓ Copied!" : "📋 Copy Code"}
        </button>
        <button onClick={shareWhatsApp}
          style={{flex:1,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#22C55E,#16A34A)",
            color:"white",fontWeight:800,fontSize:14,
            display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
          <i className="fa-brands fa-whatsapp" style={{fontSize:16}}/>Share
        </button>
      </div>

      {/* How it works */}
      <div style={{background:C.bg,borderRadius:16,padding:"14px 16px",border:`1.5px solid ${C.bdr}`}}>
        <p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:10}}>Tenant कैसे join करे?</p>
        {[
          "App open करें और \"किरायेदार\" select करें",
          "अपना WhatsApp number डालें",
          `Connection Code डालें: ${code}`,
          "Done! Room automatically connect हो जाएगा",
        ].map((s,i)=>(
          <div key={i} style={{display:"flex",gap:10,marginBottom:8}}>
            <div style={{width:22,height:22,borderRadius:"50%",background:G.brand,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",
              color:"white",fontWeight:900,fontSize:11}}>{i+1}</div>
            <p style={{fontSize:12,color:C.t2,paddingTop:2,lineHeight:1.5}}>{s}</p>
          </div>
        ))}
      </div>
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ═══════════════════════════════════════════════════════════
   ROOT — OwnerDashboardView
═══════════════════════════════════════════════════════════ */
export default function OwnerDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  const [rooms,     setRooms]      = useState([]);
  const [buildings, setBuildings]  = useState({});
  const [ownerName, setOwnerName]  = useState("");
  const [loading,   setLoading]    = useState(true);
  const [filter,    setFilter]     = useState("all");
  const [search,    setSearch]     = useState("");
  const [tab,       setTab]        = useState("home");
  const [toasts,    setToasts]     = useState([]);

  const [addBldg,    setAddBldg]   = useState(false);
  const [addRoomBid, setAddRoomBid] = useState(null);
  const [editRoom,   setEditRoom]  = useState(null);
  const [youOpen,    setYouOpen]   = useState(false);
  const [inviteRoom, setInviteRoom] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showExpenses,  setShowExpenses]  = useState(false);
  const [showRemind,    setShowRemind]    = useState(false);
  const [showTenants,   setShowTenants]   = useState(false);
  const [showPayments,  setShowPayments]  = useState(false);

  const unsubR   = useRef(null);
  const unsubB   = useRef(null);
  const scrollRef= useRef(null);
  const scrollY  = useMotionValue(0);

  const toast = useCallback((msg,type="success")=>{
    const id=Date.now();
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);
  },[]);

  /* Owner profile */
  useEffect(()=>{
    if(!authUser) return;
    getDocs(query(collection(db,"ownerProfiles"),where("uid","==",authUser.uid)))
      .then(s=>{if(!s.empty)setOwnerName(s.docs[0].data().name||"");}).catch(()=>{});
  },[authUser]);

  /* Live rooms */
  useEffect(()=>{
    if(!authUser) return;
    setLoading(true);
    unsubR.current=onSnapshot(
      query(collection(db,"rooms"),where("ownerId","==",authUser.uid)),
      s=>{setRooms(s.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},
      ()=>setLoading(false)
    );
    return()=>unsubR.current?.();
  },[authUser]);

  /* Live buildings */
  useEffect(()=>{
    if(!authUser) return;
    unsubB.current=onSnapshot(
      query(collection(db,"buildings"),where("ownerId","==",authUser.uid)),
      s=>{const m={};s.docs.forEach(d=>{m[d.id]={id:d.id,...d.data()};});setBuildings(m);},
      ()=>{}
    );
    return()=>unsubB.current?.();
  },[authUser]);

  /* Toggle payment */
  const handleToggle = useCallback(async(roomId,status)=>{
    const r=rooms.find(x=>x.id===roomId); if(!r) return;
    try {
      if(status==="paid"){
        await updateDoc(doc(db,"rooms",roomId),{status:"pending",amountPaid:0,balanceDue:r.rent||0,paidDate:null});
        toast("⏳ Marked as pending");
      } else {
        const tot=(r.rent||0)+(r.electricityBill||0);
        await updateDoc(doc(db,"rooms",roomId),{status:"paid",amountPaid:tot,balanceDue:0,paidDate:new Date().toISOString()});
        toast("✓ Payment received!");
      }
    }catch(e){toast(e.message,"error");}
  },[rooms,toast]);

  /* Verify Payment (New fix added here) */
  const handleVerify = useCallback(async (roomId, isApproved) => {
    const r = rooms.find(x => x.id === roomId);
    if (!r) return;
    try {
      if (isApproved) {
        const tot = (r.rent || 0) + (r.electricityBill || 0);
        await updateDoc(doc(db, "rooms", roomId), {
          status: "paid",
          amountPaid: tot,
          balanceDue: 0,
          paidDate: new Date().toISOString()
        });
        toast("✓ Payment verified & accepted!");
      } else {
        await updateDoc(doc(db, "rooms", roomId), {
          status: "pending"
        });
        toast("✗ Payment rejected", "error");
      }
    } catch(e) {
      toast(e.message, "error");
    }
  }, [rooms, toast]);

  /* You-sheet actions */
  const handleYou = useCallback(async action=>{
    if(action==="logout"){
      const uid = authUser?.uid;
      await signOut(auth);
      // Clear any stale cached keys (belt-and-suspenders)
      if (uid) localStorage.removeItem(`rkp_role_${uid}`);
      setUserRole(null);
      navigate("/login",{replace:true});
    } else if(action==="profile"){
      navigate("/settings");
    } else if(action==="backup"){
      const b=new Blob([JSON.stringify({rooms,backup_date:new Date().toISOString()},null,2)],{type:"application/json"});
      const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(b),download:"khata-backup.json"});
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      toast("☁️ Backup downloaded!");
    } else if(action==="analytics"){
      toast("📊 Analytics coming soon!");
    }
  },[rooms,navigate,setUserRole,toast]);

  const handleTab = useCallback(k=>{
    setTab(k);
    if(k==="you")      setYouOpen(true);
    if(k==="tenants")  setShowTenants(true);
    if(k==="payments") setShowPayments(true);
  },[]);

  /* Filtered + grouped */
  const filtered = useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rooms.filter(r=>{
      const mf=filter==="all"?true:filter==="paid"?r.status==="paid":["pending","partial"].includes(r.status);
      const ms=!q||r.roomNo?.toString().toLowerCase().includes(q)||r.tenantName?.toLowerCase().includes(q);
      return mf&&ms;
    });
  },[rooms,filter,search]);

  /* Empty building fix added here */
  const grouped = useMemo(() => {
    const g = {};
    Object.keys(buildings).forEach(bid => { g[bid] = []; });
    filtered.forEach(r => {
      const bid = r.buildingId || "no-building";
      if (!g[bid]) g[bid] = [];
      g[bid].push(r);
    });
    return Object.entries(g);
  }, [filtered, buildings]);

  const hasFilter = filter!=="all"||search.trim()!=="";

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Outer shell: flex-col, fills the app-shell */}
      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:C.bg}}>

        {/* Sticky header */}
        <Header ownerName={ownerName} rooms={rooms} loading={loading} scrollY={scrollY}/>

        {/* Scrollable body */}
        <div ref={scrollRef}
          onScroll={e=>scrollY.set(e.currentTarget.scrollTop)}
          style={{flex:1,overflowY:"auto",overflowX:"hidden",background:C.bg,WebkitOverflowScrolling:"touch"}}>

          <div style={{padding:"16px 14px 28px"}}>

            <QuickTiles
              onAnalytics={()=>setShowAnalytics(true)}
              onExpenses={()=>setShowExpenses(true)}
              onRemind={()=>setShowRemind(true)}
            />

            {/* Section header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <p style={{fontWeight:900,fontSize:16,color:C.t1}}>Your Buildings</p>
              <button onClick={()=>setAddBldg(true)}
                style={{height:34,padding:"0 14px",borderRadius:10,border:"none",cursor:"pointer",
                  background:G.brand,color:"white",fontWeight:800,fontSize:12,
                  display:"flex",alignItems:"center",gap:6,
                  boxShadow:"0 3px 12px rgba(255,107,53,.28)"}}>
                <i className="fa-solid fa-plus" style={{fontSize:10}}/> Add Building
              </button>
            </div>

            {/* Search */}
            <div style={{position:"relative",marginBottom:12}}>
              <i className="fa-solid fa-magnifying-glass"
                style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.t3,pointerEvents:"none"}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search room or tenant…"
                style={{width:"100%",padding:"11px 40px",borderRadius:14,
                  border:`1.5px solid ${C.bdr}`,background:C.card,
                  fontSize:14,fontWeight:500,color:C.t1,outline:"none",
                  fontFamily:"'Poppins',sans-serif"}}
                onFocus={e=>{e.target.style.borderColor=C.brand;e.target.style.boxShadow=`0 0 0 3px rgba(255,107,53,.08)`;}}
                onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.boxShadow="none";}}/>
              {search&&(
                <button onClick={()=>setSearch("")}
                  style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",
                    background:"none",border:"none",cursor:"pointer",color:C.t3,fontSize:16}}>
                  <i className="fa-solid fa-xmark"/>
                </button>
              )}
            </div>

            {/* Filter chips */}
            <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
              {[{k:"all",l:"All"},{k:"pending",l:"⏳ Pending"},{k:"paid",l:"✓ Paid"}].map(c=>{
                const on=filter===c.k;
                return (
                  <button key={c.k} onClick={()=>setFilter(c.k)}
                    style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",
                      whiteSpace:"nowrap",fontWeight:700,fontSize:12,flexShrink:0,
                      background:on?G.brand:C.card,color:on?"white":C.t2,
                      boxShadow:on?"0 3px 10px rgba(255,107,53,.25)":"none",
                      transition:"all .2s"}}>
                    {c.l}
                  </button>
                );
              })}
            </div>

            {/* Skeleton */}
            {loading&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                {[...Array(6)].map((_,i)=>(
                  <div key={i} style={{background:C.card,borderRadius:18,padding:10,border:`1.5px solid ${C.bdr}`}}>
                    <div className="sk" style={{width:"100%",aspectRatio:"1",borderRadius:12,marginBottom:8}}/>
                    <div className="sk" style={{height:12,width:"70%",margin:"0 auto 6px"}}/>
                    <div className="sk" style={{height:10,width:"50%",margin:"0 auto 10px"}}/>
                    <div className="sk" style={{height:32,width:"100%"}}/>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading&&grouped.length===0&&(
              <motion.div variants={vScale} initial="hidden" animate="visible"
                style={{textAlign:"center",padding:"52px 0"}}>
                <div style={{width:72,height:72,borderRadius:24,background:C.bg,
                  display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",
                  border:`1.5px solid ${C.bdr}`}}>
                  <i className={hasFilter?"fa-solid fa-filter":"fa-regular fa-building"}
                    style={{fontSize:28,color:C.t3}}/>
                </div>
                <p style={{fontWeight:900,fontSize:17,color:C.t1,marginBottom:6}}>
                  {hasFilter?"No matching rooms":"No buildings yet"}
                </p>
                <p style={{fontSize:13,color:C.t2,marginBottom:20}}>
                  {hasFilter?"Try a different filter or search":"Add your first building to get started"}
                </p>
                {!hasFilter&&(
                  <button onClick={()=>setAddBldg(true)}
                    style={{padding:"12px 28px",borderRadius:14,border:"none",cursor:"pointer",
                      background:G.brand,color:"white",fontWeight:800,fontSize:14,
                      boxShadow:"0 4px 16px rgba(255,107,53,.3)"}}>
                    <i className="fa-solid fa-plus" style={{marginRight:8}}/>Add Building
                  </button>
                )}
              </motion.div>
            )}

            {/* Building groups */}
            <AnimatePresence>
              {!loading&&grouped.map(([bid,bRooms])=>(
                <BuildingGroup key={bid}
                  bid={bid}
                  name={bid==="no-building"?"Uncategorized":buildings[bid]?.name||"Building"}
                  rooms={bRooms}
                  onToggle={handleToggle}
                  onEdit={r=>setEditRoom(r)}
                  onAddRoom={id=>setAddRoomBid(id)}
                  onInvite={r=>setInviteRoom(r)}
                  onVerify={handleVerify}
                />
              ))}
            </AnimatePresence>

          </div>
        </div>

        {/* Bottom nav — flex sibling, never scrolls */}
        <BottomNav active={tab} onTab={handleTab}/>

      </div>

      {/* Toasts */}
      <Toasts list={toasts} dismiss={useCallback(id=>setToasts(p=>p.filter(t=>t.id!==id)),[])}/>

      {/* Sheets */}
      <AnimatePresence>
        {addBldg&&<AddBuildingSheet key="ab" ownerId={authUser?.uid} onClose={()=>setAddBldg(false)} toast={toast}/>}
        {addRoomBid&&<AddRoomSheet key="ar" buildingId={addRoomBid} ownerId={authUser?.uid} onClose={()=>setAddRoomBid(null)} toast={toast}/>}
        {editRoom&&<EditRoomSheet key="er" room={editRoom} onClose={()=>setEditRoom(null)} toast={toast}/>}
        {inviteRoom&&<InviteSheet key="iv" room={inviteRoom} onClose={()=>setInviteRoom(null)}/>}
        {showAnalytics&&<AnalyticsSheet key="an" rooms={rooms} onClose={()=>setShowAnalytics(false)}/>}
        {showExpenses&&<ExpensesSheet key="ex" ownerId={authUser?.uid} onClose={()=>setShowExpenses(false)} toast={toast}/>}
        {showRemind&&<RemindSheet key="rm" rooms={rooms} onClose={()=>setShowRemind(false)}/>}
        {showTenants&&<TenantsSheet key="tn" rooms={rooms} onClose={()=>{setShowTenants(false);setTab("home");}} onEditRoom={r=>setEditRoom(r)}/>}
        {showPayments&&<PaymentsSheet key="py" rooms={rooms} onClose={()=>{setShowPayments(false);setTab("home");}}/>}
        {youOpen&&(
          <YouSheet key="you" ownerName={ownerName} authUser={authUser}
            onClose={()=>{setYouOpen(false);setTab("home");}} onAction={handleYou}/>
        )}
      </AnimatePresence>
    </>
  );
}
