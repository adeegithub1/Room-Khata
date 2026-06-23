// src/views/OwnerDashboardView.jsx
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

/* ─── Brand tokens — from reference UI ──────────────────── */
const C = {
  // Primary indigo
  ind:    "#6366F1",  ind2:   "#4F46E5",  indLight:"#EEF2FF",  indBorder:"#C7D2FE",
  // Teal secondary
  teal:   "#0F9D8B",  tealLight:"#CCFBF1",
  // Amber
  amb:    "#F59E0B",  ambLight:"#FEF3C7",
  // Danger
  red:    "#EF4444",  redLight:"#FEE2E2",
  // Neutrals
  dark:   "#1A1A2E",  dark2:"#18181B",
  t1:     "#18181B",  t2:"#71717A",    t3:"#A1A1AA",
  bg:     "#F7F7FB",  card:"#FFFFFF",  bdr:"#F1F0F7",  bdr2:"#F4F4F5",
  // Indigo alias for sheets
  vi:     "#6366F1",  vi2: "#818CF8",
  // Keep brand for backwards compat
  brand:  "#6366F1",  brand2:"#818CF8",
  // emerald for success
  em:     "#10B981",
};
const G = {
  brand:   `linear-gradient(135deg,#6366F1,#4F46E5)`,
  violet:  `linear-gradient(135deg,#6366F1,#818CF8)`,
  teal:    `linear-gradient(135deg,#0F9D8B,#0D9488)`,
  emerald: `linear-gradient(135deg,#10B981,#059669)`,
  amber:   `linear-gradient(135deg,#F59E0B,#D97706)`,
  danger:  `linear-gradient(135deg,#EF4444,#DC2626)`,
  hdr:     "#1A1A2E",
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
function RoomCard({ room, onToggle, onEdit, onInvite, onDelete, onAddBill, onAssign, onViewDetail }) {
  const {roomNo,tenantName,rent=0,electricityBill=0,status="pending",balanceDue=0,securityDeposit=0} = room;
  const vacant = !tenantName?.trim();
  const cfg = SC[vacant?"vacant":(status||"pending")] || SC.pending;
  const total = rent+(electricityBill||0);

  // Status badge config matching reference UI
  const badge = vacant
    ? {text:"Vacant",     bg:"#D1FAE5", color:"#065F46"}
    : status==="paid"
    ? {text:"Paid",       bg:"#DCFCE7", color:"#15803D"}
    : status==="pending_verification"
    ? {text:"Verify",     bg:"#EEF2FF", color:"#4338CA"}
    : status==="partial"
    ? {text:"Partial",    bg:"#DBEAFE", color:"#1D4ED8"}
    :  {text:"Pending",   bg:"#FEF3C7", color:"#B45309"};

  // Avatar bg per status (matches reference)
  const avBg = vacant    ? "#F4F4F5"
    : status==="paid"    ? "#EEF2FF"
    : status==="partial" ? "#DBEAFE"
    :                      "#FFF7ED";
  const avColor = vacant    ? "#A1A1AA"
    : status==="paid"    ? "#6366F1"
    : status==="partial" ? "#3B82F6"
    :                      "#F59E0B";

  return (
    <div style={{background:C.card,borderRadius:18,border:`1.5px solid ${C.bdr}`,
      overflow:"hidden",flexShrink:0,cursor:"pointer"}}
      onClick={()=>onViewDetail(room)}>
      {/* Top image area */}
      <div style={{height:76,display:"flex",alignItems:"center",justifyContent:"center",
        background:avBg,position:"relative",fontSize:28}}>
        {room.tenantPhoto
          ? <img src={room.tenantPhoto} alt={tenantName}
              style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          : vacant
          ? <i className="fa-solid fa-door-open" style={{fontSize:26,color:"#A1A1AA"}}/>
          : <span style={{fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:avColor}}>
              {init(tenantName)}
            </span>
        }
        {/* Badge */}
        <span style={{position:"absolute",top:8,left:8,fontSize:10,fontWeight:700,
          padding:"3px 8px",borderRadius:20,background:badge.bg,color:badge.color}}>
          {badge.text}
        </span>
        {/* Edit/delete */}
        <div style={{position:"absolute",top:6,right:6,display:"flex",gap:3}}
          onClick={e=>e.stopPropagation()}>
          <button onClick={()=>onEdit(room)}
            style={{width:22,height:22,borderRadius:7,background:"rgba(255,255,255,.85)",
              border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <i className="fa-solid fa-pen" style={{fontSize:7,color:C.t2}}/>
          </button>
          <button onClick={()=>onDelete("room",room.id,`Room ${roomNo}`)}
            style={{width:22,height:22,borderRadius:7,background:"rgba(254,226,226,.9)",
              border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <i className="fa-solid fa-trash" style={{fontSize:7,color:"#DC2626"}}/>
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{padding:"10px 10px 12px"}} onClick={e=>e.stopPropagation()}>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:18,fontWeight:900,color:C.t1,lineHeight:1}}>
          {roomNo}
        </p>
        <p style={{fontSize:11,color:C.t2,marginTop:2,overflow:"hidden",
          textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {vacant ? "Vacant room" : tenantName}
        </p>
        <p style={{fontSize:12,fontWeight:700,color:C.ind,marginTop:6}}>
          {inr(total)} / mo
        </p>
        {(electricityBill||0)>0&&(
          <p style={{fontSize:10,color:"#B45309",fontWeight:600,marginTop:2}}>⚡ +{inr(electricityBill)}</p>
        )}

        {/* Action buttons */}
        <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:5}}
          onClick={e=>e.stopPropagation()}>
          {!vacant ? (
            status==="pending_verification" ? (
              <button style={{width:"100%",padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",
                background:"#EEF2FF",color:"#4338CA",fontWeight:700,fontSize:11}}>
                ✓ Verify
              </button>
            ) : (
              <>
                <button onClick={()=>onToggle(room.id,status)}
                  style={{width:"100%",padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",
                    background:status==="paid"?"#FEF3C7":C.ind,
                    color:status==="paid"?"#B45309":"white",fontWeight:700,fontSize:11}}>
                  {status==="paid" ? "⏳ Undo" : "₹ Receive"}
                </button>
                <button onClick={()=>onAddBill(room)}
                  style={{width:"100%",padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",
                    background:"#FEF3C7",color:"#B45309",fontWeight:700,fontSize:11}}>
                  ⚡ Add Bill
                </button>
              </>
            )
          ) : (
            <div style={{display:"flex",gap:5}}>
              <button onClick={()=>onAssign(room)}
                style={{flex:1,padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",
                  background:C.indLight,color:C.ind,fontWeight:700,fontSize:10}}>
                + Assign
              </button>
              <button onClick={()=>onInvite(room)}
                style={{flex:1,padding:"7px 4px",borderRadius:10,border:"none",cursor:"pointer",
                  background:C.ind,color:"white",fontWeight:700,fontSize:10}}>
                🔗 Invite
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Building Group ─────────────────────────────────────── */
function BuildingGroup({ bid, name, rooms, onToggle, onEdit, onAddRoom, onInvite, onDelete, onAddBill, onAssign, onViewDetail }) {
  const occ = rooms.filter(r=>r.tenantName?.trim()).length;
  return (
    <div style={{marginBottom:24}}>
      {/* Header */}
      <div style={{background:C.card,border:`1.5px solid ${C.bdr}`,borderRadius:18,
        padding:"12px 14px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:13,background:C.indLight,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <i className="fa-solid fa-building" style={{fontSize:18,color:C.ind}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:11,color:C.t3,fontWeight:600,marginBottom:1}}>Building</p>
            <p style={{fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:800,
              color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</p>
          </div>
          {bid!=="no-building"&&(
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              <button onClick={()=>onAddRoom(bid)}
                style={{height:32,padding:"0 12px",borderRadius:10,border:"none",cursor:"pointer",
                  background:C.ind,color:"white",fontWeight:700,fontSize:12,
                  display:"flex",alignItems:"center",gap:4}}>
                <i className="fa-solid fa-plus" style={{fontSize:9}}/> Room
              </button>
              <button onClick={()=>onDelete("building",bid,name)}
                style={{width:32,height:32,borderRadius:10,border:"none",cursor:"pointer",
                  background:"#FEE2E2",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <i className="fa-solid fa-trash" style={{fontSize:11,color:"#DC2626"}}/>
              </button>
            </div>
          )}
        </div>
        {/* Stats strip */}
        <div style={{display:"flex",marginTop:10,paddingTop:10,borderTop:`1px solid ${C.bdr2}`}}>
          {[
            {l:"Occupied",v:occ,          c:C.ind},
            {l:"Vacant",  v:rooms.length-occ, c:"#10B981"},
            {l:"Total",   v:rooms.length, c:C.t2},
          ].map(s=>(
            <div key={s.l} style={{flex:1,textAlign:"center"}}>
              <p style={{fontFamily:"'Nunito',sans-serif",fontSize:18,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</p>
              <p style={{fontSize:10,fontWeight:600,color:C.t3,marginTop:2}}>{s.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Rooms — horizontal scroll like reference UI */}
      <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
        {rooms.map(r=>(
          <div key={r.id} style={{minWidth:140,maxWidth:140}}>
            <RoomCard room={r} onToggle={onToggle} onEdit={onEdit}
              onInvite={onInvite} onDelete={onDelete}
              onAddBill={onAddBill} onAssign={onAssign} onViewDetail={onViewDetail}/>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Bottom Nav ─────────────────────────────────────────── */
const TABS = [
  {k:"home",      ic:"fa-solid fa-house",             l:"Home"},
  {k:"tenants",   ic:"fa-solid fa-users",             l:"Tenants"},
  {k:"payments",  ic:"fa-solid fa-receipt",           l:"Rent"},
  {k:"complaints",ic:"fa-solid fa-triangle-exclamation", l:"Issues"},
  {k:"you",       ic:"fa-solid fa-bars",              l:"More"},
];
function BottomNav({ active, onTab }) {
  return (
    <nav style={{flexShrink:0,display:"flex",background:C.card,
      borderTop:`1.5px solid ${C.bdr}`,padding:"10px 4px 16px",
      paddingBottom:"max(16px,env(safe-area-inset-bottom))"}}>
      {TABS.map(t=>{
        const on=active===t.k;
        return (
          <button key={t.k} onClick={()=>onTab(t.k)}
            style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
              background:"none",border:"none",cursor:"pointer",padding:"0 4px"}}>
            <div style={{width:40,height:36,borderRadius:12,display:"flex",alignItems:"center",
              justifyContent:"center",fontSize:20,
              background:on?C.indLight:"transparent",color:on?C.ind:C.t3,
              transition:"all .2s"}}>
              <i className={t.ic}/>
            </div>
            <span style={{fontSize:10,fontWeight:600,color:on?C.ind:C.t3}}>{t.l}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* ─── Complaints Sheet (owner view) ─────────────────────── */
function ComplaintsSheet({ ownerId, rooms, onClose }) {
  const [list,    setList]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerId) return;
    const unsub = onSnapshot(
      query(collection(db, "complaints"), where("ownerId", "==", ownerId)),
      snap => {
        const l = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        l.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        setList(l);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [ownerId]);

  const resolve = async (id) => {
    try {
      await updateDoc(doc(db, "complaints", id), { status: "resolved", resolvedAt: new Date().toISOString() });
    } catch {}
  };

  const prioColor = { low:"#10B981", medium:"#F59E0B", high:"#EF4444" };
  const typeIcon  = { water:"💧", electricity:"⚡", maintenance:"🔧", noise:"🔊", other:"📝" };

  const open     = list.filter(c => c.status !== "resolved");
  const resolved = list.filter(c => c.status === "resolved");

  return (
    <Sheet onClose={onClose} title={`🚨 Complaints (${open.length} open)`}>
      {loading ? (
        <p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"20px 0"}}>Loading…</p>
      ) : list.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <p style={{fontSize:42,marginBottom:10}}>🎉</p>
          <p style={{fontWeight:800,fontSize:16,color:C.t1}}>कोई complaint नहीं!</p>
          <p style={{fontSize:13,color:C.t2,marginTop:4}}>All tenants are happy 😊</p>
        </div>
      ) : (
        <>
          {/* Open complaints */}
          {open.length > 0 && <>
            <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Open</p>
            {open.map(c => {
              const room = rooms.find(r => r.id === c.roomId);
              return (
                <div key={c.id} style={{background:C.bg,borderRadius:16,padding:"14px",marginBottom:10,border:`1.5px solid ${C.bdr}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:8}}>
                    <span style={{fontSize:22,flexShrink:0}}>{typeIcon[c.type]||"📝"}</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                        <span style={{fontSize:12,fontWeight:700,color:C.t1,textTransform:"capitalize"}}>{c.type}</span>
                        <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:20,
                          background:(prioColor[c.priority]||"#F59E0B")+"22",
                          color:prioColor[c.priority]||"#F59E0B"}}>
                          {c.priority} priority
                        </span>
                      </div>
                      <p style={{fontSize:13,color:C.t1,lineHeight:1.5,marginBottom:4}}>{c.description}</p>
                      <p style={{fontSize:11,color:C.t3}}>
                        Room {room?.roomNo||c.roomId?.slice(-4)} · {room?.tenantName||"Tenant"} ·{" "}
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : ""}
                      </p>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={() => resolve(c.id)}
                      style={{flex:1,padding:"8px",borderRadius:10,border:"none",cursor:"pointer",
                        background:"linear-gradient(135deg,#10B981,#059669)",color:"white",fontWeight:700,fontSize:12}}>
                      ✓ Mark Resolved
                    </button>
                    {room?.tenantPhone && (
                      <button onClick={()=>window.open(`https://wa.me/91${room.tenantPhone}?text=${encodeURIComponent(`नमस्ते ${room.tenantName}! आपकी complaint मिल गई। हम जल्दी ठीक करेंगे। 🙏`)}`,"_blank")}
                        style={{padding:"8px 12px",borderRadius:10,border:"none",cursor:"pointer",
                          background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:700,fontSize:12,
                          display:"flex",alignItems:"center",gap:4}}>
                        <i className="fa-brands fa-whatsapp"/>Reply
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </>}

          {/* Resolved */}
          {resolved.length > 0 && <>
            <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",margin:"16px 0 10px"}}>
              Resolved ({resolved.length})
            </p>
            {resolved.map(c => {
              const room = rooms.find(r => r.id === c.roomId);
              return (
                <div key={c.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`,opacity:.6}}>
                  <span style={{fontSize:18,flexShrink:0}}>{typeIcon[c.type]||"📝"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:13,fontWeight:600,color:C.t1}}>{c.description}</p>
                    <p style={{fontSize:11,color:C.t3}}>Room {room?.roomNo||""} · {room?.tenantName||"Tenant"}</p>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,color:"#10B981",background:"#DCFCE7",padding:"2px 8px",borderRadius:8,flexShrink:0}}>✓ Done</span>
                </div>
              );
            })}
          </>}
        </>
      )}
      <div style={{height:8}}/>
    </Sheet>
  );
}

/* ─── "You" profile sheet ────────────────────────────────── */
function YouSheet({ ownerName, authUser, onClose, onAction }) {
  const { language, setLanguage } = useApp();
  const Row = ({ icon, bg, iconColor, label, sub, right, onClick, red }) => (
    <button onClick={onClick}
      style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 0",
        background:"none",border:"none",cursor:"pointer",
        borderBottom:`1px solid ${C.bdr2}`,textAlign:"left"}}>
      <div style={{width:40,height:40,borderRadius:13,background:bg||C.indLight,flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"center"}}>
        <i className={icon} style={{fontSize:16,color:iconColor||C.ind}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontWeight:700,fontSize:14,color:red?"#DC2626":C.t1}}>{label}</p>
        {sub&&<p style={{fontSize:11,color:C.t2,marginTop:1}}>{sub}</p>}
      </div>
      {right||<i className="fa-solid fa-chevron-right" style={{fontSize:12,color:C.bdr,flexShrink:0}}/>}
    </button>
  );
  return (
    <Sheet onClose={onClose}>
      {/* Profile card */}
      <div style={{display:"flex",alignItems:"center",gap:14,padding:14,borderRadius:16,
        background:C.bg,marginBottom:8,border:`1.5px solid ${C.bdr}`}}>
        <div style={{width:52,height:52,borderRadius:16,background:C.ind,flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center",
          color:"white",fontWeight:900,fontSize:18,fontFamily:"'Nunito',sans-serif"}}>
          {init(ownerName||authUser?.email||"O")}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontWeight:800,fontSize:16,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {ownerName||"Owner"}
          </p>
          <p style={{fontSize:12,color:C.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {authUser?.email}
          </p>
        </div>
        <button onClick={()=>{onClose();onAction("profile");}}
          style={{padding:"6px 12px",borderRadius:10,border:"none",cursor:"pointer",
            background:C.indLight,color:C.ind,fontWeight:700,fontSize:12}}>
          Edit
        </button>
      </div>

      <Row icon="fa-solid fa-chart-line"        bg="#EEF2FF"  iconColor={C.ind}    label="Analytics"    sub="Revenue & occupancy trends"  onClick={()=>{onClose();onAction("analytics");}}/>
      <Row icon="fa-solid fa-user-pen"          bg="#FEF3C7"  iconColor="#B45309"  label="Edit Profile" sub="Name, address, UPI ID"        onClick={()=>{onClose();onAction("profile");}}/>
      <Row icon="fa-solid fa-cloud-arrow-down"  bg="#DCFCE7"  iconColor="#15803D"  label="Backup Data"  sub="Download JSON snapshot"       onClick={()=>{onClose();onAction("backup");}}/>
      <Row
        icon="fa-solid fa-language" bg="#F3E8FF" iconColor="#7C3AED"
        label="Language" sub={language==="hi"?"हिंदी चालू है":"English is on"}
        onClick={()=>setLanguage(language==="hi"?"en":"hi")}
        right={
          <div style={{width:46,height:26,borderRadius:99,flexShrink:0,position:"relative",cursor:"pointer",
            background:language==="hi"?C.ind:"#E4E4E7",transition:"background .25s"}}>
            <div style={{position:"absolute",top:3,width:20,height:20,borderRadius:"50%",background:"white",
              boxShadow:"0 1px 4px rgba(0,0,0,.2)",transition:"left .25s",
              left:language==="hi"?"calc(100% - 23px)":3}}/>
          </div>
        }
      />
      <Row icon="fa-solid fa-right-from-bracket" bg="#FEE2E2" iconColor="#DC2626" label="Logout" sub="Sign out of your account"
        onClick={()=>onAction("logout")} red/>
      <div style={{height:8}}/>
    </Sheet>
  );
}


/* ─── Header — static, zero motion ──────────────────────── */
function Header({ ownerName, rooms, loading }) {
  const rev  = useMemo(()=>rooms.reduce((s,r)=>s+(r.amountPaid||0),0),[rooms]);
  const pend = useMemo(()=>rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).reduce((s,r)=>s+(r.balanceDue||r.rent||0),0),[rooms]);
  const total = rooms.length;
  const occ   = rooms.filter(r=>r.tenantName?.trim()).length;
  return (
    <header style={{background:C.dark,flexShrink:0,position:"relative",overflow:"hidden",
      paddingTop:"max(44px,env(safe-area-inset-top))"}}>
      <div style={{position:"absolute",width:160,height:160,borderRadius:"50%",
        background:"rgba(99,102,241,.18)",top:-50,right:-40,pointerEvents:"none"}}/>
      <div style={{position:"absolute",width:90,height:90,borderRadius:"50%",
        background:"rgba(99,102,241,.1)",bottom:-25,left:-15,pointerEvents:"none"}}/>
      <div style={{position:"relative",zIndex:1,padding:"12px 16px 16px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div>
            <p style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:500,marginBottom:2}}>Good {greet()} 👋</p>
            <p style={{fontFamily:"'Nunito',sans-serif",fontSize:20,fontWeight:900,color:"white",lineHeight:1}}>
              {ownerName?.split(" ")[0]||"Owner"}
            </p>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Bell rooms={rooms}/>
            <div style={{width:38,height:38,borderRadius:13,background:C.ind,flexShrink:0,
              display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:"white"}}>
              {ownerName?ownerName.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase():"RK"}
            </div>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {[
            {l:"Total Rooms",v:String(total),   sub:`${total-occ} vacant`,   bg:"#6366F1",ic:"fa-solid fa-building"},
            {l:"Tenants",    v:String(occ),     sub:`${rooms.filter(r=>r.status==="paid").length} paid`, bg:"#0F9D8B",ic:"fa-solid fa-users"},
            {l:"Collected",  v:inr(rev),         sub:"This month",             bg:"#F59E0B",ic:"fa-solid fa-indian-rupee-sign",mono:true},
            {l:"Dues Left",  v:inr(pend),        sub:`${rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).length} pending`,bg:"#EF4444",ic:"fa-solid fa-clock",mono:true},
          ].map(k=>(
            <div key={k.l} style={{borderRadius:16,padding:"12px 14px",position:"relative",overflow:"hidden",background:k.bg}}>
              <div style={{position:"absolute",right:10,top:10,width:30,height:30,borderRadius:9,
                background:"rgba(255,255,255,.15)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <i className={k.ic} style={{fontSize:13,color:"rgba(255,255,255,.9)"}}/>
              </div>
              <div style={{position:"absolute",width:55,height:55,borderRadius:"50%",
                background:"rgba(255,255,255,.07)",bottom:-14,left:-7}}/>
              <p style={{fontSize:9,fontWeight:600,color:"rgba(255,255,255,.65)",textTransform:"uppercase",letterSpacing:".3px",marginBottom:5}}>{k.l}</p>
              <p style={{fontSize:19,fontWeight:900,color:"white",lineHeight:1,
                fontFamily:k.mono?"'JetBrains Mono',monospace":"'Nunito',sans-serif"}}>
                {loading?"—":k.v}
              </p>
              <p style={{fontSize:10,color:"rgba(255,255,255,.55)",marginTop:3}}>{k.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}


/* ─── Quick action tiles ─────────────────────────────────── */
function QuickTiles({ onAnalytics, onExpenses, onRemind }) {
  const tiles = [
    {ic:"fa-solid fa-chart-line",l:"Analytics",bg:"#EEF2FF",ic2:C.ind,  fn:onAnalytics},
    {ic:"fa-solid fa-receipt",   l:"Expenses", bg:"#FEF3C7",ic2:"#B45309",fn:onExpenses},
    {ic:"fa-brands fa-whatsapp", l:"Remind",   bg:"#DCFCE7",ic2:"#15803D",fn:onRemind},
    {ic:"fa-solid fa-file-pdf",  l:"Report",   bg:"#DBEAFE",ic2:"#1D4ED8",fn:()=>{}},
  ];
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
      {tiles.map(t=>(
        <button key={t.l} onClick={t.fn}
          style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"13px 4px 11px",
            borderRadius:16,background:C.card,border:`1.5px solid ${C.bdr}`,cursor:"pointer",
            boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}
          onPointerDown={e=>e.currentTarget.style.opacity=".7"}
          onPointerUp={e=>e.currentTarget.style.opacity="1"}>
          <div style={{width:40,height:40,borderRadius:13,background:t.bg,
            display:"flex",alignItems:"center",justifyContent:"center",marginBottom:6}}>
            <i className={t.ic} style={{fontSize:17,color:t.ic2}}/>
          </div>
          <span style={{fontSize:10,fontWeight:700,color:C.t2}}>{t.l}</span>
        </button>
      ))}
    </div>
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
      `🏠 *RoomKhata Pro — Rent Reminder*\n\nनमस्ते ${room.tenantName}! 🙏\n\nRoom *${room.roomNo}* का किराया अभी तक नहीं आया है।\n\nDue Amount: *₹${(room.rent||0)+(room.electricityBill||0)}*\n\nकृपया जल्दी payment करें। धन्यवाद! 🙏`
    );
    window.open(`https://wa.me/91${room.tenantPhone}?text=${msg}`, "_blank");
  };

  const sendAll = () => pendingTenants.forEach(r => {
    const msg = encodeURIComponent(
      `🏠 *RoomKhata Pro — Rent Reminder*\n\nनमस्ते ${r.tenantName}! 🙏\n\nRoom *${r.roomNo}* का किराया pending है।\n\nDue: *₹${(r.rent||0)+(r.electricityBill||0)}*\n\nPlease pay soon. धन्यवाद! 🙏`
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

/* ─── Add Bill Sheet ─────────────────────────────────────── */
function AddBillSheet({ room, onClose, toast }) {
  const [amount, setAmount] = useState(String(room.electricityBill || ""));
  const [month,  setMonth]  = useState(
    new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })
  );
  const [busy, setBusy] = useState(false);

  const go = async e => {
    e.preventDefault();
    const bill = parseInt(amount, 10);
    if (!bill || bill < 0) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "rooms", room.id), {
        electricityBill: bill,
        lastBillMonth:   month,
        // If room was paid, reset to pending so tenant pays new total
        ...(room.status === "paid" ? { status: "pending", amountPaid: 0, balanceDue: (room.rent || 0) + bill } : {}),
      });
      toast(`⚡ Bill ₹${bill.toLocaleString("en-IN")} added for Room ${room.roomNo}`);
      onClose();
    } catch(e) { toast(e.message, "error"); }
    setBusy(false);
  };

  const currentTotal = (room.rent || 0) + (parseInt(amount, 10) || 0);

  return (
    <Sheet onClose={onClose} title={`⚡ Electricity Bill — Room ${room.roomNo}`}>
      <form onSubmit={go}>
        {/* Tenant info */}
        <div style={{background:"linear-gradient(135deg,#1E1B4B,#2A1860)",
          borderRadius:16,padding:"14px 16px",marginBottom:16,
          display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:42,height:42,borderRadius:13,background:G.violet,flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center",
            color:"white",fontWeight:900,fontSize:15}}>
            {init(room.tenantName)}
          </div>
          <div>
            <p style={{fontSize:14,fontWeight:800,color:"white"}}>{room.tenantName}</p>
            <p style={{fontSize:11,color:"rgba(255,255,255,.45)"}}>Room {room.roomNo} · Rent {inr(room.rent)}</p>
          </div>
        </div>

        <SInput label="Electricity Bill Amount (₹)" type="number"
          value={amount} onChange={setAmount}
          placeholder="e.g. 850" required min="1"/>

        <SInput label="Billing Month"
          value={month} onChange={setMonth}
          placeholder="e.g. June 2025"/>

        {/* Live total preview */}
        {parseInt(amount,10) > 0 && (
          <div style={{background:"#FEFCE8",border:"1.5px solid #FEF08A",borderRadius:14,
            padding:"12px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <p style={{fontSize:11,color:"#92400E",fontWeight:600}}>New Total Due</p>
              <p style={{fontSize:11,color:"#CA8A04"}}>
                Rent {inr(room.rent)} + ⚡ {inr(parseInt(amount,10)||0)}
              </p>
            </div>
            <p style={{fontSize:22,fontWeight:900,color:"#CA8A04",
              fontFamily:"'JetBrains Mono',monospace"}}>{inr(currentTotal)}</p>
          </div>
        )}

        {room.status === "paid" && (
          <div style={{background:"#FEF3C7",border:"1.5px solid #FDE68A",borderRadius:12,
            padding:"10px 14px",marginBottom:14}}>
            <p style={{fontSize:12,color:"#92400E",fontWeight:600}}>
              ⚠️ Room की status "Paid" है — bill add करने पर status वापस "Pending" हो जाएगी।
            </p>
          </div>
        )}

        <SBtn loading={busy} label="⚡ Bill Save करें" grad="linear-gradient(135deg,#F59E0B,#D97706)"/>
        <div style={{height:8}}/>
      </form>
    </Sheet>
  );
}

/* ─── Assign Tenant Sheet (offline/manual assignment) ────── */
function AssignTenantSheet({ room, onClose, toast }) {
  const [name,    setName]    = useState("");
  const [phone,   setPhone]   = useState("");
  const [rent,    setRent]    = useState(String(room.rent || ""));
  const [deposit, setDeposit] = useState(String(room.securityDeposit || ""));
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState("");

  const go = async e => {
    e.preventDefault();
    setErr("");
    if (!name.trim())         { setErr("Tenant का नाम जरूरी है।"); return; }
    if (phone && phone.length !== 10) { setErr("Phone 10 digits का होना चाहिए।"); return; }
    setBusy(true);
    try {
      await updateDoc(doc(db, "rooms", room.id), {
        tenantName:      name.trim(),
        tenantPhone:     phone.trim() || "",
        rent:            parseInt(rent,   10) || 0,
        securityDeposit: parseInt(deposit,10) || 0,
        status:          "pending",
        // Clear any previous tenant link since this is an offline assignment
        tenantUid:       "",
        amountPaid:      0,
        balanceDue:      parseInt(rent,10) || 0,
        assignedAt:      new Date().toISOString(),
      });
      toast(`✓ ${name.trim()} को Room ${room.roomNo} में assign किया!`);
      onClose();
    } catch(e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Sheet onClose={onClose} title={`🏠 Assign Tenant — Room ${room.roomNo}`}>
      <form onSubmit={go}>
        {/* Room info */}
        <div style={{background:C.bg,border:`1.5px solid ${C.bdr}`,borderRadius:14,
          padding:"12px 14px",marginBottom:16,
          display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:38,height:38,borderRadius:11,
            background:"linear-gradient(135deg,#CBD5E1,#94A3B8)",flexShrink:0,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <i className="fa-solid fa-door-open" style={{fontSize:16,color:"white",opacity:.7}}/>
          </div>
          <div>
            <p style={{fontSize:13,fontWeight:800,color:C.t1}}>Room {room.roomNo}</p>
            <p style={{fontSize:11,color:C.t3}}>Currently Vacant</p>
          </div>
        </div>

        <SInput label="Tenant का नाम *" value={name} onChange={setName}
          placeholder="Ravi Kumar" required/>

        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
            textTransform:"uppercase",letterSpacing:".08em",marginBottom:5}}>
            WhatsApp Number (optional)
          </label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
              fontSize:14,fontWeight:700,color:C.brand,pointerEvents:"none"}}>+91</span>
            <input type="tel" value={phone}
              onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))}
              placeholder="10-digit number"
              style={{width:"100%",padding:"13px 14px 13px 48px",borderRadius:13,
                fontSize:15,fontWeight:500,outline:"none",color:C.t1,
                fontFamily:"'Poppins',sans-serif",background:"#F5F3FF",
                border:`1.5px solid ${C.bdr}`,transition:"all .2s"}}
              onFocus={e=>{e.target.style.borderColor=C.brand;e.target.style.background="#fff";}}
              onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
          </div>
          <p style={{fontSize:11,color:C.t3,marginTop:4}}>
            Number देने पर tenant को WhatsApp reminder भेज सकते हैं।
          </p>
        </div>

        <SInput label="Monthly Rent (₹) *" type="number"
          value={rent} onChange={setRent}
          placeholder="8000" required min="1"/>

        <SInput label="Security Deposit (₹)" type="number"
          value={deposit} onChange={setDeposit}
          placeholder="16000" min="0"/>

        {/* Summary preview */}
        {name.trim() && parseInt(rent,10) > 0 && (
          <div style={{background:"#F0FDF4",border:"1.5px solid #86EFAC",borderRadius:14,
            padding:"12px 16px",marginBottom:14}}>
            <p style={{fontSize:12,fontWeight:700,color:"#14532D",marginBottom:6}}>Assignment Summary</p>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:12,color:"#166534"}}>Tenant</span>
              <span style={{fontSize:12,fontWeight:700,color:"#14532D"}}>{name.trim()}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontSize:12,color:"#166534"}}>Monthly Rent</span>
              <span style={{fontSize:12,fontWeight:700,color:"#14532D"}}>{inr(parseInt(rent,10)||0)}</span>
            </div>
            {parseInt(deposit,10) > 0 && (
              <div style={{display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,color:"#166534"}}>Security Deposit</span>
                <span style={{fontSize:12,fontWeight:700,color:"#14532D"}}>{inr(parseInt(deposit,10))}</span>
              </div>
            )}
          </div>
        )}

        {err && (
          <div style={{background:"#FEE2E2",color:"#991B1B",border:"1.5px solid #FECACA",
            borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:12}}>
            {err}
          </div>
        )}

        <SBtn loading={busy} label="✓ Tenant Assign करें" grad={G.emerald}/>

        <div style={{background:C.bg,border:`1.5px solid ${C.bdr}`,borderRadius:12,
          padding:"10px 14px",marginTop:12}}>
          <p style={{fontSize:11,color:C.t2,lineHeight:1.5}}>
            💡 अगर tenant app use करना चाहे तो बाद में <strong>🔗 Invite</strong> button से
            Connection Code share करें — वो उससे login करके connect हो जाएगा।
          </p>
        </div>
        <div style={{height:8}}/>
      </form>
    </Sheet>
  );
}

/* ─── Photo Picker helper ────────────────────────────────── */
// Converts a file input image to a base64 string (stored in Firestore)
function pickPhoto(onChange) {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment";
  inp.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result); // base64 data URL
    reader.readAsDataURL(file);
  };
  inp.click();
}

function Avatar({ src, name, size=64, grad, onPick, label="Photo" }) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
      <div
        onClick={onPick ? ()=>pickPhoto(onPick) : undefined}
        style={{width:size,height:size,borderRadius:size*.28,flexShrink:0,cursor:onPick?"pointer":"default",
          background:src?"transparent":grad||G.violet,overflow:"hidden",position:"relative",
          border:`2px solid ${src?"#EDE9FE":"transparent"}`,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
        {src
          ? <img src={src} alt={name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          : <span style={{color:"white",fontWeight:900,fontSize:size*.24}}>{init(name)}</span>}
        {onPick && (
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.35)",
            display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity .2s"}}
            onMouseEnter={e=>e.currentTarget.style.opacity=1}
            onMouseLeave={e=>e.currentTarget.style.opacity=0}>
            <i className="fa-solid fa-camera" style={{color:"white",fontSize:size*.2}}/>
          </div>
        )}
      </div>
      {onPick && (
        <span style={{fontSize:10,fontWeight:600,color:C.t3,cursor:"pointer"}}
          onClick={()=>pickPhoto(onPick)}>
          <i className="fa-solid fa-camera" style={{marginRight:4}}/>{label}
        </span>
      )}
    </div>
  );
}

/* ─── Tenant Detail Sheet ────────────────────────────────── */
function TenantDetailSheet({ room, onClose, toast }) {
  const [photo,       setPhoto]       = useState(room.tenantPhoto     || "");
  const [name,        setName]        = useState(room.tenantName      || "");
  const [phone,       setPhone]       = useState(room.tenantPhone     || "");
  const [aadhaar,     setAadhaar]     = useState(room.tenantAadhaar   || "");
  const [address,     setAddress]     = useState(room.tenantAddress   || "");
  const [occupation,  setOccupation]  = useState(room.tenantOccupation|| "");
  const [emergencyName, setEmName]    = useState(room.emergencyName   || "");
  const [emergencyPhone,setEmPhone]   = useState(room.emergencyPhone  || "");
  const [dob,         setDob]         = useState(room.tenantDob       || "");
  const [busy,        setBusy]        = useState(false);
  const [tab,         setTab]         = useState("details"); // "details" | "docs"

  const save = async e => {
    e.preventDefault(); setBusy(true);
    try {
      await updateDoc(doc(db,"rooms",room.id),{
        tenantPhoto:       photo,
        tenantName:        name.trim(),
        tenantPhone:       phone.trim(),
        tenantAadhaar:     aadhaar.trim(),
        tenantAddress:     address.trim(),
        tenantOccupation:  occupation.trim(),
        emergencyName:     emergencyName.trim(),
        emergencyPhone:    emergencyPhone.trim(),
        tenantDob:         dob,
      });
      toast(`✓ ${name.trim()} का profile update हो गया!`);
      onClose();
    } catch(e) { toast(e.message,"error"); }
    setBusy(false);
  };

  const TAB = (k,l) => (
    <button type="button" onClick={()=>setTab(k)}
      style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
        background:tab===k?G.violet:"#F5F3FF",color:tab===k?"white":C.t2,transition:"all .2s"}}>
      {l}
    </button>
  );

  return (
    <Sheet onClose={onClose} title="">
      <div style={{padding:"0 18px"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:18,paddingTop:4}}>
          <Avatar src={photo} name={name||"?"} size={72} onPick={setPhoto} label="Change Photo"/>
          <div style={{flex:1}}>
            <p style={{fontWeight:900,fontSize:18,color:C.t1,lineHeight:1.1}}>{name||"New Tenant"}</p>
            <p style={{fontSize:12,color:C.t3,marginTop:3}}>Room {room.roomNo}</p>
            {occupation && <p style={{fontSize:12,color:C.vi,fontWeight:600,marginTop:2}}>{occupation}</p>}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          <TAB k="details" l="👤 Details"/>
          <TAB k="docs"    l="📄 Documents"/>
          <TAB k="emergency" l="🆘 Emergency"/>
        </div>

        <form onSubmit={save}>
          {tab==="details" && <>
            <SInput label="Full Name *" value={name} onChange={setName} placeholder="Ravi Kumar" required/>
            <div style={{marginBottom:13}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
                textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>WhatsApp Number</label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
                  fontSize:14,fontWeight:700,color:C.brand,pointerEvents:"none"}}>+91</span>
                <input type="tel" value={phone}
                  onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))}
                  placeholder="10-digit number"
                  style={{width:"100%",padding:"13px 14px 13px 48px",borderRadius:13,fontSize:15,
                    fontWeight:500,outline:"none",color:C.t1,fontFamily:"'Poppins',sans-serif",
                    background:"#F5F3FF",border:`1.5px solid ${C.bdr}`,transition:"all .2s"}}
                  onFocus={e=>{e.target.style.borderColor=C.brand;e.target.style.background="#fff";}}
                  onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
              </div>
            </div>
            <SInput label="Occupation / Profession" value={occupation} onChange={setOccupation} placeholder="e.g. Software Engineer, Student, Shopkeeper"/>
            <SInput label="Date of Birth" type="date" value={dob} onChange={setDob}/>
            <div style={{marginBottom:13}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
                textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>
                Permanent Address
              </label>
              <textarea rows={3} value={address} onChange={e=>setAddress(e.target.value)}
                placeholder="Permanent home address…"
                style={{width:"100%",padding:"12px 14px",borderRadius:13,fontSize:14,fontWeight:500,
                  outline:"none",color:C.t1,fontFamily:"'Poppins',sans-serif",resize:"none",
                  background:"#F5F3FF",border:`1.5px solid ${C.bdr}`,transition:"all .2s"}}
                onFocus={e=>{e.target.style.borderColor=C.brand;e.target.style.background="#fff";}}
                onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
            </div>
          </>}

          {tab==="docs" && <>
            <div style={{background:"#FFF7ED",border:"1.5px solid #FED7AA",borderRadius:14,
              padding:"10px 14px",marginBottom:16}}>
              <p style={{fontSize:12,color:"#92400E",fontWeight:600}}>
                📸 Aadhaar card का photo click करके upload करें। यह data सिर्फ आपके device पर store होता है।
              </p>
            </div>
            <SInput label="Aadhaar Number" value={aadhaar} onChange={v=>setAadhaar(v.replace(/\D/g,"").slice(0,12))}
              placeholder="12-digit Aadhaar number"/>
            {/* Aadhaar photo front */}
            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
                textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>
                Aadhaar Card Photo
              </label>
              <div style={{display:"flex",gap:10}}>
                {["aadhaarFront","aadhaarBack"].map(k=>{
                  const src = k==="aadhaarFront" ? room.aadhaarFront : room.aadhaarBack;
                  return (
                    <div key={k}
                      onClick={()=>pickPhoto(b64=>{
                        updateDoc(doc(db,"rooms",room.id),{[k]:b64})
                          .then(()=>toast(`✓ ${k==="aadhaarFront"?"Front":"Back"} uploaded!`))
                          .catch(()=>toast("Upload failed","error"));
                      })}
                      style={{flex:1,aspectRatio:"1.6",borderRadius:12,cursor:"pointer",
                        border:`2px dashed ${C.bdr}`,overflow:"hidden",
                        background:C.bg,display:"flex",flexDirection:"column",
                        alignItems:"center",justifyContent:"center",gap:6}}>
                      {src
                        ? <img src={src} alt={k} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <>
                          <i className="fa-solid fa-id-card" style={{fontSize:22,color:C.t3}}/>
                          <span style={{fontSize:10,fontWeight:600,color:C.t3}}>
                            {k==="aadhaarFront"?"Front":"Back"}
                          </span>
                        </>
                      }
                    </div>
                  );
                })}
              </div>
            </div>
          </>}

          {tab==="emergency" && <>
            <div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:14,
              padding:"10px 14px",marginBottom:16}}>
              <p style={{fontSize:12,color:"#991B1B",fontWeight:600}}>
                🆘 Emergency में इस व्यक्ति से संपर्क करें।
              </p>
            </div>
            <SInput label="Emergency Contact Name" value={emergencyName} onChange={setEmName}
              placeholder="Father / Mother / Spouse name"/>
            <div style={{marginBottom:13}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
                textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Emergency Phone</label>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
                  fontSize:14,fontWeight:700,color:C.brand,pointerEvents:"none"}}>+91</span>
                <input type="tel" value={emergencyPhone}
                  onChange={e=>setEmPhone(e.target.value.replace(/\D/g,"").slice(0,10))}
                  placeholder="Emergency number"
                  style={{width:"100%",padding:"13px 14px 13px 48px",borderRadius:13,fontSize:15,
                    fontWeight:500,outline:"none",color:C.t1,fontFamily:"'Poppins',sans-serif",
                    background:"#F5F3FF",border:`1.5px solid ${C.bdr}`,transition:"all .2s"}}
                  onFocus={e=>{e.target.style.borderColor=C.brand;e.target.style.background="#fff";}}
                  onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
              </div>
            </div>
          </>}

          <SBtn loading={busy} label="💾 Save Profile" grad={G.violet}/>
          <div style={{height:8}}/>
        </form>
      </div>
    </Sheet>
  );
}

/* ─── Room Detail Sheet ──────────────────────────────────── */
function RoomDetailSheet({ room, buildings, onClose, onEdit, onToggle, onAddBill, onAssign, onInvite, onDelete, toast }) {
  const vacant  = !room.tenantName?.trim();
  const total   = (room.rent||0) + (room.electricityBill||0);
  const cfg     = SC[vacant?"vacant":(room.status||"pending")] || SC.pending;
  const bName   = buildings[room.buildingId]?.name || "";
  const [showTenant, setShowTenant] = useState(false);

  const Row = ({icon,label,value,mono,color})=> value ? (
    <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"11px 0",
      borderBottom:`1px solid ${C.bdr}`}}>
      <i className={icon} style={{fontSize:14,color:C.vi,marginTop:2,width:16,textAlign:"center"}}/>
      <div style={{flex:1}}>
        <p style={{fontSize:11,color:C.t3,fontWeight:600,marginBottom:2}}>{label}</p>
        <p style={{fontSize:14,fontWeight:700,color:color||C.t1,
          fontFamily:mono?"'JetBrains Mono',monospace":"inherit"}}>{value}</p>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Sheet onClose={onClose} title="">
        {/* Room hero */}
        <div style={{background:G.hdr,margin:"0 0 0",padding:"0 0 20px"}}>
          <div style={{padding:"16px 18px 0"}}>
            {/* Room number + building */}
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <div style={{width:52,height:52,borderRadius:16,background:"rgba(255,255,255,.12)",
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className="fa-solid fa-door-open" style={{fontSize:22,color:"white"}}/>
              </div>
              <div style={{flex:1}}>
                <p style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:600,marginBottom:2}}>
                  {bName || "Room"}
                </p>
                <p style={{fontSize:22,fontWeight:900,color:"white"}}>Room {room.roomNo}</p>
              </div>
              <span style={{fontSize:11,fontWeight:700,padding:"4px 12px",borderRadius:20,
                background:cfg.bdg[0]+"33",color:"white",border:"1px solid rgba(255,255,255,.2)"}}>
                {cfg.lbl}
              </span>
            </div>

            {/* Rent summary */}
            <div style={{display:"flex",gap:8}}>
              {[
                {l:"Rent",v:inr(room.rent||0),c:"#F5A623"},
                {l:"Electricity",v:inr(room.electricityBill||0),c:"#FCD34D"},
                {l:"Total Due",v:inr(total),c:"#86EFAC"},
              ].map(s=>(
                <div key={s.l} style={{flex:1,background:"rgba(255,255,255,.08)",borderRadius:12,
                  padding:"10px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,.10)"}}>
                  <p style={{fontSize:9,color:"rgba(255,255,255,.45)",fontWeight:600,
                    textTransform:"uppercase",marginBottom:4}}>{s.l}</p>
                  <p style={{fontSize:14,fontWeight:900,color:s.c,
                    fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{padding:"4px 18px 0"}}>
          {/* Tenant section */}
          <div style={{marginBottom:4}}>
            <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",
              letterSpacing:".08em",margin:"14px 0 10px"}}>Tenant</p>

            {vacant ? (
              <div style={{background:C.bg,borderRadius:16,padding:"16px",
                textAlign:"center",border:`1.5px dashed ${C.bdr}`,marginBottom:14}}>
                <i className="fa-solid fa-user-slash" style={{fontSize:24,color:C.t3,marginBottom:8,display:"block"}}/>
                <p style={{fontWeight:700,color:C.t2,marginBottom:10}}>Room Vacant है</p>
                <button onClick={()=>{onClose();onAssign(room);}}
                  style={{padding:"9px 20px",borderRadius:12,border:"none",cursor:"pointer",
                    background:G.brand,color:"white",fontWeight:800,fontSize:13}}>
                  + Assign Tenant
                </button>
              </div>
            ) : (
              <div onClick={()=>setShowTenant(true)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",
                  background:C.bg,borderRadius:16,border:`1.5px solid ${C.bdr}`,
                  cursor:"pointer",marginBottom:4,transition:"all .15s"}}
                onPointerDown={e=>e.currentTarget.style.background="#EDE9FE"}
                onPointerUp={e=>e.currentTarget.style.background=C.bg}>
                <Avatar src={room.tenantPhoto} name={room.tenantName} size={48} grad={G.violet}/>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontWeight:800,fontSize:15,color:C.t1}}>{room.tenantName}</p>
                  <p style={{fontSize:12,color:C.t3}}>
                    {room.tenantOccupation||""}
                    {room.tenantPhone ? ` · +91 ${room.tenantPhone}` : ""}
                  </p>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:8,
                    background:cfg.bdg[0],color:cfg.bdg[1]}}>{cfg.lbl}</span>
                  <span style={{fontSize:11,color:C.vi,fontWeight:600}}>View Profile →</span>
                </div>
              </div>
            )}
          </div>

          {/* Room details */}
          <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",
            letterSpacing:".08em",margin:"14px 0 4px"}}>Room Details</p>
          <Row icon="fa-solid fa-key"      label="Connection Code"  value={room.connectionCode} mono/>
          <Row icon="fa-solid fa-calendar" label="Move-in Date"
            value={room.assignedAt
              ? new Date(room.assignedAt).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})
              : room.createdAt?.toDate
              ? room.createdAt.toDate().toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})
              : null}/>
          <Row icon="fa-solid fa-shield"   label="Security Deposit" value={room.securityDeposit>0?inr(room.securityDeposit):null} color="#7C3AED"/>
          <Row icon="fa-solid fa-bolt"     label="Last Bill Month"  value={room.lastBillMonth}/>

          {/* Action buttons */}
          <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",
            letterSpacing:".08em",margin:"16px 0 10px"}}>Actions</p>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            {!vacant && <>
              <button onClick={()=>{onClose();onToggle(room.id,room.status);}}
                style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",
                  background:cfg.btn,color:"white",fontWeight:800,fontSize:13}}>
                ₹ {cfg.btnL}
              </button>
              <button onClick={()=>{onClose();onAddBill(room);}}
                style={{padding:"11px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:13,
                  background:"#FEFCE8",color:"#CA8A04",border:"1px solid #FEF08A"}}>
                ⚡ Add Bill
              </button>
              <button onClick={()=>{onClose();onEdit(room);}}
                style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",
                  background:C.bg,color:C.vi,fontWeight:700,fontSize:13}}>
                ✏️ Edit Room
              </button>
              <button onClick={()=>{onClose();onInvite(room);}}
                style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",
                  background:G.brand,color:"white",fontWeight:700,fontSize:13}}>
                🔗 Invite
              </button>
            </>}
            {vacant && <>
              <button onClick={()=>{onClose();onAssign(room);}}
                style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",
                  background:G.brand,color:"white",fontWeight:800,fontSize:13}}>
                + Assign
              </button>
              <button onClick={()=>{onClose();onInvite(room);}}
                style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",
                  background:G.violet,color:"white",fontWeight:700,fontSize:13}}>
                🔗 Invite
              </button>
            </>}
          </div>
          <button onClick={()=>{onClose();onDelete("room",room.id,`Room ${room.roomNo}`);}}
            style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #FECACA",
              cursor:"pointer",background:"#FEF2F2",color:"#E11D48",fontWeight:700,fontSize:13}}>
            🗑️ Delete Room
          </button>
          <div style={{height:16}}/>
        </div>
      </Sheet>

      {/* Tenant detail sub-sheet */}
      <AnimatePresence>
        {showTenant && (
          <TenantDetailSheet key="td" room={room}
            onClose={()=>setShowTenant(false)} toast={toast}/>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Delete Confirm Sheet ───────────────────────────────── */
function DeleteConfirmSheet({ target, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const isBuilding = target?.type === "building";
  return (
    <Sheet onClose={onClose} title="">
      <div style={{padding:"8px 18px 0",textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:12}}>
          {isBuilding ? "🏚️" : "🚪"}
        </div>
        <p style={{fontWeight:900,fontSize:20,color:"#1E1B4B",marginBottom:8}}>
          {isBuilding ? "Building Delete करें?" : "Room Delete करें?"}
        </p>
        <p style={{fontSize:14,color:"#6B7280",marginBottom:8,lineHeight:1.6}}>
          <strong style={{color:"#E11D48"}}>{target?.name}</strong> को permanently delete करना चाहते हैं?
        </p>
        {isBuilding && (
          <div style={{background:"#FEF3C7",border:"1.5px solid #FDE68A",borderRadius:12,
            padding:"10px 14px",marginBottom:16,textAlign:"left"}}>
            <p style={{fontSize:12,color:"#92400E",fontWeight:600}}>
              ⚠️ Building delete करने से उसके <strong>सभी rooms भी delete</strong> हो जाएंगे।
            </p>
          </div>
        )}
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={onClose}
            style={{flex:1,padding:"14px",borderRadius:14,border:"1.5px solid #EDE9FE",
              cursor:"pointer",background:"#F5F3FF",color:"#6B7280",fontWeight:700,fontSize:15}}>
            Cancel
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              // Close FIRST — before the Firestore delete fires.
              // This prevents a freeze when onSnapshot updates rooms/buildings
              // while this sheet is still mounted, causing AnimatePresence conflicts.
              onClose();
              await onConfirm();
            }}
            style={{flex:1,padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
              background:"linear-gradient(135deg,#E11D48,#9F1239)",color:"white",
              fontWeight:900,fontSize:15,opacity:busy?.6:1}}>
            {busy ? "Deleting…" : "हाँ, Delete करो"}
          </button>
        </div>
        <div style={{height:8}}/>
      </div>
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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const [addBldg,    setAddBldg]    = useState(false);
  const [addRoomBid, setAddRoomBid] = useState(null);
  const [editRoom,   setEditRoom]   = useState(null);
  const [youOpen,    setYouOpen]    = useState(false);
  const [inviteRoom, setInviteRoom] = useState(null);
  const [addBillRoom,  setAddBillRoom]  = useState(null);
  const [assignRoom,   setAssignRoom]   = useState(null);
  const [viewRoom,     setViewRoom]     = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showExpenses,  setShowExpenses]  = useState(false);
  const [showRemind,      setShowRemind]      = useState(false);
  const [showTenants,     setShowTenants]     = useState(false);
  const [showPayments,    setShowPayments]    = useState(false);
  const [showComplaints,  setShowComplaints]  = useState(false);
  const [deleteTarget,  setDeleteTarget]  = useState(null);

  const unsubR   = useRef(null);
  const unsubB   = useRef(null);
  const scrollRef= useRef(null);

  // ── Toast — must be declared before any callback that uses it ──
  const toast = useCallback((msg, type="success") => {
    const id = Date.now();
    setToasts(p => [...p, {id, msg, type}]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }, []);

  // ── Feedback submission handler ───────────────────────────
  const handleFeedbackSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!feedbackName.trim() || !feedbackEmail.trim() || !feedbackMsg.trim()) {
      toast("Please fill in all fields", "error");
      return;
    }
    setFeedbackLoading(true);
    try {
      const formData = new FormData();
      formData.append("access_key", "4cb17617-20f4-4add-9d6d-26bd1fff23a0");
      formData.append("name", feedbackName.trim());
      formData.append("email", feedbackEmail.trim());
      formData.append("message", feedbackMsg.trim());
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        toast("✉️ Feedback sent successfully!");
        setFeedbackOpen(false);
        setFeedbackName("");
        setFeedbackEmail("");
        setFeedbackMsg("");
      } else {
        toast("Failed to send feedback", "error");
      }
    } catch (err) {
      toast("Error sending feedback", "error");
    } finally {
      setFeedbackLoading(false);
    }
  }, [feedbackName, feedbackEmail, feedbackMsg, toast]);

  // ── Delete handlers ───────────────────────────────────────
  const handleDelete = useCallback((type, id, name) => {
    setDeleteTarget({ type, id, name });
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    try {
      if (type === "room") {
        await deleteDoc(doc(db, "rooms", id));
        toast("🗑️ Room deleted");
      } else if (type === "building") {
        const roomSnap = await getDocs(
          query(collection(db, "rooms"), where("buildingId", "==", id))
        );
        await Promise.all(roomSnap.docs.map(d => deleteDoc(doc(db, "rooms", d.id))));
        await deleteDoc(doc(db, "buildings", id));
        toast("🗑️ Building and all rooms deleted");
      }
    } catch(e) {
      toast(e.message, "error");
    }
  }, [deleteTarget, toast]);

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

  const handleTab = useCallback(k => {
    setTab(k);
    if (k === "you")        setYouOpen(true);
    if (k === "tenants")    setShowTenants(true);
    if (k === "payments")   setShowPayments(true);
    if (k === "complaints") setShowComplaints(true);
  }, []);

  /* Filtered + grouped */
  const filtered = useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rooms.filter(r=>{
      const mf=filter==="all"?true:filter==="paid"?r.status==="paid":["pending","partial"].includes(r.status);
      const ms=!q||r.roomNo?.toString().toLowerCase().includes(q)||r.tenantName?.toLowerCase().includes(q);
      return mf&&ms;
    });
  },[rooms,filter,search]);

  const grouped = useMemo(()=>{
    const g={};
    filtered.forEach(r=>{const bid=r.buildingId||"no-building";(g[bid]=g[bid]||[]).push(r);});
    return Object.entries(g);
  },[filtered]);

  const hasFilter = filter!=="all"||search.trim()!=="";

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",
        background:C.bg,fontFamily:"'Poppins',-apple-system,sans-serif"}}>

        {/* Sticky header */}
        <Header ownerName={ownerName} rooms={rooms} loading={loading}/>

        {/* Scrollable body */}
        <div ref={scrollRef}
          style={{flex:1,overflowY:"auto",overflowX:"hidden",background:C.bg,
            WebkitOverflowScrolling:"touch",minHeight:0}}>

          <div style={{padding:"16px 14px 28px"}}>

            <QuickTiles
              onAnalytics={()=>setShowAnalytics(true)}
              onExpenses={()=>setShowExpenses(true)}
              onRemind={()=>setShowRemind(true)}
            />

            {/* Section header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <p style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:17,color:C.t1}}>
                Buildings
              </p>
              <button onClick={()=>setAddBldg(true)}
                style={{height:34,padding:"0 14px",borderRadius:10,border:"none",cursor:"pointer",
                  background:C.ind,color:"white",fontWeight:700,fontSize:12,
                  display:"flex",alignItems:"center",gap:6}}>
                <i className="fa-solid fa-plus" style={{fontSize:10}}/> Add Building
              </button>
            </div>

            {/* Search */}
            <div style={{position:"relative",marginBottom:12}}>
              <i className="fa-solid fa-magnifying-glass"
                style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
                  fontSize:13,color:C.t3,pointerEvents:"none"}}/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search room or tenant…"
                style={{width:"100%",padding:"11px 40px",borderRadius:14,
                  border:`1.5px solid ${C.bdr}`,background:C.card,
                  fontSize:14,fontWeight:500,color:C.t1,outline:"none",
                  fontFamily:"'Poppins',sans-serif",boxSizing:"border-box"}}
                onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.boxShadow=`0 0 0 3px ${C.indBorder}44`;}}
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
            <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
              {[{k:"all",l:"All"},{k:"pending",l:"⏳ Pending"},{k:"paid",l:"✓ Paid"}].map(c=>{
                const on=filter===c.k;
                return (
                  <button key={c.k} onClick={()=>setFilter(c.k)}
                    style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",
                      whiteSpace:"nowrap",fontWeight:600,fontSize:12,flexShrink:0,transition:"all .2s",
                      background:on?C.ind:C.card,color:on?"white":C.t2,
                      boxShadow:on?`0 2px 8px ${C.ind}44`:`0 1px 3px rgba(0,0,0,.06)`}}>
                    {c.l}
                  </button>
                );
              })}
            </div>

            {/* Skeleton */}
            {loading&&(
              <div style={{display:"flex",gap:10,overflowX:"auto"}}>
                {[...Array(3)].map((_,i)=>(
                  <div key={i} style={{minWidth:140,background:C.card,borderRadius:18,padding:10,
                    border:`1.5px solid ${C.bdr}`,flexShrink:0}}>
                    <div className="sk" style={{width:"100%",height:76,borderRadius:12,marginBottom:8}}/>
                    <div className="sk" style={{height:14,width:"60%",marginBottom:6}}/>
                    <div className="sk" style={{height:11,width:"80%",marginBottom:8}}/>
                    <div className="sk" style={{height:30,width:"100%"}}/>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {!loading&&grouped.length===0&&(
              <div style={{textAlign:"center",padding:"52px 0"}}>
                <div style={{width:72,height:72,borderRadius:24,background:C.indLight,
                  display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
                  <i className={hasFilter?"fa-solid fa-filter":"fa-regular fa-building"}
                    style={{fontSize:28,color:C.ind}}/>
                </div>
                <p style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:18,color:C.t1,marginBottom:6}}>
                  {hasFilter?"No matching rooms":"No buildings yet"}
                </p>
                <p style={{fontSize:13,color:C.t2,marginBottom:20}}>
                  {hasFilter?"Try a different filter or search":"Add your first building to get started"}
                </p>
                {!hasFilter&&(
                  <button onClick={()=>setAddBldg(true)}
                    style={{padding:"12px 28px",borderRadius:14,border:"none",cursor:"pointer",
                      background:C.ind,color:"white",fontWeight:700,fontSize:14}}>
                    <i className="fa-solid fa-plus" style={{marginRight:8}}/>Add Building
                  </button>
                )}
              </div>
            )}

            {/* Buildings */}
            {!loading&&grouped.map(([bid,bRooms])=>(
              <BuildingGroup key={bid}
                bid={bid}
                name={bid==="no-building"?"Uncategorized":buildings[bid]?.name||"Building"}
                rooms={bRooms}
                onToggle={handleToggle}
                onEdit={r=>setEditRoom(r)}
                onAddRoom={id=>setAddRoomBid(id)}
                onInvite={r=>setInviteRoom(r)}
                onDelete={handleDelete}
                onAddBill={r=>setAddBillRoom(r)}
                onAssign={r=>setAssignRoom(r)}
                onViewDetail={r=>setViewRoom(r)}
              />
            ))}

          </div>
        </div>

        {/* Bottom nav */}
        <BottomNav active={tab} onTab={handleTab}/>

      </div>

      {/* Toasts */}
      <Toasts list={toasts} dismiss={useCallback(id=>setToasts(p=>p.filter(t=>t.id!==id)),[])}/>

      {/* Sheets */}
      <AnimatePresence>
        {viewRoom&&<RoomDetailSheet key="rd"
          room={viewRoom} buildings={buildings}
          onClose={()=>setViewRoom(null)}
          onEdit={r=>{setViewRoom(null);setEditRoom(r);}}
          onToggle={(id,s)=>{setViewRoom(null);handleToggle(id,s);}}
          onAddBill={r=>{setViewRoom(null);setAddBillRoom(r);}}
          onAssign={r=>{setViewRoom(null);setAssignRoom(r);}}
          onInvite={r=>{setViewRoom(null);setInviteRoom(r);}}
          onDelete={(t,id,n)=>{setViewRoom(null);handleDelete(t,id,n);}}
          toast={toast}/>}
        {addBillRoom&&<AddBillSheet key="bill" room={addBillRoom} onClose={()=>setAddBillRoom(null)} toast={toast}/>}
        {assignRoom&&<AssignTenantSheet key="assign" room={assignRoom} onClose={()=>setAssignRoom(null)} toast={toast}/>}
        {deleteTarget&&(
          <DeleteConfirmSheet key="del"
            target={deleteTarget}
            onClose={()=>setDeleteTarget(null)}
            onConfirm={confirmDelete}
          />
        )}
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
        {youOpen&&(
          <YouSheet key="you" ownerName={ownerName} authUser={authUser}
            onClose={()=>{setYouOpen(false);setTab("home");}} onAction={handleYou}/>
        )}
        {feedbackOpen&&(
          <motion.div key="feedback" variants={vFade} initial="hidden" animate="visible" exit="exit"
            style={{position:"fixed",inset:0,zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{position:"absolute",inset:0,background:"rgba(7,5,15,.72)"}} onClick={()=>setFeedbackOpen(false)}/>
            <motion.div variants={vScale} initial="hidden" animate="visible" exit="exit"
              style={{position:"relative",zIndex:1,background:"#fff",borderRadius:20,padding:28,maxWidth:420,width:"calc(100% - 32px)",
                boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
              <p style={{fontWeight:900,fontSize:20,color:C.t1,marginBottom:4}}>Share Feedback</p>
              <p style={{fontSize:13,color:C.t2,marginBottom:20}}>Help us improve your experience</p>
              <form onSubmit={handleFeedbackSubmit} style={{display:"flex",flexDirection:"column",gap:14}}>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
                    textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Name *</label>
                  <input type="text" value={feedbackName} onChange={e=>setFeedbackName(e.target.value)}
                    placeholder="Your name" disabled={feedbackLoading}
                    style={{width:"100%",padding:"12px 14px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",
                      fontFamily:"'Poppins',sans-serif",color:C.t1,background:"#F5F3FF",
                      border:`1.5px solid ${C.bdr}`,boxSizing:"border-box",
                      transition:"all .2s"}} onFocus={e=>{e.target.style.background="#fff";e.target.style.borderColor=C.brand;}}
                    onBlur={e=>{e.target.style.background="#F5F3FF";e.target.style.borderColor=C.bdr;}}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
                    textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Email *</label>
                  <input type="email" value={feedbackEmail} onChange={e=>setFeedbackEmail(e.target.value)}
                    placeholder="your@email.com" disabled={feedbackLoading}
                    style={{width:"100%",padding:"12px 14px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",
                      fontFamily:"'Poppins',sans-serif",color:C.t1,background:"#F5F3FF",
                      border:`1.5px solid ${C.bdr}`,boxSizing:"border-box",
                      transition:"all .2s"}} onFocus={e=>{e.target.style.background="#fff";e.target.style.borderColor=C.brand;}}
                    onBlur={e=>{e.target.style.background="#F5F3FF";e.target.style.borderColor=C.bdr;}}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.vi,
                    textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Message *</label>
                  <textarea value={feedbackMsg} onChange={e=>setFeedbackMsg(e.target.value)}
                    placeholder="Tell us what you think…" disabled={feedbackLoading}
                    style={{width:"100%",padding:"12px 14px",borderRadius:12,fontSize:14,fontWeight:500,outline:"none",
                      fontFamily:"'Poppins',sans-serif",color:C.t1,background:"#F5F3FF",
                      border:`1.5px solid ${C.bdr}`,boxSizing:"border-box",minHeight:100,resize:"vertical",
                      transition:"all .2s"}} onFocus={e=>{e.target.style.background="#fff";e.target.style.borderColor=C.brand;}}
                    onBlur={e=>{e.target.style.background="#F5F3FF";e.target.style.borderColor=C.bdr;}}/>
                </div>
                <div style={{display:"flex",gap:10,marginTop:8}}>
                  <button type="button" onClick={()=>setFeedbackOpen(false)} disabled={feedbackLoading}
                    style={{flex:1,padding:"12px",borderRadius:12,border:`1.5px solid ${C.bdr}`,
                      background:"white",color:C.t1,fontWeight:700,fontSize:14,cursor:"pointer",
                      fontFamily:"'Poppins',sans-serif",transition:"all .2s",opacity:feedbackLoading?.6:1}}>
                    Cancel
                  </button>
                  <button type="submit" disabled={feedbackLoading}
                    style={{flex:1,padding:"12px",borderRadius:12,border:"none",background:G.brand,
                      color:"white",fontWeight:700,fontSize:14,cursor:"pointer",
                      fontFamily:"'Poppins',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                      transition:"all .2s",opacity:feedbackLoading?.7:1}}>
                    {feedbackLoading?(
                      <svg style={{width:16,height:16,animation:"spin 1s linear infinite"}} viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
                      </svg>
                    ):"Send"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Feedback Button */}
      <motion.button
        onClick={()=>setFeedbackOpen(true)}
        whileHover={{scale:1.1}} whileTap={{scale:.95}}
        style={{position:"fixed",bottom:80,right:20,zIndex:100,width:56,height:56,borderRadius:"50%",
          border:"none",background:G.brand,color:"white",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:"0 8px 24px rgba(99,102,241,.35)",fontWeight:700,fontSize:20}}>
        💬
      </motion.button>
    </>
  );
}
