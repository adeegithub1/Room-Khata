// src/views/OwnerDashboardView.jsx
import {useState,useEffect,useCallback,useRef,useMemo} from "react";
import {useNavigate} from "react-router-dom";
import {motion,AnimatePresence} from "framer-motion";
import {collection,query,where,onSnapshot,getDocs,addDoc,updateDoc,deleteDoc,doc,getDoc,setDoc} from "firebase/firestore";
import {signOut} from "firebase/auth";
import {auth,db} from "../firebase/config";
import {useApp} from "../context/AppContext";

/* ── tokens ── */
const C={ind:"#6366F1",ind2:"#4F46E5",indL:"#EEF2FF",indB:"#C7D2FE",teal:"#0F9D8B",
  amber:"#F59E0B",red:"#EF4444",dark:"#1A1A2E",bg:"#F7F7FB",card:"#FFFFFF",
  bdr:"#F1F0F7",t1:"#18181B",t2:"#71717A",t3:"#A1A1AA"};
const G={ind:`linear-gradient(135deg,#6366F1,#4F46E5)`,teal:`linear-gradient(135deg,#0F9D8B,#0D9488)`,
  amber:`linear-gradient(135deg,#F59E0B,#D97706)`,red:`linear-gradient(135deg,#EF4444,#DC2626)`,
  green:`linear-gradient(135deg,#10B981,#059669)`,brand:`linear-gradient(135deg,#FF6B35,#F5A623)`};

const inr=n=>"₹"+Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const ini=s=>s?.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase()||"?";
const mkCode=()=>"RK-"+Array.from({length:6},()=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");
const greet=()=>{const h=new Date().getHours();return h<12?"Morning":h<17?"Afternoon":h<21?"Evening":"Night";};

const vUp={hidden:{opacity:0,y:16},visible:{opacity:1,y:0,transition:{duration:.4,ease:[.22,1,.36,1]}}};
const vFade={hidden:{opacity:0},visible:{opacity:1,transition:{duration:.25}},exit:{opacity:0,transition:{duration:.2}}};
const vSheet={hidden:{y:"100%"},visible:{y:0,transition:{duration:.38,ease:[.22,1,.36,1]}},exit:{y:"100%",transition:{duration:.28}}};

/* ── Spinner ── */
function Spin(){return <svg style={{width:18,height:18,animation:"spin 1s linear infinite",flexShrink:0}} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/></svg>;}

/* ── Sheet ── */
function Sheet({onClose,title,children}){
  return <motion.div variants={vFade} initial="hidden" animate="visible" exit="exit"
    style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
    <div style={{position:"absolute",inset:0,background:"rgba(26,26,46,.75)"}} onClick={onClose}/>
    <motion.div variants={vSheet} initial="hidden" animate="visible" exit="exit"
      style={{position:"relative",zIndex:1,background:"#fff",borderRadius:"22px 22px 0 0",
        maxHeight:"90dvh",overflowY:"auto",paddingBottom:"max(24px,env(safe-area-inset-bottom))"}}>
      <div style={{width:36,height:4,borderRadius:9,background:"#DDD6FE",margin:"12px auto 0"}}/>
      <div style={{padding:"14px 18px 0"}}>
        {title&&<p style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:20,color:C.t1,marginBottom:16}}>{title}</p>}
        {children}
      </div>
    </motion.div>
  </motion.div>;
}

/* ── SInput / SBtn ── */
function SI({label,value,onChange,placeholder,type="text",min,max,required}){
  const [f,setF]=useState(false);
  return <div style={{marginBottom:13}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>{label}{required?" *":""}</label>}
    <input type={type} value={value} placeholder={placeholder} required={required} min={min} max={max}
      onChange={e=>onChange(e.target.value)} onFocus={()=>setF(true)} onBlur={()=>setF(false)}
      style={{width:"100%",padding:"12px 14px",borderRadius:13,fontSize:14,fontWeight:500,outline:"none",
        fontFamily:"'Poppins',sans-serif",color:C.t1,background:f?"#fff":"#F5F3FF",
        border:`1.5px solid ${f?C.ind:C.bdr}`,boxShadow:f?`0 0 0 3px ${C.indB}55`:"none",transition:"all .18s"}}/>
  </div>;
}
function SB({label,loading,grad,onClick,type="submit"}){
  return <button type={type} onClick={onClick} disabled={loading}
    style={{width:"100%",padding:"14px",borderRadius:14,border:"none",cursor:"pointer",
      background:grad||G.ind,color:"white",fontWeight:800,fontSize:15,fontFamily:"'Poppins',sans-serif",
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      boxShadow:"0 4px 16px rgba(99,102,241,.3)",opacity:loading?.5:1,marginTop:4}}
    onPointerDown={e=>e.currentTarget.style.transform="scale(.97)"}
    onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
    {loading?<><Spin/>Saving…</>:label}
  </button>;
}

/* ── Toast ── */
function Toasts({list,dismiss}){
  return <div style={{position:"fixed",bottom:76,left:0,right:0,zIndex:300,
    display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"0 16px",pointerEvents:"none"}}>
    <AnimatePresence>
      {list.map(t=>(
        <motion.div key={t.id} layout initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
          onClick={()=>dismiss(t.id)}
          style={{pointerEvents:"auto",maxWidth:320,width:"100%",padding:"11px 16px",borderRadius:16,
            cursor:"pointer",color:"white",fontWeight:700,fontSize:14,
            background:t.type==="error"?G.red:G.green,boxShadow:"0 6px 20px rgba(0,0,0,.2)"}}>
          {t.msg}
        </motion.div>
      ))}
    </AnimatePresence>
  </div>;
}

