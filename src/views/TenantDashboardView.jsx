// src/views/TenantDashboardView.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  doc, onSnapshot, collection, addDoc,
  getDocs, query, where, updateDoc, getDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase/config";
import { useApp } from "../context/AppContext";

/* ── helpers ── */
const inr = n => "₹" + Number(n||0).toLocaleString("en-IN", {maximumFractionDigits:0});
const ease = [0.22,1,0.36,1];

/* ── Design tokens ── */
const C = {
  ind: "#6366F1", ind2: "#4F46E5", indL: "#EEF2FF",
  teal: "#0F9D8B", green: "#10B981",
  amber: "#F59E0B", red: "#EF4444",
  dark: "#1A1A2E", dark2: "#18181B",
  bg: "#F7F7FB", card: "#FFFFFF",
  bdr: "#F1F0F7", bdr2: "#E5E7EB",
  t1: "#18181B", t2: "#71717A", t3: "#A1A1AA",
};

/* ── Sheet ── */
function Sheet({ onClose, children }) {
  return (
    <motion.div
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      transition={{duration:.2}}
      style={{position:"fixed",inset:0,zIndex:200,display:"flex",
        flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.55)"}}
        onClick={onClose}/>
      <motion.div
        initial={{y:"100%"}} animate={{y:0}} exit={{y:"100%"}}
        transition={{duration:.36,ease}}
        style={{position:"relative",zIndex:1,background:C.card,
          borderRadius:"24px 24px 0 0",maxHeight:"88dvh",overflowY:"auto",
          paddingBottom:"max(24px,env(safe-area-inset-bottom))"}}>
        <div style={{width:36,height:4,borderRadius:9,background:"#E5E7EB",
          margin:"12px auto 0"}}/>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ── Payment Sheet ── */
function PaymentSheet({ room, ownerUpiId, ownerName, onClose, onDone }) {
  const due = room.status==="partial" && room.balanceDue > 0
    ? room.balanceDue
    : (room.rent||0)+(room.electricityBill||0);
  const upi = ownerUpiId?.trim() || "";
  const [step,    setStep]    = useState("choose"); // choose | confirm | done
  const [appUsed, setAppUsed] = useState("");
  const [utr,     setUtr]     = useState("");
  const [saving,  setSaving]  = useState(false);
  const [copied,  setCopied]  = useState(false);

  const copyUpi = async () => {
    try { await navigator.clipboard.writeText(upi); }
    catch { const el=document.createElement("input");el.value=upi;document.body.appendChild(el);el.select();document.execCommand("copy");document.body.removeChild(el); }
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  const openPay = (app) => {
    setAppUsed(app);
    const base = {
      gpay:    `tez://upi/pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${due}&cu=INR&tn=Rent`,
      phonepe: `phonepe://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${due}&cu=INR`,
      paytm:   `paytmmp://upi/pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${due}&cu=INR`,
      any:     `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${due}&cu=INR`,
    };
    window.location.href = base[app] || base.any;
    setTimeout(()=>setStep("confirm"), 1200);
  };

  const confirmPaid = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db,"paymentHistory"),{
        roomId: room.id, ownerId: room.ownerId,
        tenantName: room.tenantName||"", tenantPhone: room.tenantPhone||"",
        amount: due, rent: room.rent||0, electricity: room.electricityBill||0,
        paymentApp: appUsed||"upi", txnNote: utr.trim(),
        month: new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"}),
        status: "pending_verification", paidAt: now, createdAt: now,
      });
      await updateDoc(doc(db,"rooms",room.id),{
        status:"pending_verification", amountPaid:due,
        balanceDue:0, paymentApp:appUsed, lastPaidAt:now,
      });
      setStep("done");
      setTimeout(()=>{ onDone(); onClose(); }, 2000);
    } catch(e){ console.error(e); }
    setSaving(false);
  };

  /* Step: Choose payment method */
  if (step==="choose") return (
    <Sheet onClose={onClose}>
      <div style={{padding:"16px 18px 0"}}>
        <p style={{fontSize:11,fontWeight:700,color:C.t3,textTransform:"uppercase",
          letterSpacing:".08em",marginBottom:4}}>Pay Rent</p>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:36,fontWeight:900,
          color:C.dark2,letterSpacing:"-.02em",marginBottom:2}}>{inr(due)}</p>
        <p style={{fontSize:13,color:C.t2,marginBottom:16}}>
          Room {room.roomNo}
          {room.electricityBill>0&&<span style={{color:C.amber}}> · incl. ⚡ {inr(room.electricityBill)}</span>}
        </p>

        {/* UPI ID box */}
        {upi ? (
          <div style={{background:C.bg,borderRadius:14,padding:"12px 14px",marginBottom:20,
            border:`1.5px solid ${C.bdr}`,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
            <div style={{minWidth:0}}>
              <p style={{fontSize:10,fontWeight:700,color:C.t3,textTransform:"uppercase",
                letterSpacing:".06em",marginBottom:2}}>Owner UPI ID</p>
              <p style={{fontSize:14,fontWeight:700,color:C.dark2,
                fontFamily:"'JetBrains Mono',monospace",overflow:"hidden",
                textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{upi}</p>
            </div>
            <button onClick={copyUpi}
              style={{padding:"7px 14px",borderRadius:10,border:"none",cursor:"pointer",
                fontWeight:700,fontSize:12,flexShrink:0,transition:"all .2s",
                background:copied?"#10B981":C.ind,color:"white"}}>
              {copied?"✓":"Copy"}
            </button>
          </div>
        ):(
          <div style={{background:"#FEF3C7",borderRadius:14,padding:"12px 14px",
            marginBottom:20,border:"1.5px solid #FDE68A"}}>
            <p style={{fontSize:12,color:"#92400E",fontWeight:600}}>
              ⚠️ मकान मालिक ने UPI ID नहीं जोड़ी। Scan करके manually pay करें।
            </p>
          </div>
        )}

        {/* App buttons */}
        <p style={{fontSize:12,fontWeight:700,color:C.t2,marginBottom:10}}>Choose app to pay</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[
            {k:"gpay",   name:"Google Pay",  emoji:"🔵",grad:"linear-gradient(135deg,#1A73E8,#0D47A1)"},
            {k:"phonepe",name:"PhonePe",     emoji:"🟣",grad:"linear-gradient(135deg,#5f259f,#430080)"},
            {k:"paytm",  name:"Paytm",       emoji:"🔷",grad:"linear-gradient(135deg,#00BAF2,#0085C0)"},
            {k:"any",    name:"Any UPI App", emoji:"📱",grad:"linear-gradient(135deg,#6366F1,#4F46E5)"},
          ].map(a=>(
            <button key={a.k} onClick={()=>openPay(a.k)}
              style={{padding:"14px 10px",borderRadius:14,border:`1.5px solid ${C.bdr}`,
                cursor:"pointer",background:C.card,display:"flex",alignItems:"center",gap:10,
                transition:"all .15s"}}
              onPointerDown={e=>{e.currentTarget.style.background=C.indL;e.currentTarget.style.borderColor=C.ind;}}
              onPointerUp={e=>{e.currentTarget.style.background=C.card;e.currentTarget.style.borderColor=C.bdr;}}>
              <div style={{width:34,height:34,borderRadius:10,background:a.grad,flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>
                {a.emoji}
              </div>
              <span style={{fontWeight:700,fontSize:13,color:C.dark2}}>{a.name}</span>
            </button>
          ))}
        </div>

        {/* Already paid */}
        <button onClick={()=>setStep("confirm")}
          style={{width:"100%",padding:"13px",borderRadius:14,border:`1.5px solid ${C.bdr}`,
            cursor:"pointer",background:C.bg,color:C.t2,fontWeight:600,fontSize:13,marginBottom:8}}>
          Already paid? Confirm here →
        </button>
        <div style={{height:4}}/>
      </div>
    </Sheet>
  );

  /* Step: Confirm */
  if (step==="confirm") return (
    <Sheet onClose={onClose}>
      <div style={{padding:"16px 18px 0"}}>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,
          color:C.dark2,marginBottom:4}}>Confirm Payment</p>
        <p style={{fontSize:13,color:C.t2,marginBottom:20}}>
          {appUsed?`${appUsed.toUpperCase()} से payment की?"`:""} नीचे UTR डालकर confirm करें।
        </p>

        {/* Amount chip */}
        <div style={{background:"linear-gradient(135deg,#6366F1,#4F46E5)",borderRadius:16,
          padding:"16px 20px",marginBottom:20,textAlign:"center"}}>
          <p style={{fontSize:11,color:"rgba(255,255,255,.6)",fontWeight:700,
            textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Amount Paid</p>
          <p style={{fontFamily:"'Nunito',sans-serif",fontSize:34,fontWeight:900,
            color:"white",letterSpacing:"-.02em"}}>{inr(due)}</p>
          <p style={{fontSize:12,color:"rgba(255,255,255,.5)",marginTop:4}}>
            Room {room.roomNo}{appUsed?` · ${appUsed.toUpperCase()}`:""}
          </p>
        </div>

        {/* UTR field */}
        <div style={{marginBottom:16}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:C.ind,
            textTransform:"uppercase",letterSpacing:".07em",marginBottom:6}}>
            UTR / Transaction ID (optional)
          </label>
          <input value={utr} onChange={e=>setUtr(e.target.value)}
            placeholder="e.g. 407123456789"
            style={{width:"100%",padding:"13px 14px",borderRadius:13,
              border:`1.5px solid ${C.bdr}`,background:C.bg,fontSize:14,
              fontFamily:"'JetBrains Mono',monospace",color:C.dark2,outline:"none"}}
            onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.background="#fff";}}
            onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background=C.bg;}}/>
          <p style={{fontSize:11,color:C.t3,marginTop:4}}>Owner को verify करने में आसानी होगी।</p>
        </div>

        <button onClick={confirmPaid} disabled={saving}
          style={{width:"100%",padding:"15px",borderRadius:16,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#10B981,#059669)",color:"white",
            fontWeight:800,fontSize:16,fontFamily:"'Poppins',sans-serif",
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            boxShadow:"0 4px 16px rgba(16,185,129,.3)",opacity:saving?.5:1}}>
          {saving
            ?<><svg style={{width:20,height:20,animation:"spin 1s linear infinite"}} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/></svg>Saving…</>
            :<>✓ हाँ, मैंने pay कर दिया</>}
        </button>
        <button onClick={()=>setStep("choose")}
          style={{width:"100%",padding:"12px",borderRadius:14,border:"none",
            cursor:"pointer",background:"none",color:C.t3,fontWeight:600,fontSize:13,marginTop:8}}>
          ← वापस जाएं
        </button>
        <div style={{height:8}}/>
      </div>
    </Sheet>
  );

  /* Step: Done */
  if (step==="done") return (
    <Sheet onClose={onClose}>
      <div style={{padding:"40px 24px",textAlign:"center"}}>
        <motion.div initial={{scale:0}} animate={{scale:1}}
          transition={{type:"spring",stiffness:300,damping:20}}
          style={{fontSize:64,marginBottom:16}}>🎉</motion.div>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:26,fontWeight:900,
          color:C.dark2,marginBottom:6}}>शुक्रिया! 🙏</p>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:32,fontWeight:900,
          color:C.green,marginBottom:10}}>{inr(due)}</p>
        <p style={{fontSize:14,color:C.t2,lineHeight:1.6}}>
          Payment record हो गई। मकान मालिक verify करेंगे और status update होगा।
        </p>
        <div style={{marginTop:16,background:C.indL,borderRadius:14,padding:"12px 16px"}}>
          <p style={{fontSize:12,color:C.ind,fontWeight:600}}>
            ✓ Owner को notify कर दिया गया है
          </p>
        </div>
      </div>
    </Sheet>
  );

  return null;
}

