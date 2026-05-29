// src/views/TenantDashboardView.jsx
// ─────────────────────────────────────────────────────────────
//  Payment flow:
//   1. Tenant taps "Pay Rent"
//   2. Sees amount + owner UPI ID + payment method selector
//   3. Taps GPay / PhonePe / Paytm / UPI → real deep-link opens
//   4. Returns to app, taps "I've Paid ✓"
//   5. App records payment to Firestore paymentHistory collection
//      + sets room.status = "pending_verification"
//   6. Owner sees "👀 Verify" on their dashboard and confirms
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  doc, onSnapshot, collection, addDoc,
  getDocs, query, where, updateDoc, getDoc,
} from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "../firebase/config";
import { useApp } from "../context/AppContext";

/* ─── helpers ────────────────────────────────────────────── */
const fmt  = n => "₹" + Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:0});
const ease = [0.22,1,0.36,1];

/* ─── motion variants ────────────────────────────────────── */
const vFade  = { hidden:{opacity:0}, visible:{opacity:1,transition:{duration:.25}}, exit:{opacity:0,transition:{duration:.2}} };
const vSheet = { hidden:{y:"100%"}, visible:{y:0,transition:{duration:.4,ease}}, exit:{y:"100%",transition:{duration:.28,ease:[.4,0,1,1]}} };
const vUp    = (d=0) => ({ hidden:{opacity:0,y:20}, visible:{opacity:1,y:0,transition:{duration:.5,delay:d,ease}} });

/* ─── status display ─────────────────────────────────────── */
const STATUS_UI = {
  paid:                 {label:"✓ PAID",      bg:"rgba(34,197,94,.25)",  col:"#86EFAC"},
  partial:              {label:"◑ PARTIAL",   bg:"rgba(245,158,11,.25)", col:"#FCD34D"},
  pending:              {label:"⏳ PENDING",   bg:"rgba(255,107,53,.22)", col:"#FED7AA"},
  pending_verification: {label:"👀 VERIFYING", bg:"rgba(200,80,192,.22)", col:"#DDD6FE"},
};