/* ── Bell ── */
function Bell({rooms}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  const notifs=useMemo(()=>{
    const l=[];
    rooms.filter(r=>r.status==="pending_verification"&&r.tenantName?.trim())
      .forEach(r=>l.push({id:`pv-${r.id}`,icon:"fa-solid fa-eye",col:"#818CF8",title:"Verify payment",sub:`Room ${r.roomNo} · ${r.tenantName}`}));
    rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim()).slice(0,3)
      .forEach(r=>l.push({id:`pd-${r.id}`,icon:"fa-solid fa-clock",col:"#FCA5A5",title:"Rent due",sub:`Room ${r.roomNo} · ${r.tenantName} · ${inr(r.rent)}`}));
    return l;
  },[rooms]);
  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("pointerdown",h);
    return()=>document.removeEventListener("pointerdown",h);
  },[open]);
  return <div ref={ref} style={{position:"relative",zIndex:50}}>
    <button onClick={()=>setOpen(p=>!p)}
      style={{width:40,height:40,borderRadius:"50%",cursor:"pointer",position:"relative",
        display:"flex",alignItems:"center",justifyContent:"center",
        background:open?"rgba(255,255,255,.22)":"rgba(255,255,255,.1)",
        border:"1px solid rgba(255,255,255,.18)"}}>
      <i className="fa-regular fa-bell" style={{fontSize:17,color:"rgba(255,255,255,.9)"}}/>
      <AnimatePresence>
        {notifs.length>0&&<motion.span key="dot" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}}
          style={{position:"absolute",top:-2,right:-2,minWidth:16,height:16,borderRadius:9,
            background:"#EF4444",color:"white",fontSize:9,fontWeight:900,
            display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px",
            boxShadow:"0 0 0 2px rgba(26,26,46,.7)"}}>
          {notifs.length>9?"9+":notifs.length}
        </motion.span>}
      </AnimatePresence>
    </button>
    <AnimatePresence>
      {open&&<motion.div initial={{opacity:0,y:-8,scale:.96}} animate={{opacity:1,y:0,scale:1}}
        exit={{opacity:0,y:-8,scale:.96}} transition={{duration:.18}}
        style={{position:"absolute",top:46,right:0,width:270,
          background:"rgba(10,7,25,.95)",backdropFilter:"blur(20px)",
          border:"1px solid rgba(255,255,255,.1)",borderRadius:18,
          boxShadow:"0 16px 48px rgba(0,0,0,.5)",overflow:"hidden"}}>
        <div style={{padding:"10px 14px 8px",borderBottom:"1px solid rgba(255,255,255,.07)",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <i className="fa-solid fa-bell" style={{fontSize:11,color:C.amber}}/>
            <span style={{fontWeight:800,fontSize:12,color:"rgba(255,255,255,.85)"}}>Notifications</span>
            {notifs.length>0&&<span style={{background:"#EF4444",color:"white",fontSize:9,fontWeight:900,padding:"1px 5px",borderRadius:6}}>{notifs.length}</span>}
          </div>
          <button onClick={()=>setOpen(false)} style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.4)",fontSize:14}}><i className="fa-solid fa-xmark"/></button>
        </div>
        <div style={{maxHeight:240,overflowY:"auto"}}>
          {notifs.length===0
            ?<div style={{padding:"24px 16px",textAlign:"center",color:"rgba(255,255,255,.28)",fontSize:13}}>All caught up ✨</div>
            :notifs.map((n,i)=>(
              <div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",
                borderBottom:i<notifs.length-1?"1px solid rgba(255,255,255,.05)":"none"}}>
                <div style={{width:28,height:28,borderRadius:9,background:"rgba(129,140,248,.15)",
                  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
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
        {notifs.length>0&&<div style={{padding:"8px 14px 10px",borderTop:"1px solid rgba(255,255,255,.07)"}}>
          <button onClick={()=>setOpen(false)} style={{width:"100%",background:"none",border:"none",cursor:"pointer",fontSize:11,fontWeight:700,color:C.amber}}>Mark all as read</button>
        </div>}
      </motion.div>}
    </AnimatePresence>
  </div>;
}

/* ── Header — static, no scroll animation ── */
function Header({ownerName,rooms,loading}){
  const rev=useMemo(()=>rooms.reduce((s,r)=>s+(r.amountPaid||0),0),[rooms]);
  const pend=useMemo(()=>rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).reduce((s,r)=>s+(r.balanceDue||r.rent||0),0),[rooms]);
  const total=rooms.length;
  const occ=rooms.filter(r=>r.tenantName?.trim()).length;
  return <header style={{background:C.dark,flexShrink:0,position:"relative",overflow:"hidden",
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
          {l:"Total Rooms",v:String(total),  sub:`${total-occ} vacant`,  bg:"#6366F1",ic:"fa-solid fa-building"},
          {l:"Tenants",    v:String(occ),    sub:`${rooms.filter(r=>r.status==="paid").length} paid`, bg:"#0F9D8B",ic:"fa-solid fa-users"},
          {l:"Collected",  v:inr(rev),       sub:"This month",           bg:"#F59E0B",ic:"fa-solid fa-indian-rupee-sign",mono:true},
          {l:"Dues Left",  v:inr(pend),      sub:`${rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).length} pending`, bg:"#EF4444",ic:"fa-solid fa-clock",mono:true},
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
  </header>;
}

/* ── Quick tiles ── */
function QuickTiles({onAnalytics,onExpenses,onRemind}){
  const tiles=[
    {ic:"fa-solid fa-chart-line",l:"Analytics",bg:"#EEF2FF",ic2:C.ind,fn:onAnalytics},
    {ic:"fa-solid fa-receipt",   l:"Expenses", bg:"#FEF3C7",ic2:"#B45309",fn:onExpenses},
    {ic:"fa-brands fa-whatsapp", l:"Remind",   bg:"#DCFCE7",ic2:"#15803D",fn:onRemind},
    {ic:"fa-solid fa-file-pdf",  l:"Report",   bg:"#DBEAFE",ic2:"#1D4ED8",fn:()=>{}},
  ];
  return <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:20}}>
    {tiles.map(t=>(
      <button key={t.l} onClick={t.fn}
        style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"13px 4px 11px",
          borderRadius:16,background:C.card,border:`1.5px solid ${C.bdr}`,
          cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
        <div style={{width:40,height:40,borderRadius:13,background:t.bg,
          display:"flex",alignItems:"center",justifyContent:"center",marginBottom:6}}>
          <i className={t.ic} style={{fontSize:17,color:t.ic2}}/>
        </div>
        <span style={{fontSize:10,fontWeight:700,color:C.t2}}>{t.l}</span>
      </button>
    ))}
  </div>;
}

/* ── Status config ── */
const SC={
  paid:                {lbl:"✓ Paid",   bdr:"#86EFAC",bdg:["#DCFCE7","#15803D"],btn:G.green, btnL:"Undo"},
  partial:             {lbl:"◑ Partial",bdr:"#93C5FD",bdg:["#DBEAFE","#1D4ED8"],btn:G.green, btnL:"Receive"},
  pending_verification:{lbl:"👀 Verify",bdr:"#C4B5FD",bdg:["#F3E8FF","#7C3AED"],btn:G.ind,   btnL:"Verify"},
  pending:             {lbl:"⏳ Pending",bdr:"#FCA5A5",bdg:["#FEF3C7","#B45309"],btn:G.ind,   btnL:"Receive"},
  vacant:              {lbl:"Vacant",   bdr:C.bdr,    bdg:["#F4F4F5","#71717A"]},
};

/* ── Room Card ── */
function RoomCard({room,onToggle,onEdit,onInvite,onDelete,onAddBill,onAssign,onView}){
  const {roomNo,tenantName,rent=0,electricityBill=0,status="pending",balanceDue=0,securityDeposit=0}=room;
  const vacant=!tenantName?.trim();
  const cfg=SC[vacant?"vacant":(status||"pending")]||SC.pending;
  const total=rent+(electricityBill||0);
  const avBg=vacant?"#F4F4F5":status==="paid"?"#EEF2FF":status==="partial"?"#DBEAFE":"#FFF7ED";
  const avCol=vacant?"#A1A1AA":status==="paid"?C.ind:status==="partial"?"#3B82F6":"#F59E0B";
  return <div style={{background:C.card,borderRadius:18,border:`1.5px solid ${cfg.bdr}`,overflow:"hidden",cursor:"pointer"}}
    onClick={()=>onView(room)}>
    {/* Top area */}
    <div style={{height:72,display:"flex",alignItems:"center",justifyContent:"center",
      background:avBg,position:"relative",overflow:"hidden"}}>
      {room.tenantPhoto
        ?<img src={room.tenantPhoto} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
        :vacant
          ?<i className="fa-solid fa-door-open" style={{fontSize:24,color:"#A1A1AA"}}/>
          :<span style={{fontFamily:"'Nunito',sans-serif",fontSize:20,fontWeight:900,color:avCol}}>{ini(tenantName)}</span>
      }
      <span style={{position:"absolute",top:6,left:6,fontSize:9,fontWeight:700,
        padding:"2px 7px",borderRadius:20,background:cfg.bdg[0],color:cfg.bdg[1]}}>
        {cfg.lbl}
      </span>
      <div style={{position:"absolute",top:5,right:5,display:"flex",gap:3}}
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
    <div style={{padding:"9px 10px 11px"}} onClick={e=>e.stopPropagation()}>
      <p style={{fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:900,color:C.t1,lineHeight:1}}>{roomNo}</p>
      <p style={{fontSize:11,color:C.t2,marginTop:1,marginBottom:5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {vacant?"Vacant":tenantName}
      </p>
      <p style={{fontSize:12,fontWeight:700,color:C.ind,marginBottom:electricityBill>0?2:8}}>{inr(total)}/mo</p>
      {electricityBill>0&&<p style={{fontSize:9,color:"#B45309",marginBottom:8}}>⚡ +{inr(electricityBill)}</p>}
      {!vacant?(
        status==="pending_verification"?(
          <button style={{width:"100%",padding:"7px",borderRadius:10,border:"none",cursor:"pointer",
            background:"#EEF2FF",color:"#4338CA",fontWeight:700,fontSize:11}}>✓ Verify</button>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            <button onClick={()=>onToggle(room.id,status)}
              style={{width:"100%",padding:"7px",borderRadius:10,border:"none",cursor:"pointer",
                background:status==="paid"?"#FEF3C7":G.ind,
                color:status==="paid"?"#B45309":"white",fontWeight:700,fontSize:11}}>
              {status==="paid"?"⏳ Undo":"₹ Receive"}
            </button>
            <button onClick={()=>onAddBill(room)}
              style={{width:"100%",padding:"7px",borderRadius:10,border:"1px solid #FEF08A",cursor:"pointer",
                background:"#FEFCE8",color:"#B45309",fontWeight:700,fontSize:11}}>⚡ Add Bill</button>
          </div>
        )
      ):(
        <div style={{display:"flex",gap:5}}>
          <button onClick={()=>onAssign(room)} style={{flex:1,padding:"7px",borderRadius:10,border:"none",cursor:"pointer",background:C.indL,color:C.ind,fontWeight:700,fontSize:10}}>+ Assign</button>
          <button onClick={()=>onInvite(room)} style={{flex:1,padding:"7px",borderRadius:10,border:"none",cursor:"pointer",background:G.ind,color:"white",fontWeight:700,fontSize:10}}>🔗 Invite</button>
        </div>
      )}
    </div>
  </div>;
}

/* ── Building group ── */
function BuildingGroup({bid,name,rooms,onToggle,onEdit,onAddRoom,onInvite,onDelete,onAddBill,onAssign,onView}){
  const occ=rooms.filter(r=>r.tenantName?.trim()).length;
  return <div style={{marginBottom:24}}>
    <div style={{background:C.card,border:`1.5px solid ${C.bdr}`,borderRadius:18,padding:"12px 14px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:42,height:42,borderRadius:13,background:C.indL,flexShrink:0,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <i className="fa-solid fa-building" style={{fontSize:18,color:C.ind}}/>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{fontSize:10,color:C.t3,fontWeight:600,marginBottom:1}}>Building</p>
          <p style={{fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:800,color:C.t1,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</p>
        </div>
        {bid!=="no-building"&&(
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            <button onClick={()=>onAddRoom(bid)}
              style={{height:32,padding:"0 12px",borderRadius:10,border:"none",cursor:"pointer",
                background:G.ind,color:"white",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:4}}>
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
      <div style={{display:"flex",marginTop:10,paddingTop:10,borderTop:`1px solid ${C.bdr}`}}>
        {[{l:"Occupied",v:occ,c:C.ind},{l:"Vacant",v:rooms.length-occ,c:"#10B981"},{l:"Total",v:rooms.length,c:C.t2}].map(s=>(
          <div key={s.l} style={{flex:1,textAlign:"center"}}>
            <p style={{fontFamily:"'Nunito',sans-serif",fontSize:18,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</p>
            <p style={{fontSize:10,fontWeight:600,color:C.t3,marginTop:2}}>{s.l}</p>
          </div>
        ))}
      </div>
    </div>
    <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
      {rooms.map(r=>(
        <div key={r.id} style={{minWidth:148,maxWidth:148}}>
          <RoomCard room={r} onToggle={onToggle} onEdit={onEdit} onInvite={onInvite}
            onDelete={onDelete} onAddBill={onAddBill} onAssign={onAssign} onView={onView}/>
        </div>
      ))}
    </div>
  </div>;
}

/* ── Bottom Nav ── */
const TABS=[
  {k:"home",   ic:"fa-solid fa-house",      l:"Home"},
  {k:"tenants",ic:"fa-solid fa-users",      l:"Tenants"},
  {k:"payments",ic:"fa-solid fa-receipt",   l:"Rent"},
  {k:"you",    ic:"fa-solid fa-bars",        l:"More"},
];
function BottomNav({active,onTab}){
  return <nav style={{flexShrink:0,display:"flex",background:C.card,
    borderTop:`1.5px solid ${C.bdr}`,padding:"8px 4px",
    paddingBottom:"max(14px,env(safe-area-inset-bottom))"}}>
    {TABS.map(t=>{const on=active===t.k;return(
      <button key={t.k} onClick={()=>onTab(t.k)}
        style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3,
          background:"none",border:"none",cursor:"pointer",padding:"0 4px"}}>
        <div style={{width:40,height:34,borderRadius:12,display:"flex",alignItems:"center",
          justifyContent:"center",fontSize:20,background:on?C.indL:"transparent",
          color:on?C.ind:C.t3,transition:"all .2s"}}>
          <i className={t.ic}/>
        </div>
        <span style={{fontSize:10,fontWeight:600,color:on?C.ind:C.t3}}>{t.l}</span>
      </button>
    );})}
  </nav>;
}

/* ── Photo picker ── */
function pickPhoto(cb){
  const inp=document.createElement("input");inp.type="file";inp.accept="image/*";
  inp.onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>cb(ev.target.result);r.readAsDataURL(f);};
  inp.click();
}

/* ── Add Building Sheet ── */
function AddBldgSheet({ownerId,onClose,toast}){
  const [name,setName]=useState("");const [cnt,setCnt]=useState("");const [start,setStart]=useState("");
  const [busy,setBusy]=useState(false);const [err,setErr]=useState("");
  const go=async e=>{e.preventDefault();setErr("");const n=parseInt(cnt,10);
    if(!name.trim()||!n||n<1){setErr("Name and room count required.");return;}setBusy(true);
    try{const bRef=await addDoc(collection(db,"buildings"),{ownerId,name:name.trim(),createdAt:new Date()});
      const s=parseInt(start,10)||1;
      await Promise.all(Array.from({length:n},(_,i)=>addDoc(collection(db,"rooms"),{
        buildingId:bRef.id,ownerId,roomNo:(s+i).toString(),tenantName:"",rent:0,
        status:"pending",connectionCode:mkCode(),createdAt:new Date(),
      })));
      toast(`✓ "${name.trim()}" with ${n} rooms added!`);onClose();
    }catch(e){setErr(e.message);}setBusy(false);
  };
  return <Sheet onClose={onClose} title="Add Building 🏠">
    <form onSubmit={go}>
      <SI label="Building Name" value={name} onChange={setName} placeholder="e.g. Sharma Niwas" required/>
      <SI label="Number of Rooms" type="number" value={cnt} onChange={setCnt} placeholder="6" min="1" max="99" required/>
      <SI label="Starting Room No. (optional)" value={start} onChange={setStart} placeholder="101 → 102, 103…"/>
      {err&&<div style={{background:"#FEE2E2",color:"#991B1B",borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:12}}>{err}</div>}
      <SB label="🏠 Create Building" loading={busy}/>
      <div style={{height:8}}/>
    </form>
  </Sheet>;
}

/* ── Add Room Sheet ── */
function AddRoomSheet({buildingId,ownerId,onClose,toast}){
  const [no,setNo]=useState("");const [rent,setRent]=useState("");const [busy,setBusy]=useState(false);
  const go=async e=>{e.preventDefault();if(!no.trim())return;setBusy(true);
    try{await addDoc(collection(db,"rooms"),{buildingId,ownerId,roomNo:no.trim(),rent:parseInt(rent,10)||0,
      tenantName:"",status:"pending",connectionCode:mkCode(),createdAt:new Date()});
      toast(`✓ Room ${no.trim()} added!`);onClose();}catch{}setBusy(false);};
  return <Sheet onClose={onClose} title="Add Room">
    <form onSubmit={go}><SI label="Room Number" value={no} onChange={setNo} placeholder="201" required/>
      <SI label="Monthly Rent (₹)" type="number" value={rent} onChange={setRent} placeholder="8000" min="0"/>
      <SB label="Add Room" loading={busy} grad={G.teal}/><div style={{height:8}}/></form>
  </Sheet>;
}

/* ── Edit Room Sheet ── */
function EditRoomSheet({room,onClose,toast}){
  const [tenant,setTenant]=useState(room.tenantName||"");
  const [rent,setRent]=useState(String(room.rent||""));
  const [elec,setElec]=useState(String(room.electricityBill||""));
  const [dep,setDep]=useState(String(room.securityDeposit||""));
  const [busy,setBusy]=useState(false);
  const go=async e=>{e.preventDefault();setBusy(true);
    try{await updateDoc(doc(db,"rooms",room.id),{tenantName:tenant.trim(),rent:parseInt(rent,10)||0,
      electricityBill:parseInt(elec,10)||0,securityDeposit:parseInt(dep,10)||0});
      toast("✓ Room updated!");onClose();}catch(e){toast(e.message,"error");}setBusy(false);};
  return <Sheet onClose={onClose} title={`Edit Room ${room.roomNo}`}>
    <form onSubmit={go}>
      <SI label="Tenant Name" value={tenant} onChange={setTenant} placeholder="Ravi Kumar"/>
      <SI label="Monthly Rent (₹)" type="number" value={rent} onChange={setRent} placeholder="8000"/>
      <SI label="Electricity Bill (₹)" type="number" value={elec} onChange={setElec} placeholder="500"/>
      <SI label="Security Deposit (₹)" type="number" value={dep} onChange={setDep} placeholder="16000"/>
      <SB label="Save Changes" loading={busy} grad={G.teal}/><div style={{height:8}}/></form>
  </Sheet>;
}

/* ── Add Bill Sheet ── */
function AddBillSheet({room,onClose,toast}){
  const [amt,setAmt]=useState(String(room.electricityBill||""));
  const [month,setMonth]=useState(new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"}));
  const [busy,setBusy]=useState(false);
  const go=async e=>{e.preventDefault();const b=parseInt(amt,10);if(!b||b<0)return;setBusy(true);
    try{await updateDoc(doc(db,"rooms",room.id),{electricityBill:b,lastBillMonth:month,
      ...(room.status==="paid"?{status:"pending",amountPaid:0,balanceDue:(room.rent||0)+b}:{})});
      toast(`⚡ Bill ${inr(b)} added for Room ${room.roomNo}`);onClose();}catch(e){toast(e.message,"error");}setBusy(false);};
  return <Sheet onClose={onClose} title={`⚡ Electricity — Room ${room.roomNo}`}>
    <form onSubmit={go}>
      <div style={{background:"linear-gradient(135deg,#1E1B4B,#2A1860)",borderRadius:14,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:38,height:38,borderRadius:12,background:G.ind,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,fontSize:13}}>{ini(room.tenantName)}</div>
        <div><p style={{fontSize:14,fontWeight:800,color:"white"}}>{room.tenantName}</p><p style={{fontSize:11,color:"rgba(255,255,255,.45)"}}>Room {room.roomNo} · Rent {inr(room.rent)}</p></div>
      </div>
      <SI label="Electricity Bill (₹)" type="number" value={amt} onChange={setAmt} placeholder="850" required/>
      <SI label="Billing Month" value={month} onChange={setMonth} placeholder="June 2025"/>
      {parseInt(amt,10)>0&&<div style={{background:"#FEFCE8",border:"1px solid #FEF08A",borderRadius:12,padding:"10px 14px",marginBottom:12}}>
        <p style={{fontSize:12,color:"#92400E",fontWeight:600}}>New Total: Rent {inr(room.rent)} + ⚡ {inr(parseInt(amt,10))} = <strong>{inr((room.rent||0)+parseInt(amt,10))}</strong></p>
      </div>}
      {room.status==="paid"&&<div style={{background:"#FEF3C7",border:"1px solid #FDE68A",borderRadius:12,padding:"10px 14px",marginBottom:12}}><p style={{fontSize:12,color:"#92400E",fontWeight:600}}>⚠️ Bill add करने पर status "Pending" हो जाएगी।</p></div>}
      <SB label="⚡ Bill Save करें" loading={busy} grad={G.amber}/><div style={{height:8}}/></form>
  </Sheet>;
}

/* ── Assign Tenant Sheet ── */
function AssignSheet({room,onClose,toast}){
  const [name,setName]=useState("");const [phone,setPhone]=useState("");
  const [rent,setRent]=useState(String(room.rent||""));const [dep,setDep]=useState(String(room.securityDeposit||""));
  const [busy,setBusy]=useState(false);const [err,setErr]=useState("");
  const go=async e=>{e.preventDefault();setErr("");if(!name.trim()){setErr("Name required.");return;}
    if(phone&&phone.length!==10){setErr("Phone 10 digits होना चाहिए।");return;}setBusy(true);
    try{await updateDoc(doc(db,"rooms",room.id),{tenantName:name.trim(),tenantPhone:phone.trim()||"",
      rent:parseInt(rent,10)||0,securityDeposit:parseInt(dep,10)||0,
      status:"pending",tenantUid:"",amountPaid:0,balanceDue:parseInt(rent,10)||0,assignedAt:new Date().toISOString()});
      toast(`✓ ${name.trim()} assigned to Room ${room.roomNo}!`);onClose();}catch(e){setErr(e.message);}setBusy(false);};
  return <Sheet onClose={onClose} title={`🏠 Assign — Room ${room.roomNo}`}>
    <form onSubmit={go}>
      <SI label="Tenant Name *" value={name} onChange={setName} placeholder="Ravi Kumar" required/>
      <div style={{marginBottom:13}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>WhatsApp (optional)</label>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,fontWeight:700,color:"#FF6B35",pointerEvents:"none"}}>+91</span>
          <input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit number"
            style={{width:"100%",padding:"12px 14px 12px 48px",borderRadius:13,fontSize:14,fontWeight:500,outline:"none",fontFamily:"'Poppins',sans-serif",color:C.t1,background:"#F5F3FF",border:`1.5px solid ${C.bdr}`}}
            onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.background="#fff";}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
        </div>
      </div>
      <SI label="Monthly Rent (₹) *" type="number" value={rent} onChange={setRent} placeholder="8000" required/>
      <SI label="Security Deposit (₹)" type="number" value={dep} onChange={setDep} placeholder="16000"/>
      {err&&<div style={{background:"#FEE2E2",color:"#991B1B",borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:12}}>{err}</div>}
      <SB label="✓ Tenant Assign करें" loading={busy} grad={G.green}/>
      <div style={{background:"#F5F3FF",border:`1px solid ${C.bdr}`,borderRadius:12,padding:"10px 14px",marginTop:10}}>
        <p style={{fontSize:11,color:C.t2,lineHeight:1.5}}>💡 Later share the 🔗 Invite code if tenant wants to use the app.</p>
      </div>
      <div style={{height:8}}/></form>
  </Sheet>;
}

/* ── Invite Sheet ── */
function InviteSheet({room,onClose}){
  const [copied,setCopied]=useState(false);
  const code=room.connectionCode||"N/A";
  const copy=async()=>{try{await navigator.clipboard.writeText(code);}catch{const el=document.createElement("input");el.value=code;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el);}setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const shareWA=()=>{const msg=encodeURIComponent(`🏠 *RoomKhata Pro — Room Invitation*\n\nHello! आपको Room *${room.roomNo}* में invite किया गया है।\n\n*Connection Code: ${code}*\n\nApp open करें → "किरायेदार" चुनें → अपना number और यह code डालें → Done!`);window.open(`https://wa.me/?text=${msg}`,"_blank");};
  return <Sheet onClose={onClose} title={`🔗 Invite — Room ${room.roomNo}`}>
    <p style={{fontSize:13,color:C.t2,marginBottom:16,lineHeight:1.6}}>Tenant को यह code share करें। Login करते time code डालकर वो automatically connect हो जाएगा।</p>
    <div style={{background:"linear-gradient(135deg,#1E1B4B,#312E81)",borderRadius:18,padding:"24px 20px",textAlign:"center",marginBottom:14}}>
      <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.45)",textTransform:"uppercase",letterSpacing:".12em",marginBottom:8}}>Connection Code</p>
      <p style={{fontSize:32,fontWeight:900,color:"white",letterSpacing:".18em",fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{code}</p>
      <p style={{fontSize:11,color:"rgba(255,255,255,.35)",marginTop:8}}>Room {room.roomNo}{room.tenantName?` · ${room.tenantName}`:""}</p>
    </div>
    <div style={{display:"flex",gap:10,marginBottom:14}}>
      <button onClick={copy} style={{flex:1,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",fontWeight:800,fontSize:14,
        background:copied?"#10B981":C.indL,color:copied?"white":C.ind,transition:"all .2s"}}>
        {copied?"✓ Copied!":"📋 Copy Code"}
      </button>
      <button onClick={shareWA} style={{flex:1,padding:"13px",borderRadius:14,border:"none",cursor:"pointer",
        background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:800,fontSize:14,
        display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
        <i className="fa-brands fa-whatsapp" style={{fontSize:16}}/>Share
      </button>
    </div>
    <div style={{background:C.bg,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.bdr}`}}>
      <p style={{fontSize:12,fontWeight:700,color:C.t1,marginBottom:8}}>How to join:</p>
      {["App open करें → 'किरायेदार' चुनें",`अपना WhatsApp number डालें`,"Connection code डालें: "+code,"Done! Automatically connect होगा"].map((s,i)=>(
        <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
          <div style={{width:20,height:20,borderRadius:"50%",background:G.ind,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,fontSize:10}}>{i+1}</div>
          <p style={{fontSize:11,color:C.t2,paddingTop:2,lineHeight:1.4}}>{s}</p>
        </div>
      ))}
    </div>
    <div style={{height:8}}/></Sheet>;
}

/* ── Analytics Sheet ── */
function AnalyticsSheet({rooms,onClose}){
  const rev=rooms.reduce((s,r)=>s+(r.amountPaid||0),0);
  const pend=rooms.filter(r=>["pending","partial"].includes(r.status)&&r.tenantName?.trim()).reduce((s,r)=>s+(r.balanceDue||r.rent||0),0);
  const total=rooms.length; const occ=rooms.filter(r=>r.tenantName?.trim()).length;
  const paid=rooms.filter(r=>r.status==="paid").length;
  const exp=rooms.filter(r=>r.tenantName?.trim()).reduce((s,r)=>s+(r.rent||0),0);
  const pct=exp>0?Math.round(rev/exp*100):0;
  return <Sheet onClose={onClose} title="📊 Analytics">
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
      {[{l:"Revenue",v:inr(rev),c:"#F59E0B",bg:"#FEF3C7"},{l:"Dues",v:inr(pend),c:"#EF4444",bg:"#FEE2E2"},
        {l:"Occupied",v:`${occ}/${total}`,c:C.ind,bg:C.indL},{l:"Paid",v:`${paid}/${occ||1}`,c:"#10B981",bg:"#DCFCE7"}].map(s=>(
        <div key={s.l} style={{background:s.bg,borderRadius:14,padding:"13px 14px"}}>
          <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".06em",marginBottom:5}}>{s.l}</p>
          <p style={{fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:s.c}}>{s.v}</p>
        </div>
      ))}
    </div>
    <div style={{background:C.bg,borderRadius:16,padding:"14px",border:`1px solid ${C.bdr}`,marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
        <p style={{fontSize:13,fontWeight:700,color:C.t1}}>Collection Rate</p>
        <p style={{fontSize:14,fontWeight:900,color:C.ind,fontFamily:"'JetBrains Mono',monospace"}}>{pct}%</p>
      </div>
      <div style={{height:8,borderRadius:99,background:C.bdr,overflow:"hidden"}}>
        <div style={{height:"100%",borderRadius:99,background:G.ind,width:`${pct}%`,transition:"width .8s"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
        <p style={{fontSize:11,color:C.t3}}>Collected: {inr(rev)}</p>
        <p style={{fontSize:11,color:C.t3}}>Expected: {inr(exp)}</p>
      </div>
    </div>
    <div style={{height:8}}/></Sheet>;
}

/* ── Expenses Sheet ── */
function ExpensesSheet({ownerId,onClose,toast}){
  const [list,setList]=useState([]);const [loading,setLoading]=useState(true);
  const [adding,setAdding]=useState(false);const [desc,setDesc]=useState("");
  const [amt,setAmt]=useState("");const [cat,setCat]=useState("maintenance");const [busy,setBusy]=useState(false);
  const CATS=[{k:"maintenance",l:"🔧"},{k:"electricity",l:"⚡"},{k:"water",l:"💧"},{k:"cleaning",l:"🧹"},{k:"other",l:"📦"}];
  useEffect(()=>{if(!ownerId)return;
    getDocs(query(collection(db,"expenses"),where("ownerId","==",ownerId))).then(s=>{
      const l=s.docs.map(d=>({id:d.id,...d.data()}));l.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));setList(l);
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[ownerId]);
  const add=async e=>{e.preventDefault();if(!desc.trim()||!amt)return;setBusy(true);
    try{const n={ownerId,description:desc.trim(),amount:parseInt(amt,10)||0,category:cat,createdAt:new Date().toISOString()};
      const r=await addDoc(collection(db,"expenses"),n);setList(p=>[{id:r.id,...n},...p]);
      setDesc("");setAmt("");setAdding(false);toast("✓ Expense added!");}catch(e){toast(e.message,"error");}setBusy(false);};
  const total=list.reduce((s,e)=>s+(e.amount||0),0);
  return <Sheet onClose={onClose} title="🧾 Expenses">
    <div style={{background:"linear-gradient(135deg,#1E1B4B,#312E81)",borderRadius:14,padding:"14px 16px",marginBottom:14,textAlign:"center"}}>
      <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.45)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:4}}>Total Expenses</p>
      <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:26,fontWeight:900,color:"white"}}>{inr(total)}</p>
    </div>
    {!adding&&<button onClick={()=>setAdding(true)} style={{width:"100%",padding:"12px",borderRadius:13,border:`1.5px dashed ${C.bdr}`,background:"none",cursor:"pointer",color:C.ind,fontWeight:700,fontSize:14,marginBottom:14}}>
      <i className="fa-solid fa-plus" style={{marginRight:8}}/>Add Expense
    </button>}
    {adding&&<form onSubmit={add} style={{background:C.bg,borderRadius:14,padding:"14px",marginBottom:14,border:`1px solid ${C.bdr}`}}>
      <SI label="Description" value={desc} onChange={setDesc} placeholder="e.g. Plumber repair" required/>
      <SI label="Amount (₹)" type="number" value={amt} onChange={setAmt} placeholder="500" required/>
      <div style={{marginBottom:12}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>Category</label>
        <div style={{display:"flex",gap:6}}>
          {CATS.map(c=><button key={c.k} type="button" onClick={()=>setCat(c.k)} style={{flex:1,padding:"8px 4px",borderRadius:10,border:"none",cursor:"pointer",fontSize:16,background:cat===c.k?G.ind:"white",transition:"all .2s"}}>{c.l}</button>)}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}><SB loading={busy} label="Save" grad={G.ind}/>
        <button type="button" onClick={()=>setAdding(false)} style={{flex:1,padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:C.bg,color:C.t2,fontWeight:700,fontSize:15}}>Cancel</button>
      </div></form>}
    {loading?<p style={{textAlign:"center",color:C.t3,fontSize:13}}>Loading…</p>
      :list.length===0?<p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"20px 0"}}>No expenses yet.</p>
      :list.map(e=>(
        <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}>
          <div style={{width:34,height:34,borderRadius:10,background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:16}}>
            {({maintenance:"🔧",electricity:"⚡",water:"💧",cleaning:"🧹",other:"📦"})[e.category]||"📦"}
          </div>
          <div style={{flex:1}}>
            <p style={{fontWeight:700,fontSize:13,color:C.t1}}>{e.description}</p>
            <p style={{fontSize:11,color:C.t3}}>{new Date(e.createdAt).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</p>
          </div>
          <p style={{fontWeight:900,fontSize:13,color:"#EF4444",fontFamily:"'JetBrains Mono',monospace"}}>-{inr(e.amount)}</p>
        </div>
      ))}
    <div style={{height:8}}/></Sheet>;
}

/* ── WhatsApp Remind Sheet ── */
function RemindSheet({rooms,onClose}){
  const pending=rooms.filter(r=>r.status!=="paid"&&r.tenantPhone?.trim()&&r.tenantName?.trim());
  const send=r=>{const msg=encodeURIComponent(`🏠 *RoomKhata Pro — Rent Reminder*\n\nनमस्ते ${r.tenantName}! 🙏\n\nRoom *${r.roomNo}* का किराया pending है।\nDue: *${inr((r.rent||0)+(r.electricityBill||0))}*\n\nकृपया जल्दी pay करें। धन्यवाद!`);window.open(`https://wa.me/91${r.tenantPhone}?text=${msg}`,"_blank");};
  const sendAll=()=>pending.forEach(r=>send(r));
  return <Sheet onClose={onClose} title="📲 WhatsApp Remind">
    {pending.length===0
      ?<div style={{textAlign:"center",padding:"32px 0"}}><p style={{fontSize:40,marginBottom:8}}>🎉</p><p style={{fontWeight:800,fontSize:16,color:C.t1}}>All paid!</p></div>
      :<>
        <button onClick={sendAll} style={{width:"100%",padding:"13px",borderRadius:13,border:"none",cursor:"pointer",
          background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:900,fontSize:15,
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:14,
          boxShadow:"0 4px 14px rgba(34,197,94,.3)"}}>
          <i className="fa-brands fa-whatsapp" style={{fontSize:18}}/>Send to All ({pending.length})
        </button>
        {pending.map(r=>(
          <div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}>
            <div style={{width:38,height:38,borderRadius:12,background:C.indL,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.ind,fontWeight:900,fontSize:14}}>{ini(r.tenantName)}</div>
            <div style={{flex:1}}><p style={{fontWeight:700,fontSize:13,color:C.t1}}>{r.tenantName}</p><p style={{fontSize:11,color:C.t3}}>Room {r.roomNo} · +91 {r.tenantPhone}</p></div>
            <button onClick={()=>send(r)} style={{padding:"6px 12px",borderRadius:10,border:"none",cursor:"pointer",
              background:"linear-gradient(135deg,#22C55E,#16A34A)",color:"white",fontWeight:700,fontSize:11,
              display:"flex",alignItems:"center",gap:4}}><i className="fa-brands fa-whatsapp"/>Send</button>
          </div>
        ))}
      </>}
    <div style={{height:8}}/></Sheet>;
}

/* ── Tenants Sheet ── */
function TenantsSheet({rooms,onClose,onEdit}){
  const [q,setQ]=useState("");
  const list=rooms.filter(r=>r.tenantName?.trim()).filter(r=>!q||r.tenantName?.toLowerCase().includes(q.toLowerCase())||r.roomNo?.toString().includes(q));
  const SC2={paid:"#10B981",pending:"#EF4444",partial:"#F59E0B",pending_verification:"#818CF8"};
  return <Sheet onClose={onClose} title={`👥 Tenants (${rooms.filter(r=>r.tenantName?.trim()).length})`}>
    <div style={{position:"relative",marginBottom:14}}>
      <i className="fa-solid fa-magnifying-glass" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:12,color:C.t3,pointerEvents:"none"}}/>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…"
        style={{width:"100%",padding:"10px 12px 10px 36px",borderRadius:12,border:`1.5px solid ${C.bdr}`,background:C.bg,fontSize:14,fontWeight:500,color:C.t1,outline:"none",fontFamily:"'Poppins',sans-serif"}}
        onFocus={e=>e.target.style.borderColor=C.ind} onBlur={e=>e.target.style.borderColor=C.bdr}/>
    </div>
    {list.length===0?<p style={{textAlign:"center",color:C.t3,fontSize:13,padding:"24px 0"}}>No tenants found.</p>
      :list.map(r=>(
        <div key={r.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:`1px solid ${C.bdr}`}}>
          {r.tenantPhoto?<img src={r.tenantPhoto} alt="" style={{width:44,height:44,borderRadius:14,objectFit:"cover",flexShrink:0}}/>
            :<div style={{width:44,height:44,borderRadius:14,background:C.indL,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.ind,fontWeight:900,fontSize:15}}>{ini(r.tenantName)}</div>}
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontWeight:700,fontSize:14,color:C.t1}}>{r.tenantName}</p>
            <p style={{fontSize:11,color:C.t3}}>Room {r.roomNo} · {inr(r.rent)}/mo</p>
            {r.tenantPhone&&<p style={{fontSize:11,color:C.t3}}>+91 {r.tenantPhone}</p>}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
            <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:8,
              background:(SC2[r.status]||"#EF4444")+"22",color:SC2[r.status]||"#EF4444"}}>
              {r.status==="paid"?"✓ Paid":r.status==="pending"?"⏳ Due":r.status==="pending_verification"?"👀 Verify":"◑ Partial"}
            </span>
            <button onClick={()=>{onEdit(r);onClose();}} style={{fontSize:11,fontWeight:700,color:C.ind,background:"none",border:"none",cursor:"pointer",padding:0}}>Edit →</button>
          </div>
        </div>
      ))}
    <div style={{height:8}}/></Sheet>;
}

/* ── Payments Sheet ── */
function PaymentsSheet({rooms,onClose}){
  const paid=rooms.filter(r=>r.status==="paid"&&r.tenantName?.trim());
  const pend=rooms.filter(r=>r.status==="pending"&&r.tenantName?.trim());
  const verify=rooms.filter(r=>r.status==="pending_verification"&&r.tenantName?.trim());
  const partial=rooms.filter(r=>r.status==="partial"&&r.tenantName?.trim());
  const Row=({r,col,badge})=>(
    <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.bdr}`}}>
      <div style={{width:36,height:36,borderRadius:11,background:C.indL,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.ind,fontWeight:900,fontSize:13}}>{ini(r.tenantName)}</div>
      <div style={{flex:1,minWidth:0}}><p style={{fontWeight:700,fontSize:13,color:C.t1}}>{r.tenantName}</p><p style={{fontSize:11,color:C.t3}}>Room {r.roomNo}</p></div>
      <div style={{textAlign:"right"}}>
        <p style={{fontWeight:900,fontSize:13,color:col,fontFamily:"'JetBrains Mono',monospace"}}>{inr(r.amountPaid||r.rent||0)}</p>
        <span style={{fontSize:10,fontWeight:700,color:col,background:col+"22",padding:"2px 6px",borderRadius:6}}>{badge}</span>
      </div>
    </div>
  );
  return <Sheet onClose={onClose} title="💰 Payments">
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
      <div style={{background:"#F0FDF4",borderRadius:13,padding:"12px",border:"1.5px solid #86EFAC"}}>
        <p style={{fontSize:10,fontWeight:700,color:"#14532D",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Collected</p>
        <p style={{fontSize:20,fontWeight:900,color:"#16A34A",fontFamily:"'JetBrains Mono',monospace"}}>{inr(paid.reduce((s,r)=>s+(r.amountPaid||r.rent||0),0))}</p>
        <p style={{fontSize:11,color:"#16A34A",marginTop:2}}>{paid.length} tenants</p>
      </div>
      <div style={{background:"#FEF2F2",borderRadius:13,padding:"12px",border:"1.5px solid #FECACA"}}>
        <p style={{fontSize:10,fontWeight:700,color:"#7F1D1D",textTransform:"uppercase",letterSpacing:".06em",marginBottom:3}}>Pending</p>
        <p style={{fontSize:20,fontWeight:900,color:"#EF4444",fontFamily:"'JetBrains Mono',monospace"}}>{inr(pend.reduce((s,r)=>s+(r.rent||0),0))}</p>
        <p style={{fontSize:11,color:"#EF4444",marginTop:2}}>{pend.length} tenants</p>
      </div>
    </div>
    {verify.length>0&&<><p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>👀 Awaiting Verification</p>{verify.map(r=><Row key={r.id} r={r} col="#818CF8" badge="Verify"/>)}<div style={{marginBottom:12}}/></>}
    {paid.length>0&&<><p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>✓ Paid</p>{paid.map(r=><Row key={r.id} r={r} col="#16A34A" badge="Paid"/>)}<div style={{marginBottom:12}}/></>}
    {partial.length>0&&<><p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>◑ Partial</p>{partial.map(r=><Row key={r.id} r={r} col="#F59E0B" badge="Partial"/>)}<div style={{marginBottom:12}}/></>}
    {pend.length>0&&<><p style={{fontSize:12,fontWeight:800,color:C.t1,marginBottom:8}}>⏳ Pending</p>{pend.map(r=><Row key={r.id} r={r} col="#EF4444" badge="Due"/>)}</>}
    <div style={{height:8}}/></Sheet>;
}

/* ── Room Detail Sheet ── */
function RoomDetailSheet({room,buildings,onClose,onEdit,onToggle,onAddBill,onAssign,onInvite,onDelete,toast}){
  const vacant=!room.tenantName?.trim();
  const total=(room.rent||0)+(room.electricityBill||0);
  const cfg=SC[vacant?"vacant":(room.status||"pending")]||SC.pending;
  const bName=buildings[room.buildingId]?.name||"";
  const [showTenant,setShowTenant]=useState(false);
  return <>
    <Sheet onClose={onClose} title="">
      <div style={{background:"linear-gradient(135deg,#1A1A2E,#312E81)",padding:"16px 18px 20px",margin:"-14px -18px 0",borderRadius:"22px 22px 0 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:50,height:50,borderRadius:16,background:"rgba(255,255,255,.12)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <i className="fa-solid fa-door-open" style={{fontSize:20,color:"white"}}/>
          </div>
          <div style={{flex:1}}>
            <p style={{fontSize:11,color:"rgba(255,255,255,.45)",marginBottom:2}}>{bName}</p>
            <p style={{fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"white"}}>Room {room.roomNo}</p>
          </div>
          <span style={{fontSize:10,fontWeight:700,padding:"4px 10px",borderRadius:20,background:cfg.bdg[0]+"33",color:"white",border:"1px solid rgba(255,255,255,.2)"}}>{cfg.lbl}</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          {[{l:"Rent",v:inr(room.rent||0),c:"#FCD34D"},{l:"Elec",v:inr(room.electricityBill||0),c:"#FDE68A"},{l:"Total",v:inr(total),c:"#86EFAC"}].map(s=>(
            <div key={s.l} style={{flex:1,background:"rgba(255,255,255,.08)",borderRadius:10,padding:"8px",textAlign:"center",border:"1px solid rgba(255,255,255,.1)"}}>
              <p style={{fontSize:9,color:"rgba(255,255,255,.45)",textTransform:"uppercase",marginBottom:3}}>{s.l}</p>
              <p style={{fontSize:13,fontWeight:900,color:s.c,fontFamily:"'JetBrains Mono',monospace"}}>{s.v}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{paddingTop:16}}>
        <p style={{fontSize:10,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",marginBottom:10}}>Tenant</p>
        {vacant?(
          <div style={{background:C.bg,borderRadius:14,padding:"16px",textAlign:"center",border:`1.5px dashed ${C.bdr}`,marginBottom:14}}>
            <i className="fa-solid fa-user-slash" style={{fontSize:22,color:C.t3,marginBottom:8,display:"block"}}/>
            <p style={{fontWeight:700,color:C.t2,marginBottom:10}}>Room Vacant है</p>
            <button onClick={()=>{onClose();onAssign(room);}} style={{padding:"8px 20px",borderRadius:11,border:"none",cursor:"pointer",background:G.ind,color:"white",fontWeight:700,fontSize:13}}>+ Assign Tenant</button>
          </div>
        ):(
          <div onClick={()=>setShowTenant(true)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:C.bg,borderRadius:14,border:`1.5px solid ${C.bdr}`,cursor:"pointer",marginBottom:4}}
            onPointerDown={e=>e.currentTarget.style.background=C.indL} onPointerUp={e=>e.currentTarget.style.background=C.bg}>
            {room.tenantPhoto?<img src={room.tenantPhoto} alt="" style={{width:46,height:46,borderRadius:14,objectFit:"cover",flexShrink:0}}/>
              :<div style={{width:46,height:46,borderRadius:14,background:C.indL,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:C.ind,fontWeight:900,fontSize:15}}>{ini(room.tenantName)}</div>}
            <div style={{flex:1,minWidth:0}}>
              <p style={{fontWeight:800,fontSize:15,color:C.t1}}>{room.tenantName}</p>
              <p style={{fontSize:12,color:C.t3}}>{room.tenantOccupation||""}{room.tenantPhone?` · +91 ${room.tenantPhone}`:""}</p>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:8,background:cfg.bdg[0],color:cfg.bdg[1]}}>{cfg.lbl}</span>
              <span style={{fontSize:11,color:C.ind,fontWeight:600}}>View →</span>
            </div>
          </div>
        )}
        <p style={{fontSize:10,fontWeight:700,color:C.t3,textTransform:"uppercase",letterSpacing:".08em",margin:"14px 0 10px"}}>Actions</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          {!vacant&&<><button onClick={()=>{onClose();onToggle(room.id,room.status);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:cfg.btn,color:"white",fontWeight:700,fontSize:13}}>₹ {cfg.btnL}</button>
            <button onClick={()=>{onClose();onAddBill(room);}} style={{padding:"11px",borderRadius:12,cursor:"pointer",fontWeight:700,fontSize:13,background:"#FEFCE8",color:"#B45309",border:"1px solid #FEF08A"}}>⚡ Add Bill</button>
            <button onClick={()=>{onClose();onEdit(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:C.bg,color:C.ind,fontWeight:700,fontSize:13}}>✏️ Edit</button>
            <button onClick={()=>{onClose();onInvite(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:G.ind,color:"white",fontWeight:700,fontSize:13}}>🔗 Invite</button></>}
          {vacant&&<><button onClick={()=>{onClose();onAssign(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:G.ind,color:"white",fontWeight:700,fontSize:13}}>+ Assign</button>
            <button onClick={()=>{onClose();onInvite(room);}} style={{padding:"11px",borderRadius:12,border:"none",cursor:"pointer",background:C.indL,color:C.ind,fontWeight:700,fontSize:13}}>🔗 Invite</button></>}
        </div>
        <button onClick={()=>{onClose();onDelete("room",room.id,`Room ${room.roomNo}`);}} style={{width:"100%",padding:"11px",borderRadius:12,border:"1.5px solid #FECACA",cursor:"pointer",background:"#FEF2F2",color:"#EF4444",fontWeight:700,fontSize:13}}>🗑️ Delete Room</button>
        <div style={{height:16}}/>
      </div>
    </Sheet>
    <AnimatePresence>
      {showTenant&&<TenantDetailSheet key="td" room={room} onClose={()=>setShowTenant(false)} toast={toast}/>}
    </AnimatePresence>
  </>;
}

/* ── Tenant Detail Sheet ── */
function TenantDetailSheet({room,onClose,toast}){
  const [photo,setPhoto]=useState(room.tenantPhoto||"");
  const [name,setName]=useState(room.tenantName||"");
  const [phone,setPhone]=useState(room.tenantPhone||"");
  const [occ,setOcc]=useState(room.tenantOccupation||"");
  const [addr,setAddr]=useState(room.tenantAddress||"");
  const [aadhar,setAadhar]=useState(room.tenantAadhaar||"");
  const [dob,setDob]=useState(room.tenantDob||"");
  const [emName,setEmName]=useState(room.emergencyName||"");
  const [emPhone,setEmPhone]=useState(room.emergencyPhone||"");
  const [tab,setTab]=useState("details");
  const [busy,setBusy]=useState(false);
  const save=async e=>{e.preventDefault();setBusy(true);
    try{await updateDoc(doc(db,"rooms",room.id),{tenantPhoto:photo,tenantName:name.trim(),tenantPhone:phone.trim(),tenantOccupation:occ.trim(),tenantAddress:addr.trim(),tenantAadhaar:aadhar.trim(),tenantDob:dob,emergencyName:emName.trim(),emergencyPhone:emPhone.trim()});
      toast("✓ Profile saved!");onClose();}catch(e){toast(e.message,"error");}setBusy(false);};
  const T=(k,l)=><button type="button" onClick={()=>setTab(k)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:tab===k?G.ind:"#F5F3FF",color:tab===k?"white":C.t2,transition:"all .2s"}}>{l}</button>;
  return <Sheet onClose={onClose} title="">
    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
      <div onClick={()=>pickPhoto(setPhoto)} style={{width:68,height:68,borderRadius:22,cursor:"pointer",overflow:"hidden",background:room.tenantPhoto?"transparent":C.indL,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${C.indB}`,position:"relative",flexShrink:0}}>
        {photo?<img src={photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<span style={{color:C.ind,fontWeight:900,fontSize:22}}>{ini(name||"?")}</span>}
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center"}}><i className="fa-solid fa-camera" style={{color:"white",fontSize:16}}/></div>
      </div>
      <div>
        <p style={{fontWeight:900,fontSize:17,color:C.t1,lineHeight:1.1}}>{name||"Tenant"}</p>
        <p style={{fontSize:12,color:C.t3,marginTop:3}}>Room {room.roomNo}{occ?` · ${occ}`:""}</p>
        <button type="button" onClick={()=>pickPhoto(setPhoto)} style={{fontSize:11,fontWeight:700,color:C.ind,background:"none",border:"none",cursor:"pointer",padding:0,marginTop:3}}><i className="fa-solid fa-camera" style={{marginRight:4}}/>Change Photo</button>
      </div>
    </div>
    <div style={{display:"flex",gap:6,marginBottom:16}}><T k="details" l="👤 Details"/><T k="docs" l="📄 Docs"/><T k="emergency" l="🆘 SOS"/></div>
    <form onSubmit={save}>
      {tab==="details"&&<>
        <SI label="Full Name *" value={name} onChange={setName} placeholder="Ravi Kumar" required/>
        <div style={{marginBottom:13}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>WhatsApp</label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,fontWeight:700,color:"#FF6B35",pointerEvents:"none"}}>+91</span>
            <input type="tel" value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit"
              style={{width:"100%",padding:"12px 14px 12px 48px",borderRadius:13,fontSize:14,fontWeight:500,outline:"none",fontFamily:"'Poppins',sans-serif",color:C.t1,background:"#F5F3FF",border:`1.5px solid ${C.bdr}`}}
              onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.background="#fff";}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
          </div>
        </div>
        <SI label="Occupation" value={occ} onChange={setOcc} placeholder="Engineer, Student…"/>
        <SI label="Date of Birth" type="date" value={dob} onChange={setDob}/>
        <div style={{marginBottom:13}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Permanent Address</label>
          <textarea rows={3} value={addr} onChange={e=>setAddr(e.target.value)} placeholder="Permanent home address…"
            style={{width:"100%",padding:"12px 14px",borderRadius:13,fontSize:14,fontWeight:500,outline:"none",fontFamily:"'Poppins',sans-serif",color:C.t1,background:"#F5F3FF",border:`1.5px solid ${C.bdr}`,resize:"none"}}
            onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.background="#fff";}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
        </div>
      </>}
      {tab==="docs"&&<>
        <div style={{background:"#FFF7ED",border:"1.5px solid #FED7AA",borderRadius:12,padding:"10px 14px",marginBottom:14}}><p style={{fontSize:12,color:"#92400E",fontWeight:600}}>📸 Tap below to upload Aadhaar photos.</p></div>
        <SI label="Aadhaar Number" value={aadhar} onChange={v=>setAadhar(v.replace(/\D/g,"").slice(0,12))} placeholder="12-digit Aadhaar"/>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",letterSpacing:".07em",marginBottom:8}}>Aadhaar Photos</label>
          <div style={{display:"flex",gap:10}}>
            {["aadhaarFront","aadhaarBack"].map(k=>{
              const src=k==="aadhaarFront"?room.aadhaarFront:room.aadhaarBack;
              return <div key={k} onClick={()=>pickPhoto(b64=>{updateDoc(doc(db,"rooms",room.id),{[k]:b64}).catch(()=>{});})}
                style={{flex:1,aspectRatio:"1.6",borderRadius:12,cursor:"pointer",border:`2px dashed ${C.bdr}`,overflow:"hidden",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:5}}>
                {src?<img src={src} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                  :<><i className="fa-solid fa-id-card" style={{fontSize:20,color:C.t3}}/><span style={{fontSize:10,fontWeight:600,color:C.t3}}>{k==="aadhaarFront"?"Front":"Back"}</span></>}
              </div>;
            })}
          </div>
        </div>
      </>}
      {tab==="emergency"&&<>
        <div style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:12,padding:"10px 14px",marginBottom:14}}><p style={{fontSize:12,color:"#991B1B",fontWeight:600}}>🆘 Emergency में इस person से contact करें।</p></div>
        <SI label="Emergency Contact Name" value={emName} onChange={setEmName} placeholder="Father / Mother name"/>
        <div style={{marginBottom:13}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>Emergency Phone</label>
          <div style={{position:"relative"}}>
            <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,fontWeight:700,color:"#FF6B35",pointerEvents:"none"}}>+91</span>
            <input type="tel" value={emPhone} onChange={e=>setEmPhone(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="10-digit"
              style={{width:"100%",padding:"12px 14px 12px 48px",borderRadius:13,fontSize:14,fontWeight:500,outline:"none",fontFamily:"'Poppins',sans-serif",color:C.t1,background:"#F5F3FF",border:`1.5px solid ${C.bdr}`}}
              onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.background="#fff";}} onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background="#F5F3FF";}}/>
          </div>
        </div>
      </>}
      <SB label="💾 Save Profile" loading={busy} grad={G.teal}/>
      <div style={{height:8}}/></form>
  </Sheet>;
}