/* ── Complaint Sheet ── */
const CTYPES = [
  {k:"water",       l:"💧 Water"},
  {k:"electricity", l:"⚡ Electricity"},
  {k:"maintenance", l:"🔧 Maintenance"},
  {k:"noise",       l:"🔊 Noise"},
  {k:"other",       l:"📝 Other"},
];

function ComplaintSheet({ roomId, ownerId, onClose, onSent }) {
  const [type,setPtype]  = useState("maintenance");
  const [prio,setPrio]   = useState("medium");
  const [desc,setDesc]   = useState("");
  const [loading,setLoading] = useState(false);

  const submit = async () => {
    if (!desc.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db,"complaints"),{
        roomId, ownerId, type, priority:prio,
        description:desc.trim(), status:"open",
        createdAt:new Date().toISOString(),
      });
      onSent(); onClose();
    } catch {}
    setLoading(false);
  };

  return (
    <Sheet onClose={onClose}>
      <div style={{padding:"16px 18px 0"}}>
        <p style={{fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,
          color:C.dark2,marginBottom:4}}>Raise Complaint</p>
        <p style={{fontSize:13,color:C.t2,marginBottom:18}}>Problem report करें — मकान मालिक को notify होगा।</p>

        {/* Type */}
        <p style={{fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",
          letterSpacing:".07em",marginBottom:8}}>Issue Type</p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
          {CTYPES.map(c=>(
            <button key={c.k} onClick={()=>setPtype(c.k)}
              style={{padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",
                fontSize:12,fontWeight:700,transition:"all .2s",
                background:type===c.k?"linear-gradient(135deg,#6366F1,#4F46E5)":"#F5F3FF",
                color:type===c.k?"white":C.t2}}>
              {c.l}
            </button>
          ))}
        </div>

        {/* Priority */}
        <p style={{fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",
          letterSpacing:".07em",marginBottom:8}}>Priority</p>
        <div style={{display:"flex",gap:8,marginBottom:18}}>
          {[{k:"low",l:"Low",c:"#10B981"},{k:"medium",l:"Medium",c:"#F59E0B"},{k:"high",l:"High",c:"#EF4444"}].map(p=>(
            <button key={p.k} onClick={()=>setPrio(p.k)}
              style={{flex:1,padding:"10px",borderRadius:12,border:"none",cursor:"pointer",
                fontWeight:700,fontSize:13,transition:"all .2s",
                background:prio===p.k?p.c:"#F5F3FF",
                color:prio===p.k?"white":C.t2}}>
              {p.l}
            </button>
          ))}
        </div>

        {/* Description */}
        <p style={{fontSize:11,fontWeight:700,color:C.ind,textTransform:"uppercase",
          letterSpacing:".07em",marginBottom:8}}>Description</p>
        <textarea rows={3} value={desc} onChange={e=>setDesc(e.target.value)}
          placeholder="Problem briefly बताएं…"
          style={{width:"100%",padding:"12px 14px",borderRadius:13,resize:"none",
            border:`1.5px solid ${C.bdr}`,background:C.bg,fontSize:14,
            fontFamily:"'Poppins',sans-serif",color:C.dark2,outline:"none",marginBottom:16}}
          onFocus={e=>{e.target.style.borderColor=C.ind;e.target.style.background="#fff";}}
          onBlur={e=>{e.target.style.borderColor=C.bdr;e.target.style.background=C.bg;}}/>

        <button onClick={submit} disabled={loading||!desc.trim()}
          style={{width:"100%",padding:"14px",borderRadius:16,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#EF4444,#DC2626)",color:"white",
            fontWeight:800,fontSize:15,fontFamily:"'Poppins',sans-serif",
            opacity:loading||!desc.trim()?.5:1,
            boxShadow:"0 4px 14px rgba(239,68,68,.3)"}}>
          {loading?"Submitting…":"Submit Complaint"}
        </button>
        <div style={{height:16}}/>
      </div>
    </Sheet>
  );
}