/* ─── Sheet wrapper ──────────────────────────────────────── */
function Sheet({ children, onClose }) {
  return (
    <motion.div variants={vFade} initial="hidden" animate="visible" exit="exit"
      style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div style={{position:"absolute",inset:0,background:"rgba(7,5,15,.72)"}} onClick={onClose}/>
      <motion.div variants={vSheet} initial="hidden" animate="visible" exit="exit"
        style={{position:"relative",zIndex:1,borderRadius:"22px 22px 0 0",
          background:"white",maxHeight:"92dvh",overflowY:"auto",
          paddingBottom:"max(24px,env(safe-area-inset-bottom))",
          border:"1.5px solid #EDE9FE"}}>
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ─── Handle bar ─────────────────────────────────────────── */
function Handle() {
  return <div style={{width:36,height:4,borderRadius:9,background:"#DDD6FE",margin:"12px auto 0"}}/>;
}

/* ══════════════════════════════════════════════════════════
   PAYMENT SHEET — full working UPI payment flow
══════════════════════════════════════════════════════════ */
function PaymentSheet({ room, ownerUpiId, ownerName, onClose, onPaymentDone }) {
  const totalDue = (room.rent||0) + (room.electricityBill||0);
  const amountDue = room.balanceDue != null && room.balanceDue > 0
    ? room.balanceDue
    : totalDue;

  const [step,       setStep]       = useState("method");  // "method" | "confirm" | "done"
  const [payApp,     setPayApp]     = useState(null);
  const [txnNote,    setTxnNote]    = useState("");
  const [saving,     setSaving]     = useState(false);
  const [copied,     setCopied]     = useState(false);

  // ── UPI ID display + copy ────────────────────────────────
  const upi = ownerUpiId?.trim() || "";

  const copyUpi = async () => {
    try { await navigator.clipboard.writeText(upi); }
    catch { const el=document.createElement("input"); el.value=upi; document.body.appendChild(el); el.select(); document.execCommand("copy"); document.body.removeChild(el); }
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  // ── Build UPI deep-links ─────────────────────────────────
  // Standard UPI intent URL (works on Android for all apps)
  const upiIntent = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${amountDue}&cu=INR&tn=${encodeURIComponent(`Rent Room ${room.roomNo}`)}`;

  const appLinks = {
    gpay:    `tez://upi/pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${amountDue}&cu=INR&tn=${encodeURIComponent(`Rent Room ${room.roomNo}`)}`,
    phonepe: `phonepe://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${amountDue}&cu=INR&tn=${encodeURIComponent(`Rent Room ${room.roomNo}`)}`,
    paytm:   `paytmmp://upi/pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${amountDue}&cu=INR`,
    bhim:    `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(ownerName||"Owner")}&am=${amountDue}&cu=INR`,
  };

  const openApp = (appKey) => {
    setPayApp(appKey);
    const url = appLinks[appKey] || upiIntent;
    // Try deep link first; if not installed, fallback to generic UPI
    window.location.href = url;
    // After 1.5s, if still here, show "I've Paid" step
    setTimeout(() => setStep("confirm"), 1500);
  };

  // ── "I've Paid" → save to Firestore ─────────────────────
  const handleConfirmPaid = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const month = new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"});

      // 1. Add to paymentHistory collection
      await addDoc(collection(db,"paymentHistory"), {
        roomId:      room.id,
        ownerId:     room.ownerId,
        tenantName:  room.tenantName || "",
        tenantPhone: room.tenantPhone || "",
        amount:      amountDue,
        rent:        room.rent || 0,
        electricity: room.electricityBill || 0,
        month,
        paymentApp:  payApp || "upi",
        txnNote:     txnNote.trim(),
        status:      "pending_verification",
        paidAt:      now,
        createdAt:   now,
      });

      // 2. Update room status → pending_verification (owner must verify)
      await addDoc(collection(db,"rentLedger"), {
        roomId:      room.id,
        ownerId:     room.ownerId,
        buildingId:  room.buildingId || "",
        roomNo:      room.roomNo || "",
        tenantName:  room.tenantName || "",
        tenantPhone: room.tenantPhone || "",
        monthKey:    new Date().toISOString().slice(0, 7),
        month,
        type:        "tenant_reported_payment",
        method:      payApp || "upi",
        amount:      amountDue,
        rent:        room.rent || 0,
        electricity: room.electricityBill || 0,
        balanceAfter: 0,
        status:      "pending_verification",
        note:        txnNote.trim(),
        createdAt:   now,
      });

      await updateDoc(doc(db,"rooms",room.id), {
        status:      "pending_verification",
        amountPaid:  amountDue,
        balanceDue:  0,
        paymentApp:  payApp || "upi",
        lastPaidAt:  now,
      });

      setStep("done");
      setTimeout(() => { onPaymentDone(); onClose(); }, 2200);
    } catch(e) {
      console.error(e);
    }
    setSaving(false);
  };

  // ─── Step: Method selection ──────────────────────────────
  if (step === "method") return (
    <Sheet onClose={onClose}>
      <Handle/>
      {/* Dark gradient header */}
      <div style={{background:"linear-gradient(160deg,#07050F,#1E1B4B,#2A1860)",
        padding:"20px 20px 24px",margin:"0 0 0"}}>
        <p style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,.45)",
          textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Pay Rent</p>
        <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
          <span style={{fontSize:42,fontWeight:900,color:"white",fontFamily:"'JetBrains Mono',monospace",
            letterSpacing:"-.03em"}}>{fmt(amountDue)}</span>
        </div>
        <p style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>
          Room {room.roomNo} · {room.tenantName}
        </p>
        {room.electricityBill>0 && (
          <p style={{fontSize:11,color:"rgba(245,166,35,.8)",marginTop:3}}>
            Rent {fmt(room.rent)} + ⚡ Electricity {fmt(room.electricityBill)}
          </p>
        )}
      </div>

      <div style={{padding:"18px 18px 0"}}>

        {/* UPI ID row */}
        {upi ? (
          <div style={{background:"#F5F3FF",borderRadius:16,padding:"14px 16px",
            marginBottom:20,border:"1.5px solid #EDE9FE",
            display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div>
              <p style={{fontSize:10,fontWeight:700,color:"#6B7280",textTransform:"uppercase",
                letterSpacing:".07em",marginBottom:3}}>Owner UPI ID</p>
              <p style={{fontSize:15,fontWeight:800,color:"#1E1B4B",fontFamily:"'JetBrains Mono',monospace"}}>
                {upi}
              </p>
            </div>
            <button onClick={copyUpi}
              style={{padding:"8px 14px",borderRadius:10,border:"none",cursor:"pointer",fontWeight:700,
                fontSize:12,transition:"all .2s",flexShrink:0,
                background:copied?"#00C9A7":"linear-gradient(135deg,#4158D0,#C850C0)",
                color:"white"}}>
              {copied?"✓ Copied":"Copy"}
            </button>
          </div>
        ) : (
          <div style={{background:"#FEF3C7",borderRadius:16,padding:"12px 16px",
            marginBottom:20,border:"1.5px solid #FDE68A"}}>
            <p style={{fontSize:12,color:"#92400E",fontWeight:600}}>
              ⚠️ मकान मालिक ने UPI ID नहीं जोड़ी है। App Scan करके pay करें।
            </p>
          </div>
        )}

        {/* Payment app buttons */}
        <p style={{fontSize:12,fontWeight:700,color:"#6B7280",textTransform:"uppercase",
          letterSpacing:".08em",marginBottom:12}}>Pay with</p>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {k:"gpay",   name:"Google Pay",  icon:"G",    grad:"linear-gradient(135deg,#1A73E8,#0D47A1)",  emoji:"🔵"},
            {k:"phonepe",name:"PhonePe",     icon:"P",    grad:"linear-gradient(135deg,#5f259f,#430080)",  emoji:"🟣"},
            {k:"paytm",  name:"Paytm",       icon:"Pay",  grad:"linear-gradient(135deg,#00BAF2,#0085C0)",  emoji:"🔷"},
            {k:"bhim",   name:"BHIM UPI",    icon:"₹",    grad:"linear-gradient(135deg,#FF6B35,#F5A623)",  emoji:"🟠"},
          ].map(app=>(
            <button key={app.k} onClick={()=>openApp(app.k)}
              style={{padding:"16px 12px",borderRadius:16,border:"1.5px solid #EDE9FE",
                cursor:"pointer",display:"flex",alignItems:"center",gap:12,
                background:"white",transition:"all .15s",
                boxShadow:"0 2px 8px rgba(30,27,75,.07)"}}
              onPointerDown={e=>e.currentTarget.style.transform="scale(.96)"}
              onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
              <div style={{width:36,height:36,borderRadius:10,background:app.grad,flexShrink:0,
                display:"flex",alignItems:"center",justifyContent:"center",
                color:"white",fontWeight:900,fontSize:app.k==="paytm"?11:16}}>
                {app.k==="paytm"?"Pay":app.emoji}
              </div>
              <span style={{fontWeight:700,fontSize:13,color:"#1A1D2E"}}>{app.name}</span>
            </button>
          ))}
        </div>

        {/* Any UPI app */}
        <button onClick={()=>openApp("upi")}
          style={{width:"100%",padding:"14px",borderRadius:16,border:"1.5px solid #EDE9FE",
            cursor:"pointer",background:"#F5F3FF",color:"#4158D0",fontWeight:800,fontSize:14,
            display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:16}}>
          <i className="fa-solid fa-mobile-screen" style={{fontSize:16}}/>
          Any Other UPI App
        </button>

        {/* Manual note */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",
            letterSpacing:".07em",display:"block",marginBottom:6}}>
            Transaction Note (optional)
          </label>
          <input value={txnNote} onChange={e=>setTxnNote(e.target.value)}
            placeholder="e.g. UTR number or note"
            style={{width:"100%",padding:"11px 14px",borderRadius:12,
              border:"1.5px solid #EDE9FE",background:"#F5F3FF",fontSize:14,
              fontFamily:"'Poppins',sans-serif",color:"#1A1D2E",outline:"none"}}
            onFocus={e=>e.target.style.borderColor="#FF6B35"}
            onBlur={e=>e.target.style.borderColor="#EDE9FE"}/>
        </div>

        {/* Already paid? */}
        <button onClick={()=>setStep("confirm")}
          style={{width:"100%",padding:"14px",borderRadius:16,border:"1.5px solid #EDE9FE",
            cursor:"pointer",background:"#F5F3FF",color:"#6B7280",fontWeight:700,fontSize:13,marginBottom:8}}>
          Already paid? Tap here to confirm →
        </button>
        <div style={{height:8}}/>
      </div>
    </Sheet>
  );

  // ─── Step: Confirm ───────────────────────────────────────
  if (step === "confirm") return (
    <Sheet onClose={onClose}>
      <Handle/>
      <div style={{padding:"20px 20px 0"}}>
        <p style={{fontSize:24,textAlign:"center",marginBottom:4}}>✅</p>
        <h3 style={{fontWeight:900,fontSize:22,color:"#1E1B4B",textAlign:"center",marginBottom:6}}>
          Payment हो गई?
        </h3>
        <p style={{fontSize:13,color:"#6B7280",textAlign:"center",marginBottom:24,lineHeight:1.6}}>
          Confirm करें कि आपने <strong>{fmt(amountDue)}</strong> की payment
          {upi ? <> <strong>{upi}</strong> को</> : null} कर दी है।
        </p>

        {/* Amount summary */}
        <div style={{background:"linear-gradient(135deg,#1E1B4B,#2A1860)",borderRadius:18,
          padding:"18px 20px",marginBottom:20,textAlign:"center"}}>
          <p style={{fontSize:11,color:"rgba(255,255,255,.45)",fontWeight:700,
            textTransform:"uppercase",letterSpacing:".1em",marginBottom:8}}>Amount Paid</p>
          <p style={{fontSize:36,fontWeight:900,color:"#86EFAC",
            fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-.03em"}}>{fmt(amountDue)}</p>
          <p style={{fontSize:12,color:"rgba(255,255,255,.45)",marginTop:6}}>
            Room {room.roomNo} · {payApp ? payApp.toUpperCase() : "UPI"}
          </p>
        </div>

        {/* UTR field */}
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",
            letterSpacing:".07em",display:"block",marginBottom:6}}>
            Transaction ID / UTR Number (optional)
          </label>
          <input value={txnNote} onChange={e=>setTxnNote(e.target.value)}
            placeholder="e.g. 407123456789"
            style={{width:"100%",padding:"13px 14px",borderRadius:13,
              border:"1.5px solid #EDE9FE",background:"#F5F3FF",
              fontSize:14,fontFamily:"'JetBrains Mono',monospace",
              color:"#1A1D2E",outline:"none",letterSpacing:".04em"}}
            onFocus={e=>e.target.style.borderColor="#00C9A7"}
            onBlur={e=>e.target.style.borderColor="#EDE9FE"}/>
          <p style={{fontSize:11,color:"#9CA3AF",marginTop:4}}>
            इससे owner को verify करने में आसानी होगी।
          </p>
        </div>

        <button onClick={handleConfirmPaid} disabled={saving}
          style={{width:"100%",padding:"16px",borderRadius:16,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#00C9A7,#16A34A)",color:"white",fontWeight:900,
            fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            boxShadow:"0 6px 20px rgba(0,201,167,.3)",opacity:saving?.6:1,
            fontFamily:"'Poppins',sans-serif"}}>
          {saving
            ? <><svg style={{width:20,height:20,animation:"tspin 1s linear infinite"}} viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
              </svg> Saving…</>
            : <><i className="fa-solid fa-circle-check" style={{fontSize:18}}/>हाँ, मैंने pay कर दिया</>}
        </button>

        <button onClick={()=>setStep("method")}
          style={{width:"100%",padding:"13px",borderRadius:14,border:"none",cursor:"pointer",
            background:"none",color:"#9CA3AF",fontWeight:600,fontSize:13,marginTop:8}}>
          ← वापस जाएं
        </button>
        <div style={{height:8}}/>
      </div>
    </Sheet>
  );

  // ─── Step: Done ──────────────────────────────────────────
  if (step === "done") return (
    <Sheet onClose={onClose}>
      <Handle/>
      <div style={{padding:"40px 24px",textAlign:"center"}}>
        <motion.div initial={{scale:0}} animate={{scale:1}}
          transition={{type:"spring",stiffness:400,damping:20}}
          style={{fontSize:72,marginBottom:16}}>🎉</motion.div>
        <h3 style={{fontWeight:900,fontSize:24,color:"#1E1B4B",marginBottom:8}}>
          शुक्रिया! 🙏
        </h3>
        <p style={{fontSize:28,fontWeight:900,color:"#00C9A7",fontFamily:"'JetBrains Mono',monospace",marginBottom:8}}>
          {fmt(amountDue)}
        </p>
        <p style={{fontSize:14,color:"#6B7280",lineHeight:1.6}}>
          आपकी payment record हो गई। मकान मालिक verify करेंगे और आपका status update होगा।
        </p>
        <div style={{marginTop:20,background:"#F5F3FF",borderRadius:14,padding:"12px 16px",
          border:"1.5px solid #EDE9FE"}}>
          <p style={{fontSize:12,color:"#4158D0",fontWeight:600}}>
            ✓ Owner को notification भेजी गई
          </p>
        </div>
      </div>
    </Sheet>
  );

  return null;
}