/* ── Delete Confirm Sheet ── */
function DeleteSheet({target,onClose,onConfirm}){
  const [busy,setBusy]=useState(false);
  const isB=target?.type==="building";
  return <Sheet onClose={onClose} title="">
    <div style={{textAlign:"center",padding:"8px 0 0"}}>
      <p style={{fontSize:52,marginBottom:12}}>{isB?"🏚️":"🚪"}</p>
      <p style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:22,color:C.t1,marginBottom:8}}>{isB?"Building Delete करें?":"Room Delete करें?"}</p>
      <p style={{fontSize:14,color:C.t2,marginBottom:8,lineHeight:1.6}}><strong style={{color:"#EF4444"}}>{target?.name}</strong> को permanently delete करना चाहते हैं?</p>
      {isB&&<div style={{background:"#FEF3C7",border:"1.5px solid #FDE68A",borderRadius:12,padding:"10px 14px",marginBottom:16,textAlign:"left"}}><p style={{fontSize:12,color:"#92400E",fontWeight:600}}>⚠️ सभी rooms भी delete हो जाएंगे।</p></div>}
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button onClick={onClose} style={{flex:1,padding:"14px",borderRadius:14,border:`1.5px solid ${C.bdr}`,cursor:"pointer",background:C.bg,color:C.t2,fontWeight:700,fontSize:15}}>Cancel</button>
        <button disabled={busy} onClick={async()=>{setBusy(true);onClose();await onConfirm();}}
          style={{flex:1,padding:"14px",borderRadius:14,border:"none",cursor:"pointer",background:G.red,color:"white",fontWeight:900,fontSize:15,opacity:busy?.6:1}}>
          {busy?"Deleting…":"हाँ, Delete करो"}
        </button>
      </div>
      <div style={{height:8}}/></div>
  </Sheet>;
}