/* ── Payment history row ── */
function HistRow({ item }) {
  const paid = item.status==="paid"||item.status==="pending_verification";
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",
      borderBottom:`1px solid ${C.bdr}`}}>
      <div style={{width:38,height:38,borderRadius:12,flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"center",
        background:paid?"#DCFCE7":"#FEF3C7"}}>
        <i className={paid?"fa-solid fa-check":"fa-solid fa-clock"}
          style={{fontSize:15,color:paid?"#16A34A":"#B45309"}}/>
      </div>
      <div style={{flex:1}}>
        <p style={{fontSize:13,fontWeight:700,color:C.t1}}>
          {item.month||new Date(item.paidAt||item.createdAt||0).toLocaleDateString("en-IN",{month:"short",year:"numeric"})}
        </p>
        <p style={{fontSize:11,color:C.t3,marginTop:1}}>
          {item.paymentApp?item.paymentApp.toUpperCase()+" · ":""}
          {item.txnNote||"UPI Payment"}
        </p>
      </div>
      <div style={{textAlign:"right"}}>
        <p style={{fontWeight:800,fontSize:14,color:paid?"#16A34A":"#B45309",
          fontFamily:"'JetBrains Mono',monospace"}}>{inr(item.amount||item.rent)}</p>
        <p style={{fontSize:10,fontWeight:700,marginTop:2,
          color:paid?"#16A34A":"#B45309"}}>
          {item.status==="pending_verification"?"Verifying":paid?"Paid":"Pending"}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   ROOT