/* ── Complaint Sheet ─────────────────────────────────────── */
const COMPLAINT_TYPES = [
  {k:"water",l:"💧 Water"},{k:"electricity",l:"⚡ Elec"},{k:"maintenance",l:"🔧 Repair"},
  {k:"noise",l:"🔊 Noise"},{k:"other",l:"📝 Other"},
];

function ComplaintSheet({ roomId, ownerId, onClose, onSent }) {
  const [type,setPtype] = useState("maintenance");
  const [priority,setPriority] = useState("medium");
  const [desc,setDesc] = useState("");
  const [loading,setLoading] = useState(false);

  const go = async () => {
    if(!desc.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db,"complaints"),{
        roomId,ownerId,type,priority,
        description:desc.trim(),
        status:"open",createdAt:new Date().toISOString(),
      });
      onSent(); onClose();
    } catch {}
    setLoading(false);
  };

  return (
    <Sheet onClose={onClose}>
      <Handle/>
      <div style={{padding:"14px 18px 0"}}>
        <h3 style={{fontWeight:900,fontSize:20,color:"#1E1B4B",marginBottom:4}}>Raise Complaint</h3>
        <p style={{fontSize:12,color:"#9CA3AF",marginBottom:18}}>Problem report करें</p>

        <p style={{fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",
          letterSpacing:".07em",marginBottom:8}}>Issue Type</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
          {COMPLAINT_TYPES.map(c=>(
            <button key={c.k} onClick={()=>setPtype(c.k)}
              style={{padding:"8px 14px",borderRadius:20,border:"none",cursor:"pointer",
                fontSize:12,fontWeight:700,
                background:type===c.k?"linear-gradient(135deg,#FF6B35,#F5A623)":"#F5F3FF",
                color:type===c.k?"white":"#6B7280"}}>
              {c.l}
            </button>
          ))}
        </div>

        <p style={{fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",
          letterSpacing:".07em",marginBottom:8}}>Priority</p>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {[{k:"low",l:"Low",c:"#22C55E"},{k:"medium",l:"Medium",c:"#F5A623"},{k:"high",l:"High",c:"#E11D48"}].map(p=>(
            <button key={p.k} onClick={()=>setPriority(p.k)}
              style={{flex:1,padding:"10px",borderRadius:12,border:"none",cursor:"pointer",
                fontWeight:700,fontSize:13,
                background:priority===p.k?p.c:"#F5F3FF",
                color:priority===p.k?"white":"#6B7280"}}>
              {p.l}
            </button>
          ))}
        </div>

        <p style={{fontSize:11,fontWeight:700,color:"#6B7280",textTransform:"uppercase",
          letterSpacing:".07em",marginBottom:8}}>Description</p>
        <textarea rows={3} value={desc} onChange={e=>setDesc(e.target.value)}
          placeholder="Problem briefly describe करें…"
          style={{width:"100%",padding:"12px 14px",borderRadius:13,
            border:"1.5px solid #EDE9FE",background:"#F5F3FF",fontSize:14,
            fontFamily:"'Poppins',sans-serif",color:"#1A1D2E",outline:"none",
            resize:"none",marginBottom:16}}
          onFocus={e=>e.target.style.borderColor="#FF6B35"}
          onBlur={e=>e.target.style.borderColor="#EDE9FE"}/>

        <button onClick={go} disabled={loading||!desc.trim()}
          style={{width:"100%",padding:"15px",borderRadius:16,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#FF6B35,#E11D48)",color:"white",fontWeight:900,
            fontSize:15,boxShadow:"0 5px 18px rgba(255,107,53,.28)",opacity:loading||!desc.trim()?.6:1,
            fontFamily:"'Poppins',sans-serif"}}>
          {loading?"Submitting…":"Submit Complaint"}
        </button>
        <div style={{height:16}}/>
      </div>
    </Sheet>
  );
}