/* ── You Sheet ── */
function YouSheet({ownerName,authUser,onClose,onAction}){
  const {language,setLanguage}=useApp();
  const Row=({icon,bg,col,label,sub,right,onClick,red})=>(
    <button onClick={onClick} style={{width:"100%",display:"flex",alignItems:"center",gap:12,padding:"13px 0",background:"none",border:"none",cursor:"pointer",borderBottom:`1px solid ${C.bdr}`,textAlign:"left"}}>
      <div style={{width:40,height:40,borderRadius:13,background:bg||C.indL,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <i className={icon} style={{fontSize:16,color:col||C.ind}}/>
      </div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontWeight:700,fontSize:14,color:red?"#EF4444":C.t1}}>{label}</p>
        {sub&&<p style={{fontSize:11,color:C.t2,marginTop:1}}>{sub}</p>}
      </div>
      {right||<i className="fa-solid fa-chevron-right" style={{fontSize:12,color:C.bdr,flexShrink:0}}/>}
    </button>
  );
  return <Sheet onClose={onClose} title="">
    <div style={{display:"flex",alignItems:"center",gap:14,padding:14,borderRadius:16,background:C.bg,marginBottom:8,border:`1px solid ${C.bdr}`}}>
      <div style={{width:52,height:52,borderRadius:16,background:C.ind,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontWeight:900,fontSize:18,fontFamily:"'Nunito',sans-serif"}}>{ini(ownerName||"O")}</div>
      <div style={{flex:1,minWidth:0}}>
        <p style={{fontWeight:800,fontSize:16,color:C.t1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ownerName||"Owner"}</p>
        <p style={{fontSize:12,color:C.t2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser?.email}</p>
      </div>
      <button onClick={()=>{onClose();onAction("profile");}} style={{padding:"6px 12px",borderRadius:10,border:"none",cursor:"pointer",background:C.indL,color:C.ind,fontWeight:700,fontSize:12}}>Edit</button>
    </div>
    <Row icon="fa-solid fa-chart-line"        bg="#EEF2FF" col={C.ind}    label="Analytics"    sub="Revenue & occupancy trends"  onClick={()=>{onClose();onAction("analytics");}}/>
    <Row icon="fa-solid fa-user-pen"          bg="#FEF3C7" col="#B45309"  label="Edit Profile" sub="Name, address, UPI ID"        onClick={()=>{onClose();onAction("profile");}}/>
    <Row icon="fa-solid fa-cloud-arrow-down"  bg="#DCFCE7" col="#15803D"  label="Backup Data"  sub="Download JSON snapshot"       onClick={()=>{onClose();onAction("backup");}}/>
    <Row icon="fa-solid fa-language" bg="#F3E8FF" col="#7C3AED" label="Language" sub={language==="hi"?"हिंदी चालू":"English on"}
      onClick={()=>setLanguage(language==="hi"?"en":"hi")}
      right={<div style={{width:46,height:26,borderRadius:99,flexShrink:0,position:"relative",cursor:"pointer",background:language==="hi"?G.ind:"#E4E4E7",transition:"background .25s"}} onClick={e=>{e.stopPropagation();setLanguage(language==="hi"?"en":"hi");}}>
        <div style={{position:"absolute",top:3,width:20,height:20,borderRadius:"50%",background:"white",boxShadow:"0 1px 4px rgba(0,0,0,.2)",transition:"left .25s",left:language==="hi"?"calc(100% - 23px)":3}}/>
      </div>}/>
    <Row icon="fa-solid fa-right-from-bracket" bg="#FEE2E2" col="#DC2626" label="Logout" sub="Sign out" onClick={()=>onAction("logout")} red/>
    <div style={{height:8}}/></Sheet>;
}

/* ══ ROOT ══ */
export default function OwnerDashboardView(){
  const {authUser,setUserRole}=useApp();
  const nav=useNavigate();
  const [rooms,setRooms]=useState([]);
  const [buildings,setBuildings]=useState({});
  const [ownerName,setOwnerName]=useState("");
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState("all");
  const [search,setSearch]=useState("");
  const [tab,setTab]=useState("home");
  const [toasts,setToasts]=useState([]);
  const [addBldg,setAddBldg]=useState(false);
  const [addRoomBid,setAddRoomBid]=useState(null);
  const [editRoom,setEditRoom]=useState(null);
  const [viewRoom,setViewRoom]=useState(null);
  const [inviteRoom,setInviteRoom]=useState(null);
  const [addBillRoom,setAddBillRoom]=useState(null);
  const [assignRoom,setAssignRoom]=useState(null);
  const [delTarget,setDelTarget]=useState(null);
  const [showAnalytics,setShowAnalytics]=useState(false);
  const [showExpenses,setShowExpenses]=useState(false);
  const [showRemind,setShowRemind]=useState(false);
  const [showTenants,setShowTenants]=useState(false);
  const [showPayments,setShowPayments]=useState(false);
  const [youOpen,setYouOpen]=useState(false);

  const toast=useCallback((msg,type="success")=>{
    const id=Date.now();setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);
  },[]);
  const dismiss=useCallback(id=>setToasts(p=>p.filter(t=>t.id!==id)),[]);

  useEffect(()=>{if(!authUser)return;
    getDocs(query(collection(db,"ownerProfiles"),where("uid","==",authUser.uid)))
      .then(s=>{if(!s.empty)setOwnerName(s.docs[0].data().name||"");}).catch(()=>{});
  },[authUser]);

  useEffect(()=>{if(!authUser)return;setLoading(true);
    const u=onSnapshot(query(collection(db,"rooms"),where("ownerId","==",authUser.uid)),
      s=>{setRooms(s.docs.map(d=>({id:d.id,...d.data()})));setLoading(false);},
      ()=>setLoading(false));
    return u;
  },[authUser]);

  useEffect(()=>{if(!authUser)return;
    const u=onSnapshot(query(collection(db,"buildings"),where("ownerId","==",authUser.uid)),
      s=>{const m={};s.docs.forEach(d=>{m[d.id]={id:d.id,...d.data()};});setBuildings(m);},()=>{});
    return u;
  },[authUser]);

  const handleToggle=useCallback(async(roomId,status)=>{
    const r=rooms.find(x=>x.id===roomId);if(!r)return;
    try{if(status==="paid"){await updateDoc(doc(db,"rooms",roomId),{status:"pending",amountPaid:0,balanceDue:r.rent||0,paidDate:null});toast("⏳ Marked pending");}
      else{const tot=(r.rent||0)+(r.electricityBill||0);await updateDoc(doc(db,"rooms",roomId),{status:"paid",amountPaid:tot,balanceDue:0,paidDate:new Date().toISOString()});toast("✓ Payment received!");}}
    catch(e){toast(e.message,"error");}
  },[rooms,toast]);

  const handleDelete=useCallback((type,id,name)=>setDelTarget({type,id,name}),[]);

  const confirmDelete=useCallback(async()=>{
    if(!delTarget)return;
    try{if(delTarget.type==="room"){await deleteDoc(doc(db,"rooms",delTarget.id));toast("🗑️ Room deleted");}
      else{const s=await getDocs(query(collection(db,"rooms"),where("buildingId","==",delTarget.id)));
        await Promise.all(s.docs.map(d=>deleteDoc(doc(db,"rooms",d.id))));
        await deleteDoc(doc(db,"buildings",delTarget.id));toast("🗑️ Building deleted");}}
    catch(e){toast(e.message,"error");}
  },[delTarget,toast]);

  const handleTab=useCallback(k=>{setTab(k);
    if(k==="you")setYouOpen(true);
    if(k==="tenants")setShowTenants(true);
    if(k==="payments")setShowPayments(true);
  },[]);

  const handleYou=useCallback(async action=>{
    if(action==="logout"){const uid=authUser?.uid;await signOut(auth);if(uid)localStorage.removeItem(`rkp_role_${uid}`);setUserRole(null);nav("/login",{replace:true});}
    else if(action==="profile")nav("/settings");
    else if(action==="analytics")setShowAnalytics(true);
    else if(action==="backup"){const b=new Blob([JSON.stringify({rooms,date:new Date().toISOString()},null,2)],{type:"application/json"});const a=Object.assign(document.createElement("a"),{href:URL.createObjectURL(b),download:"khata-backup.json"});document.body.appendChild(a);a.click();document.body.removeChild(a);toast("☁️ Backup downloaded!");}
  },[rooms,nav,setUserRole,authUser]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rooms.filter(r=>{
      const mf=filter==="all"?true:filter==="paid"?r.status==="paid":["pending","partial"].includes(r.status);
      const ms=!q||r.roomNo?.toString().toLowerCase().includes(q)||r.tenantName?.toLowerCase().includes(q);
      return mf&&ms;
    });
  },[rooms,filter,search]);

  const grouped=useMemo(()=>{
    const g={};filtered.forEach(r=>{const bid=r.buildingId||"no-building";(g[bid]=g[bid]||[]).push(r);});
    return Object.entries(g);
  },[filtered]);

  const hasFilter=filter!=="all"||search.trim()!=="";

  return <>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:C.bg}}>
      <Header ownerName={ownerName} rooms={rooms} loading={loading}/>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",background:C.bg,WebkitOverflowScrolling:"touch"}}>
        <div style={{padding:"16px 14px 24px"}}>
          <QuickTiles onAnalytics={()=>setShowAnalytics(true)} onExpenses={()=>setShowExpenses(true)} onRemind={()=>setShowRemind(true)}/>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <p style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:17,color:C.t1}}>Buildings</p>
            <button onClick={()=>setAddBldg(true)} style={{height:34,padding:"0 14px",borderRadius:10,border:"none",cursor:"pointer",background:G.ind,color:"white",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
              <i className="fa-solid fa-plus" style={{fontSize:10}}/>Add Building
            </button>
          </div>
          <div style={{position:"relative",marginBottom:12}}>
            <i className="fa-solid fa-magnifying-glass" style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:13,color:C.t3,pointerEvents:"none"}}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search room or tenant…"
              style={{width:"100%",padding:"11px 40px",borderRadius:14,border:`1.5px solid ${C.bdr}`,background:C.card,fontSize:14,fontWeight:500,color:C.t1,outline:"none",fontFamily:"'Poppins',sans-serif",boxSizing:"border-box"}}
              onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.boxShadow=`0 0 0 3px ${C.indB}44`;}}
              onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.boxShadow="none";}}/>
            {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:C.t3,fontSize:16}}><i className="fa-solid fa-xmark"/></button>}
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
            {[{k:"all",l:"All"},{k:"pending",l:"⏳ Pending"},{k:"paid",l:"✓ Paid"}].map(c=>{
              const on=filter===c.k;
              return <button key={c.k} onClick={()=>setFilter(c.k)} style={{padding:"7px 16px",borderRadius:20,border:"none",cursor:"pointer",whiteSpace:"nowrap",fontWeight:600,fontSize:12,flexShrink:0,background:on?G.ind:C.card,color:on?"white":C.t2,boxShadow:on?`0 2px 8px ${C.ind}44`:`0 1px 3px rgba(0,0,0,.05)`,transition:"all .2s"}}>{c.l}</button>;
            })}
          </div>
          {loading&&<div style={{display:"flex",gap:10,overflowX:"auto"}}>
            {[...Array(3)].map((_,i)=>(
              <div key={i} style={{minWidth:148,background:C.card,borderRadius:18,padding:10,border:`1.5px solid ${C.bdr}`,flexShrink:0}}>
                <div className="sk" style={{width:"100%",height:72,borderRadius:12,marginBottom:8}}/>
                <div className="sk" style={{height:14,width:"60%",marginBottom:6}}/>
                <div className="sk" style={{height:11,width:"80%",marginBottom:8}}/>
                <div className="sk" style={{height:30,width:"100%"}}/>
              </div>
            ))}
          </div>}
          {!loading&&grouped.length===0&&<div style={{textAlign:"center",padding:"52px 0"}}>
            <div style={{width:70,height:70,borderRadius:24,background:C.indL,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"}}>
              <i className={hasFilter?"fa-solid fa-filter":"fa-regular fa-building"} style={{fontSize:28,color:C.ind}}/>
            </div>
            <p style={{fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:18,color:C.t1,marginBottom:6}}>{hasFilter?"No matching rooms":"No buildings yet"}</p>
            <p style={{fontSize:13,color:C.t2,marginBottom:20}}>{hasFilter?"Try different filter or search":"Add your first building"}</p>
            {!hasFilter&&<button onClick={()=>setAddBldg(true)} style={{padding:"12px 28px",borderRadius:14,border:"none",cursor:"pointer",background:G.ind,color:"white",fontWeight:700,fontSize:14}}>
              <i className="fa-solid fa-plus" style={{marginRight:8}}/>Add Building
            </button>}
          </div>}
          {!loading&&grouped.map(([bid,bRooms])=>(
            <BuildingGroup key={bid} bid={bid}
              name={bid==="no-building"?"Uncategorized":buildings[bid]?.name||"Building"}
              rooms={bRooms} onToggle={handleToggle} onEdit={r=>setEditRoom(r)}
              onAddRoom={id=>setAddRoomBid(id)} onInvite={r=>setInviteRoom(r)}
              onDelete={handleDelete} onAddBill={r=>setAddBillRoom(r)}
              onAssign={r=>setAssignRoom(r)} onView={r=>setViewRoom(r)}/>
          ))}
        </div>
      </div>
      <BottomNav active={tab} onTab={handleTab}/>
    </div>
    <Toasts list={toasts} dismiss={dismiss}/>
    <AnimatePresence>
      {delTarget&&<DeleteSheet key="del" target={delTarget} onClose={()=>setDelTarget(null)} onConfirm={confirmDelete}/>}
      {addBldg&&<AddBldgSheet key="ab" ownerId={authUser?.uid} onClose={()=>setAddBldg(false)} toast={toast}/>}
      {addRoomBid&&<AddRoomSheet key="ar" buildingId={addRoomBid} ownerId={authUser?.uid} onClose={()=>setAddRoomBid(null)} toast={toast}/>}
      {editRoom&&<EditRoomSheet key="er" room={editRoom} onClose={()=>setEditRoom(null)} toast={toast}/>}
      {addBillRoom&&<AddBillSheet key="bill" room={addBillRoom} onClose={()=>setAddBillRoom(null)} toast={toast}/>}
      {assignRoom&&<AssignSheet key="assign" room={assignRoom} onClose={()=>setAssignRoom(null)} toast={toast}/>}
      {inviteRoom&&<InviteSheet key="invite" room={inviteRoom} onClose={()=>setInviteRoom(null)}/>}
      {viewRoom&&<RoomDetailSheet key="view" room={viewRoom} buildings={buildings} onClose={()=>setViewRoom(null)}
        onEdit={r=>{setViewRoom(null);setEditRoom(r);}} onToggle={(id,s)=>{setViewRoom(null);handleToggle(id,s);}}
        onAddBill={r=>{setViewRoom(null);setAddBillRoom(r);}} onAssign={r=>{setViewRoom(null);setAssignRoom(r);}}
        onInvite={r=>{setViewRoom(null);setInviteRoom(r);}} onDelete={(t,id,n)=>{setViewRoom(null);handleDelete(t,id,n);}} toast={toast}/>}
      {showAnalytics&&<AnalyticsSheet key="an" rooms={rooms} onClose={()=>setShowAnalytics(false)}/>}
      {showExpenses&&<ExpensesSheet key="ex" ownerId={authUser?.uid} onClose={()=>setShowExpenses(false)} toast={toast}/>}
      {showRemind&&<RemindSheet key="rm" rooms={rooms} onClose={()=>setShowRemind(false)}/>}
      {showTenants&&<TenantsSheet key="tn" rooms={rooms} onClose={()=>{setShowTenants(false);setTab("home");}} onEdit={r=>setEditRoom(r)}/>}
      {showPayments&&<PaymentsSheet key="py" rooms={rooms} onClose={()=>{setShowPayments(false);setTab("home");}}/>}
      {youOpen&&<YouSheet key="you" ownerName={ownerName} authUser={authUser}
        onClose={()=>{setYouOpen(false);setTab("home");}} onAction={handleYou}/>}
    </AnimatePresence>
  </>;
}