═══════════════════════════════════════ */
export default function TenantDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  const [room,          setRoom]          = useState(null);
  const [buildingName,  setBuildingName]  = useState("");
  const [ownerUpiId,    setOwnerUpiId]    = useState("");
  const [ownerName,     setOwnerName]     = useState("");
  const [history,       setHistory]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showPayment,   setShowPayment]   = useState(false);
  const [showComplaint, setShowComplaint] = useState(false);
  const [toastMsg,      setToastMsg]      = useState("");
  const unsubRef = useRef(null);

  const toast = useCallback(msg => {
    setToastMsg(msg);
    setTimeout(()=>setToastMsg(""), 3000);
  }, []);

  /* Load room */
  useEffect(() => {
    if (!authUser) return;
    let unsubRoom = null;

    const init = async () => {
      try {
        // Get roomId from tenantProfiles
        const tDoc = await getDoc(doc(db,"tenantProfiles",authUser.uid));
        let roomId = tDoc.exists() ? tDoc.data().roomId : null;

        if (!roomId) {
          const snap = await getDocs(query(collection(db,"rooms"),where("tenantUid","==",authUser.uid)));
          if (!snap.empty) roomId = snap.docs[0].id;
        }
        if (!roomId) { setLoading(false); return; }

        // Subscribe to room
        unsubRoom = onSnapshot(doc(db,"rooms",roomId), async rSnap => {
          if (!rSnap.exists()) { setLoading(false); return; }
          const data = { id:rSnap.id, ...rSnap.data() };
          setRoom(data);
          setLoading(false);

          // Building name
          if (data.buildingId) {
            try {
              const b = await getDoc(doc(db,"buildings",data.buildingId));
              if (b.exists()) setBuildingName(b.data().name||"");
            } catch {}
          }

          // Owner profile
          if (data.ownerId) {
            try {
              const o = await getDocs(query(collection(db,"ownerProfiles"),where("uid","==",data.ownerId)));
              if (!o.empty) {
                setOwnerUpiId(o.docs[0].data().upiId||"");
                setOwnerName(o.docs[0].data().name||"");
              }
            } catch {}
          }
        }, () => setLoading(false));
        unsubRef.current = unsubRoom;

        // Payment history
        try {
          const h = await getDocs(query(collection(db,"paymentHistory"),where("roomId","==",roomId)));
          const list = h.docs.map(d=>({id:d.id,...d.data()}));
          list.sort((a,b)=>new Date(b.paidAt||b.createdAt||0)-new Date(a.paidAt||a.createdAt||0));
          setHistory(list);
        } catch {}
      } catch { setLoading(false); }
    };

    init();
    return () => unsubRoom?.();
  }, [authUser]);

  const handleLogout = async () => {
    const uid = authUser?.uid;
    await signOut(auth);
    if (uid) localStorage.removeItem(`rkp_role_${uid}`);
    setUserRole(null);
    navigate("/login");
  };

  const onPaymentDone = useCallback(async () => {
    toast("✓ Payment recorded! Owner will verify soon.");
    if (!room) return;
    try {
      const h = await getDocs(query(collection(db,"paymentHistory"),where("roomId","==",room.id)));
      const list = h.docs.map(d=>({id:d.id,...d.data()}));
      list.sort((a,b)=>new Date(b.paidAt||b.createdAt||0)-new Date(a.paidAt||a.createdAt||0));
      setHistory(list);
    } catch {}
  }, [room, toast]);

  /* ── Loading ── */
  if (loading) return (
    <div style={{height:"100%",background:C.dark,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:52,height:52,borderRadius:18,background:C.ind,
          display:"flex",alignItems:"center",justifyContent:"center",
          margin:"0 auto 12px",boxShadow:"0 8px 24px rgba(99,102,241,.5)"}}>
          <span style={{fontSize:22,color:"white",fontWeight:900}}>₹</span>
        </div>
        <p style={{color:"rgba(255,255,255,.45)",fontSize:13}}>Loading…</p>
      </div>
    </div>
  );

  /* ── No room ── */
  if (!room) return (
    <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center",
      background:C.bg,padding:24,textAlign:"center"}}>
      <div>
        <p style={{fontSize:52,marginBottom:12}}>🏠</p>
        <p style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,fontSize:20,color:C.t1,marginBottom:6}}>Room नहीं मिला</p>
        <p style={{fontSize:13,color:C.t2,marginBottom:20}}>मकान मालिक से Connection Code लें और login करें।</p>
        <button onClick={handleLogout} style={{padding:"10px 24px",borderRadius:12,border:"none",
          cursor:"pointer",background:C.ind,color:"white",fontWeight:700,fontSize:14}}>
          Sign Out
        </button>
      </div>
    </div>
  );

  const { roomNo,tenantName,rent=0,electricityBill=0,
          balanceDue,status="pending",securityDeposit=0,createdAt } = room;
  const amountDue  = balanceDue>0 ? balanceDue : rent+(electricityBill||0);
  const isPaid     = status==="paid";
  const isVerifying= status==="pending_verification";

  const moveIn = createdAt
    ? (createdAt.toDate?createdAt.toDate():new Date(createdAt))
        .toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})
    : "—";

  /* Status colors */
  const statusMap = {
    paid:                 {label:"✓ Paid",    bg:"#DCFCE7",color:"#15803D"},
    pending:              {label:"⏳ Due",     bg:"#FEF3C7",color:"#B45309"},
    partial:              {label:"◑ Partial", bg:"#DBEAFE",color:"#1D4ED8"},
    pending_verification: {label:"👀 Verifying",bg:"#EEF2FF",color:"#4338CA"},
  };
  const st = statusMap[status] || statusMap.pending;

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:C.bg}}>

        {/* ── Header ── */}
        <div style={{background:C.dark,flexShrink:0,paddingTop:"max(44px,env(safe-area-inset-top))",
          position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",width:160,height:160,borderRadius:"50%",
            background:"rgba(99,102,241,.18)",top:-50,right:-40,pointerEvents:"none"}}/>
          <div style={{position:"relative",zIndex:1,padding:"12px 16px 20px"}}>
            {/* Top row */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:9,background:C.ind,
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10L12 3l9 7"/><path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                  </svg>
                </div>
                <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.7)"}}>RoomKhata Pro</span>
              </div>
              <button onClick={handleLogout}
                style={{width:36,height:36,borderRadius:11,background:"rgba(255,255,255,.1)",
                  border:"1px solid rgba(255,255,255,.15)",display:"flex",alignItems:"center",
                  justifyContent:"center",cursor:"pointer"}}>
                <i className="fa-solid fa-sign-out" style={{fontSize:14,color:"rgba(255,255,255,.7)"}}/>
              </button>
            </div>

            {/* Welcome */}
            <p style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:500,marginBottom:2}}>
              Welcome back,
            </p>
            <p style={{fontFamily:"'Nunito',sans-serif",fontSize:24,fontWeight:900,
              color:"white",lineHeight:1,marginBottom:16}}>
              {tenantName||"Tenant"}
            </p>

            {/* Main due card */}
            <div style={{background:"rgba(255,255,255,.07)",borderRadius:20,padding:"16px 18px",
              border:"1px solid rgba(255,255,255,.1)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.45)",
                  textTransform:"uppercase",letterSpacing:".08em"}}>
                  {isPaid?"This Month":"Amount Due"}
                </p>
                <span style={{fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:20,
                  background:st.bg,color:st.color}}>
                  {st.label}
                </span>
              </div>
              <p style={{fontFamily:"'Nunito',sans-serif",fontSize:40,fontWeight:900,lineHeight:1,
                marginBottom:10,color:isPaid?"#86EFAC":isVerifying?"#C7D2FE":"white"}}>
                {inr(amountDue)}
              </p>
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                <div>
                  <p style={{fontSize:9,color:"rgba(255,255,255,.35)",fontWeight:600,
                    textTransform:"uppercase",marginBottom:2}}>Base Rent</p>
                  <p style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.7)",
                    fontFamily:"'JetBrains Mono',monospace"}}>{inr(rent)}</p>
                </div>
                {electricityBill>0&&<div>
                  <p style={{fontSize:9,color:"rgba(255,255,255,.35)",fontWeight:600,
                    textTransform:"uppercase",marginBottom:2}}>Electricity</p>
                  <p style={{fontSize:13,fontWeight:700,color:"#FCD34D",
                    fontFamily:"'JetBrains Mono',monospace"}}>{inr(electricityBill)}</p>
                </div>}
              </div>
              {isVerifying&&(
                <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,
                  background:"rgba(99,102,241,.2)",border:"1px solid rgba(129,140,248,.3)"}}>
                  <p style={{fontSize:12,color:"#C7D2FE",fontWeight:600}}>
                    👀 Payment verified होने का wait करें
                  </p>
                </div>
              )}
              {status==="partial"&&room.balanceDue>0&&(
                <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,
                  background:"rgba(245,158,11,.2)",border:"1px solid rgba(252,211,77,.3)"}}>
                  <p style={{fontSize:12,color:"#FCD34D",fontWeight:600}}>
                    ◑ Partial payment received. Balance due: {inr(room.balanceDue)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Scroll body ── */}
        <div style={{flex:1,overflowY:"auto",background:C.bg,
          padding:"16px 14px 28px",WebkitOverflowScrolling:"touch"}}>

          {/* Action buttons */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            <button
              onClick={()=>!isPaid&&!isVerifying&&setShowPayment(true)}
              style={{padding:"16px 12px",borderRadius:18,border:"none",
                cursor:isPaid||isVerifying?"default":"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",
                background:isPaid
                  ?"linear-gradient(135deg,#10B981,#059669)"
                  :isVerifying
                  ?"linear-gradient(135deg,#7C3AED,#6D28D9)"
                  :`linear-gradient(135deg,${C.ind},${C.ind2})`,
                boxShadow:isPaid
                  ?"0 4px 16px rgba(16,185,129,.3)"
                  :isVerifying
                  ?"0 4px 16px rgba(124,58,237,.3)"
                  :`0 4px 16px rgba(99,102,241,.35)`}}>
              <i className={isPaid?"fa-solid fa-circle-check":isVerifying?"fa-solid fa-clock":"fa-solid fa-wallet"}
                style={{fontSize:26,color:"white",marginBottom:7}}/>
              <span style={{fontSize:14,fontWeight:800,color:"white"}}>
                {isPaid?"Paid ✓":isVerifying?"Verifying…":"Pay Rent"}
              </span>
              <span style={{fontSize:11,color:"rgba(255,255,255,.65)",marginTop:3}}>
                {isPaid?"This month done":isVerifying?"Pending owner confirm":inr(amountDue)+" due"}
              </span>
            </button>

            <button onClick={()=>setShowComplaint(true)}
              style={{padding:"16px 12px",borderRadius:18,border:"none",cursor:"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",
                background:"linear-gradient(135deg,#EF4444,#DC2626)",
                boxShadow:"0 4px 16px rgba(239,68,68,.3)"}}>
              <i className="fa-solid fa-triangle-exclamation"
                style={{fontSize:26,color:"white",marginBottom:7}}/>
              <span style={{fontSize:14,fontWeight:800,color:"white"}}>Complaint</span>
              <span style={{fontSize:11,color:"rgba(255,255,255,.65)",marginTop:3}}>Report issue</span>
            </button>
          </div>

          {/* Room info card */}
          <div style={{background:C.card,borderRadius:18,border:`1.5px solid ${C.bdr}`,
            overflow:"hidden",marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.bdr}`,
              display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:12,background:C.indL,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <i className="fa-solid fa-door-open" style={{fontSize:16,color:C.ind}}/>
              </div>
              <div>
                <p style={{fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:800,color:C.t1}}>
                  Room {roomNo}
                </p>
                <p style={{fontSize:12,color:C.t3}}>{buildingName||"Your Building"}</p>
              </div>
            </div>
            {[
              {l:"Move-in Date",      v:moveIn},
              {l:"Security Deposit",  v:inr(securityDeposit),  mono:true, col:"#16A34A"},
              {l:"Monthly Rent",      v:inr(rent),              mono:true},
              {l:"Owner",             v:ownerName||"—"},
            ].map(row=>(
              <div key={row.l} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"11px 16px",borderBottom:`1px solid ${C.bdr}`}}>
                <span style={{fontSize:13,color:C.t2}}>{row.l}</span>
                <span style={{fontSize:13,fontWeight:700,color:row.col||C.t1,
                  fontFamily:row.mono?"'JetBrains Mono',monospace":"inherit"}}>
                  {row.v}
                </span>
              </div>
            ))}
          </div>

          {/* Payment history */}
          <div style={{background:C.card,borderRadius:18,border:`1.5px solid ${C.bdr}`,
            overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,.04)"}}>
            <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.bdr}`,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <i className="fa-solid fa-clock-rotate-left" style={{fontSize:15,color:C.ind}}/>
                <p style={{fontFamily:"'Nunito',sans-serif",fontSize:16,fontWeight:800,color:C.t1}}>
                  Payment History
                </p>
              </div>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                background:C.indL,color:C.ind}}>{history.length} records</span>
            </div>
            <div style={{padding:"0 16px"}}>
              {history.length===0
                ?(
                  <div style={{textAlign:"center",padding:"28px 0",color:C.t3}}>
                    <i className="fa-solid fa-receipt" style={{fontSize:28,marginBottom:8,display:"block"}}/>
                    <p style={{fontSize:13}}>No payments yet</p>
                  </div>
                )
                :history.slice(0,8).map(h=><HistRow key={h.id} item={h}/>)
              }
            </div>
          </div>

        </div>
      </div>

      {/* Sheets */}
      <AnimatePresence>
        {showPayment&&(
          <PaymentSheet key="pay"
            room={room} ownerUpiId={ownerUpiId} ownerName={ownerName}
            onClose={()=>setShowPayment(false)} onDone={onPaymentDone}/>
        )}
        {showComplaint&&(
          <ComplaintSheet key="cmp"
            roomId={room.id} ownerId={room.ownerId}
            onClose={()=>setShowComplaint(false)}
            onSent={()=>toast("✓ Complaint submitted!")}/>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMsg&&(
          <motion.div key="toast"
            initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            style={{position:"fixed",bottom:24,left:16,right:16,zIndex:300,
              display:"flex",justifyContent:"center",pointerEvents:"none"}}>
            <div style={{padding:"12px 20px",borderRadius:14,fontSize:14,fontWeight:700,
              color:"white",background:"linear-gradient(135deg,#10B981,#059669)",
              boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
              {toastMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