/* ── Payment History Row ─────────────────────────────────── */
function HistRow({ r, i }) {
  const isPaid = r.status==="paid"||r.status==="pending_verification";
  return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",
      borderBottom:"1px solid rgba(255,255,255,.07)"}}>
      <div style={{width:36,height:36,borderRadius:12,flexShrink:0,
        display:"flex",alignItems:"center",justifyContent:"center",
        background:isPaid?"rgba(34,197,94,.2)":"rgba(251,113,133,.15)"}}>
        <i className={isPaid?"fa-solid fa-check":"fa-solid fa-clock"}
          style={{fontSize:13,color:isPaid?"#86EFAC":"#FB7185"}}/>
      </div>
      <div style={{flex:1}}>
        <p style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.85)"}}>
          {r.month || new Date(r.paidAt||r.createdAt||Date.now()).toLocaleDateString("en-IN",{month:"short",year:"numeric"})}
        </p>
        <p style={{fontSize:11,color:"rgba(255,255,255,.4)"}}>
          {r.paymentApp?r.paymentApp.toUpperCase()+" · ":""}
          {r.txnNote||"UPI Payment"}
        </p>
      </div>
      <p style={{fontWeight:900,fontSize:14,
        color:isPaid?"#86EFAC":"#FCD34D",
        fontFamily:"'JetBrains Mono',monospace"}}>{fmt(r.amount||r.rent)}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   ROOT — TenantDashboardView
══════════════════════════════════════════════════════════ */
export default function TenantDashboardView() {
  const { authUser, setUserRole } = useApp();
  const navigate = useNavigate();

  const [room,         setRoom]         = useState(null);
  const [buildingName, setBuildingName] = useState("");
  const [ownerUpiId,   setOwnerUpiId]   = useState("");
  const [ownerName,    setOwnerName]    = useState("");
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showPayment,  setShowPayment]  = useState(false);
  const [showComplaint,setShowComplaint]= useState(false);
  const [toastMsg,     setToastMsg]     = useState("");
  const unsubRef = useRef(null);

  const toast = useCallback(msg=>{
    setToastMsg(msg);
    setTimeout(()=>setToastMsg(""),3200);
  },[]);

  // ── Find room → subscribe ─────────────────────────────────
  useEffect(()=>{
    if(!authUser) return;
    let unsubRoom = null;

    const init = async () => {
      try {
        // Step 1: Get roomId from tenantProfiles (direct doc read by uid — no query needed)
        const tDoc = await getDoc(doc(db,"tenantProfiles",authUser.uid));
        if(!tDoc.exists()){
          // Fallback: try query in case profile was written differently
          const snap = await getDocs(
            query(collection(db,"rooms"),where("tenantUid","==",authUser.uid))
          );
          if(snap.empty){ setLoading(false); return; }
          subscribeToRoom(snap.docs[0].id);
          return;
        }
        const roomId = tDoc.data().roomId;
        if(!roomId){ setLoading(false); return; }
        subscribeToRoom(roomId);
      } catch(err) {
        console.error("TenantDashboard init error:", err);
        setLoading(false);
      }

      function subscribeToRoom(roomId) {
        // Step 2: Direct doc subscription — tenant has read access to their room
        unsubRoom = onSnapshot(doc(db,"rooms",roomId), async rSnap=>{
          if(!rSnap.exists()){ setLoading(false); return; }
          const data = {id:rSnap.id,...rSnap.data()};
          setRoom(data);
          setLoading(false);

          // Fetch building name (direct doc read)
          if(data.buildingId){
            try {
              const bSnap = await getDoc(doc(db,"buildings",data.buildingId));
              if(bSnap.exists()) setBuildingName(bSnap.data().name||"");
            }catch{}
          }

          // Fetch owner profile — query by uid field
          if(data.ownerId){
            try {
              const oSnap = await getDocs(
                query(collection(db,"ownerProfiles"),where("uid","==",data.ownerId))
              );
              if(!oSnap.empty){
                const od = oSnap.docs[0].data();
                setOwnerUpiId(od.upiId||"");
                setOwnerName(od.name||"");
              }
            }catch{}
          }
        }, err=>{
          console.error("Room snapshot error:", err);
          setLoading(false);
        });
        unsubRef.current = unsubRoom;

        // Payment history
        getDocs(query(collection(db,"paymentHistory"),where("roomId","==",roomId)))
          .then(hSnap=>{
            const list = hSnap.docs.map(d=>({id:d.id,...d.data()}));
            list.sort((a,b)=>new Date(b.paidAt||b.createdAt||0)-new Date(a.paidAt||a.createdAt||0));
            setHistory(list);
          }).catch(()=>{});
      }
    };

    init();
    return()=>{ unsubRoom?.(); };
  },[authUser]);

  const handleLogout = async () => {
    const uid = authUser?.uid;
    await signOut(auth);
    if(uid) localStorage.removeItem(`rkp_role_${uid}`);
    setUserRole(null);
    navigate("/login");
  };

  // After payment confirmed → refresh history
  const onPaymentDone = useCallback(async()=>{
    toast("✓ Payment recorded! Owner will verify soon.");
    if(!room) return;
    try {
      const hSnap = await getDocs(
        query(collection(db,"paymentHistory"),where("roomId","==",room.id))
      );
      const list = hSnap.docs.map(d=>({id:d.id,...d.data()}));
      list.sort((a,b)=>new Date(b.paidAt||b.createdAt||0)-new Date(a.paidAt||a.createdAt||0));
      setHistory(list);
    }catch{}
  },[room,toast]);

  // ── Loading ───────────────────────────────────────────────
  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",
      background:"linear-gradient(135deg,#07050F,#1E1B4B)"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:52,height:52,borderRadius:18,
          background:"linear-gradient(135deg,#FF6B35,#F5A623)",
          display:"flex",alignItems:"center",justifyContent:"center",
          margin:"0 auto 12px",boxShadow:"0 8px 24px rgba(255,107,53,.4)"}}>
          <span style={{fontSize:24,color:"white",fontWeight:900}}>₹</span>
        </div>
        <p style={{color:"rgba(255,255,255,.45)",fontSize:13,fontWeight:600}}>Loading your room…</p>
      </div>
    </div>
  );

  if(!room) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",
      height:"100%",background:"#F5F3FF",padding:24,textAlign:"center"}}>
      <div>
        <p style={{fontSize:48,marginBottom:12}}>🏠</p>
        <p style={{fontWeight:900,fontSize:18,color:"#1E1B4B",marginBottom:6}}>Room not linked</p>
        <p style={{fontSize:13,color:"#6B7280",marginBottom:20}}>
          मकान मालिक से Connection Code लें और login करें।
        </p>
        <button onClick={handleLogout}
          style={{padding:"10px 24px",borderRadius:12,border:"none",cursor:"pointer",
            background:"linear-gradient(135deg,#FF6B35,#F5A623)",color:"white",fontWeight:800,fontSize:14}}>
          Sign Out
        </button>
      </div>
    </div>
  );

  const { tenantName,roomNo,rent=0,electricityBill=0,
          balanceDue,status="pending",securityDeposit=0,createdAt } = room;
  const totalDue   = rent+(electricityBill||0);
  const amountDue  = balanceDue!=null&&balanceDue>0 ? balanceDue : totalDue;
  const statusUI   = STATUS_UI[status]||STATUS_UI.pending;
  const isPaid     = status==="paid";
  const isVerifying= status==="pending_verification";
  const moveIn     = createdAt
    ? (createdAt.toDate?createdAt.toDate():new Date(createdAt))
        .toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})
    : "—";

  return (
    <>
      <style>{`@keyframes tspin{to{transform:rotate(360deg)}}`}</style>

      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>

        {/* ── HERO HEADER ── */}
        <div style={{background:"linear-gradient(155deg,#07050F 0%,#130D2E 40%,#2A1860 80%,#130D2E 100%)",
          flexShrink:0,position:"relative",overflow:"hidden",
          paddingTop:"max(44px,env(safe-area-inset-top))"}}>

          {/* Orbs */}
          <div style={{position:"absolute",top:-50,right:-40,width:180,height:180,borderRadius:"50%",
            background:"radial-gradient(circle,rgba(200,80,192,.2) 0%,transparent 70%)",pointerEvents:"none"}}/>
          <div style={{position:"absolute",bottom:-30,left:-20,width:150,height:150,borderRadius:"50%",
            background:"radial-gradient(circle,rgba(65,88,208,.18) 0%,transparent 70%)",pointerEvents:"none"}}/>

          <div style={{position:"relative",zIndex:1,padding:"14px 16px 16px"}}>
            {/* Top bar */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:28,height:28,borderRadius:9,
                  background:"linear-gradient(135deg,#FF6B35,#F5A623)",
                  display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10L12 3l9 7"/><path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                  </svg>
                </div>
                <span style={{fontSize:13,fontWeight:900,color:"#F5A623"}}>
                  Room<span style={{color:"rgba(255,255,255,.35)",fontWeight:600}}>Khata</span>
                </span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{padding:"4px 10px",borderRadius:20,
                  background:"rgba(34,197,94,.15)",border:"1px solid rgba(34,197,94,.25)",
                  display:"flex",alignItems:"center",gap:5}}>
                  <div style={{width:6,height:6,borderRadius:"50%",background:"#4ADE80"}}/>
                  <span style={{fontSize:10,fontWeight:700,color:"#86EFAC"}}>LIVE</span>
                </div>
                <button onClick={handleLogout}
                  style={{width:36,height:36,borderRadius:"50%",
                    background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.15)",
                    display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
                  <i className="fa-solid fa-sign-out" style={{fontSize:13,color:"rgba(255,255,255,.75)"}}/>
                </button>
              </div>
            </div>

            {/* Greeting */}
            <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.42)",
              textTransform:"uppercase",letterSpacing:".14em",marginBottom:3}}>
              Welcome back,
            </p>
            <h2 style={{fontWeight:900,fontSize:26,letterSpacing:"-.03em",color:"white",
              fontFamily:"'Poppins',sans-serif",lineHeight:1.1,marginBottom:4}}>
              {tenantName||"Tenant"}
            </h2>
            <p style={{fontSize:13,color:"rgba(255,255,255,.45)",marginBottom:16}}>
              Room <span style={{color:"rgba(255,255,255,.78)",fontWeight:700}}>{roomNo}</span>
              {buildingName && <span> · {buildingName}</span>}
            </p>

            {/* Due card */}
            <div style={{borderRadius:18,background:"rgba(255,255,255,.058)",
              border:"1px solid rgba(255,255,255,.11)",overflow:"hidden",position:"relative",
              backdropFilter:"blur(18px)"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:1,
                background:"linear-gradient(90deg,transparent 5%,rgba(255,255,255,.18) 50%,transparent 95%)"}}/>
              <div style={{padding:"16px 18px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.45)",
                    textTransform:"uppercase",letterSpacing:".12em"}}>
                    {isPaid?"This Month":"Amount Due"}
                  </p>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:20,
                    background:statusUI.bg,color:statusUI.col}}>
                    {statusUI.label}
                  </span>
                </div>
                <p style={{fontSize:38,fontWeight:900,color:isPaid?"#86EFAC":isVerifying?"#DDD6FE":"white",
                  fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-.03em",lineHeight:1,marginBottom:8}}>
                  {fmt(amountDue)}
                </p>
                <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                  <div>
                    <p style={{fontSize:9,color:"rgba(255,255,255,.32)",fontWeight:600,textTransform:"uppercase"}}>Rent</p>
                    <p style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,.7)",
                      fontFamily:"'JetBrains Mono',monospace"}}>{fmt(rent)}</p>
                  </div>
                  {(electricityBill||0)>0&&<div>
                    <p style={{fontSize:9,color:"rgba(255,255,255,.32)",fontWeight:600,textTransform:"uppercase"}}>+Electricity</p>
                    <p style={{fontSize:13,fontWeight:700,color:"#FCD34D",
                      fontFamily:"'JetBrains Mono',monospace"}}>{fmt(electricityBill)}</p>
                  </div>}
                </div>
                {isVerifying&&(
                  <div style={{marginTop:10,padding:"8px 12px",borderRadius:10,
                    background:"rgba(200,80,192,.15)",border:"1px solid rgba(200,80,192,.25)"}}>
                    <p style={{fontSize:12,color:"#DDD6FE",fontWeight:600}}>
                      👀 Payment verification pending — मकान मालिक confirm करेंगे
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── SCROLL BODY ── */}
        <div style={{flex:1,overflowY:"auto",background:"#F5F3FF",padding:"16px 14px 24px",
          WebkitOverflowScrolling:"touch"}}>

          {/* Action buttons */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {/* Pay Rent */}
            <button
              onClick={()=>!isPaid&&!isVerifying&&setShowPayment(true)}
              style={{padding:"18px 12px",borderRadius:18,border:"none",cursor:isPaid||isVerifying?"default":"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",
                background: isPaid
                  ? "linear-gradient(135deg,#16A34A,#15803D)"
                  : isVerifying
                  ? "linear-gradient(135deg,#7C3AED,#6D28D9)"
                  : "linear-gradient(135deg,#4158D0,#2563EB)",
                boxShadow: isPaid
                  ? "0 6px 20px rgba(22,163,74,.3)"
                  : isVerifying
                  ? "0 6px 20px rgba(124,58,237,.3)"
                  : "0 6px 20px rgba(65,88,208,.35)",
                opacity: isVerifying?.8:1}}>
              <i className={isPaid?"fa-solid fa-circle-check":isVerifying?"fa-solid fa-clock":"fa-solid fa-qrcode"}
                style={{fontSize:26,color:"white",marginBottom:6}}/>
              <span style={{fontSize:14,fontWeight:900,color:"white"}}>
                {isPaid?"Paid ✓":isVerifying?"Verifying…":"Pay Rent"}
              </span>
              <span style={{fontSize:10,color:"rgba(255,255,255,.65)",marginTop:3}}>
                {isPaid?"This month done":isVerifying?"Pending owner":fmt(amountDue)+" due"}
              </span>
            </button>

            {/* Raise Complaint */}
            <button onClick={()=>setShowComplaint(true)}
              style={{padding:"18px 12px",borderRadius:18,border:"none",cursor:"pointer",
                display:"flex",flexDirection:"column",alignItems:"center",
                background:"linear-gradient(135deg,#FF6B35,#E11D48)",
                boxShadow:"0 6px 20px rgba(255,107,53,.32)"}}>
              <i className="fa-solid fa-triangle-exclamation" style={{fontSize:26,color:"white",marginBottom:6}}/>
              <span style={{fontSize:14,fontWeight:900,color:"white"}}>Complaint</span>
              <span style={{fontSize:10,color:"rgba(255,255,255,.65)",marginTop:3}}>Report issue</span>
            </button>
          </div>

          {/* Tenancy details */}
          <div style={{background:"linear-gradient(135deg,#1E1B4B,#2A1860)",borderRadius:18,
            padding:"16px 18px",marginBottom:16,position:"relative",overflow:"hidden",
            boxShadow:"0 6px 20px rgba(30,27,75,.18)"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:1,
              background:"linear-gradient(90deg,transparent 10%,rgba(255,255,255,.14) 50%,transparent 90%)"}}/>
            <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",
              textTransform:"uppercase",letterSpacing:".1em",marginBottom:14}}>Tenancy Details</p>
            {[
              {l:"Move-in Date",     v:moveIn,               c:"rgba(255,255,255,.75)"},
              {l:"Security Deposit", v:fmt(securityDeposit),  c:"#86EFAC", mono:true},
              {l:"Building",         v:buildingName||"—",     c:"rgba(255,255,255,.75)"},
              {l:"Room No.",         v:`Room ${roomNo}`,      c:"rgba(255,255,255,.75)"},
            ].map(row=>(
              <div key={row.l} style={{display:"flex",justifyContent:"space-between",
                alignItems:"center",padding:"10px 0",
                borderBottom:"1px solid rgba(255,255,255,.06)"}}>
                <span style={{fontSize:13,color:"rgba(255,255,255,.45)"}}>{row.l}</span>
                <span style={{fontSize:13,fontWeight:700,color:row.c,
                  fontFamily:row.mono?"'JetBrains Mono',monospace":"inherit"}}>
                  {row.v}
                </span>
              </div>
            ))}
          </div>

          {/* Payment history */}
          <div style={{background:"linear-gradient(135deg,#1E1B4B,#2A1860)",borderRadius:18,
            padding:"16px 18px",position:"relative",overflow:"hidden",
            boxShadow:"0 6px 20px rgba(30,27,75,.18)"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:1,
              background:"linear-gradient(90deg,transparent 10%,rgba(255,255,255,.14) 50%,transparent 90%)"}}/>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,.4)",
                textTransform:"uppercase",letterSpacing:".1em"}}>Payment History</p>
              <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,
                background:"rgba(65,88,208,.25)",color:"#93C5FD"}}>
                {history.length} records
              </span>
            </div>
            {history.length===0
              ? <div style={{textAlign:"center",padding:"20px 0",color:"rgba(255,255,255,.25)"}}>
                  <i className="fa-solid fa-clock-rotate-left" style={{fontSize:28,marginBottom:8,display:"block"}}/>
                  <p style={{fontSize:13}}>No payment history yet</p>
                </div>
              : history.slice(0,8).map((h,i)=><HistRow key={h.id} r={h} i={i}/>)
            }
          </div>

        </div>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {showPayment&&(
          <PaymentSheet key="pay"
            room={room} ownerUpiId={ownerUpiId} ownerName={ownerName}
            onClose={()=>setShowPayment(false)}
            onPaymentDone={onPaymentDone}/>
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
            initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
            style={{position:"fixed",bottom:24,left:16,right:16,zIndex:300,
              display:"flex",justifyContent:"center",pointerEvents:"none"}}>
            <div style={{padding:"12px 20px",borderRadius:16,fontSize:14,fontWeight:700,
              color:"white",background:"linear-gradient(135deg,#00C9A7,#16A34A)",
              boxShadow:"0 6px 20px rgba(0,0,0,.25)"}}>
              {toastMsg}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
