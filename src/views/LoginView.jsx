// src/views/LoginView.jsx
// ─────────────────────────────────────────────────────────────
//  Flow:
//    Step 1 — Role selection (Owner / Tenant)
//    Step 2a (Owner Login)  — email + password sign-in
//    Step 2b (Owner Signup) — name + email + password → creates
//                             ownerProfiles doc → /onboarding
//    Step 2c (Tenant)       — phone + connection code → anon auth
//                             links to room → /tenant
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
} from "firebase/auth";
import {
  collection, addDoc, getDocs,
  query, where, updateDoc, setDoc, doc,
} from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { useApp } from "../context/AppContext";

/* ─── constants ────────────────────────────────────────────── */
const S = { ROLE:"role", OWNER_LOGIN:"owner_login", OWNER_SIGNUP:"owner_signup", TENANT:"tenant" };

const BRAND = "#FF6B35";
const VIOLET = "#4158D0";
const BDR = "#EDE9FE";

/* ─── tiny helpers ─────────────────────────────────────────── */
function Spinner() {
  return (
    <svg style={{width:20,height:20,animation:"ls 1s linear infinite",flexShrink:0}}
      viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/>
    </svg>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{background:"#FEE2E2",color:"#991B1B",border:"1.5px solid #FECACA",
      borderRadius:12,padding:"10px 14px",fontSize:13,fontWeight:600,marginBottom:12,
      display:"flex",alignItems:"flex-start",gap:8}}>
      <i className="fa-solid fa-circle-exclamation" style={{marginTop:1,flexShrink:0}}/>
      <span>{msg}</span>
    </div>
  );
}

function Field({ label, type="text", value, onChange, placeholder, required, min, autoComplete, prefix, mono }) {
  const [f,setF] = useState(false);
  return (
    <div style={{marginBottom:14}}>
      {label && (
        <label style={{display:"block",fontSize:11,fontWeight:700,color:VIOLET,
          textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>
          {label}
        </label>
      )}
      <div style={{position:"relative"}}>
        {prefix && (
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",
            fontSize:14,fontWeight:700,color:BRAND,pointerEvents:"none",userSelect:"none"}}>
            {prefix}
          </span>
        )}
        <input
          type={type} value={value} placeholder={placeholder}
          required={required} minLength={min} autoComplete={autoComplete}
          onChange={e => onChange(e.target.value)}
          onFocus={()=>setF(true)} onBlur={()=>setF(false)}
          style={{
            width:"100%",
            padding: prefix ? "13px 14px 13px 48px" : "13px 14px",
            borderRadius:14,fontSize:15,fontWeight:500,outline:"none",
            fontFamily: mono ? "'JetBrains Mono',monospace" : "'Poppins',sans-serif",
            color:"#1A1D2E",
            background: f ? "#fff" : "#F5F3FF",
            border: `1.5px solid ${f ? BRAND : BDR}`,
            boxShadow: f ? `0 0 0 3px rgba(255,107,53,.1)` : "none",
            transition:"all .18s",letterSpacing: mono ? ".12em" : "normal",
          }}
        />
      </div>
    </div>
  );
}

function PrimaryBtn({ label, loading, color, onClick, type="submit" }) {
  const bg = color === "violet"
    ? "linear-gradient(135deg,#4158D0,#C850C0)"
    : "linear-gradient(135deg,#FF6B35,#F5A623)";
  return (
    <button type={type} onClick={onClick} disabled={loading}
      style={{width:"100%",padding:"15px",borderRadius:16,border:"none",cursor:"pointer",
        background:bg,color:"white",fontWeight:900,fontSize:16,
        display:"flex",alignItems:"center",justifyContent:"center",gap:8,
        boxShadow:"0 6px 20px rgba(255,107,53,.28)",opacity:loading?.5:1,
        fontFamily:"'Poppins',sans-serif",transition:"opacity .2s,transform .1s"}}
      onPointerDown={e=>e.currentTarget.style.transform="scale(.96)"}
      onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
      {loading ? <><Spinner/> Loading…</> : label}
    </button>
  );
}

function BackBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",
        cursor:"pointer",color:"#9CA3AF",fontWeight:700,fontSize:13,marginBottom:20,padding:0}}>
      <i className="fa-solid fa-arrow-left" style={{fontSize:12}}/> वापस जाएं
    </button>
  );
}

/* ─── Step 1: Role Selection ──────────────────────────────── */
function RoleStep({ onSelect }) {
  return (
    <div style={{animation:"slideIn .38s cubic-bezier(.34,1.2,.64,1) both"}}>
      <p style={{textAlign:"center",fontSize:14,fontWeight:700,color:"#6B7280",marginBottom:20}}>
        आप कौन हैं? / Who are you?
      </p>

      {/* Owner */}
      <button type="button" onClick={()=>onSelect("owner")}
        style={{width:"100%",marginBottom:14,borderRadius:20,padding:"18px 20px",
          display:"flex",alignItems:"center",gap:16,border:"none",cursor:"pointer",
          background:"linear-gradient(135deg,#1E1B4B,#4C1D95)",
          boxShadow:"0 12px 32px rgba(30,27,75,.35)",textAlign:"left"}}
        onPointerDown={e=>e.currentTarget.style.transform="scale(.97)"}
        onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
        <div style={{width:56,height:56,borderRadius:16,background:"rgba(255,255,255,.15)",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <i className="fa-solid fa-key" style={{fontSize:22,color:"white"}}/>
        </div>
        <div style={{flex:1}}>
          <p style={{color:"white",fontWeight:900,fontSize:17,lineHeight:1.2}}>मैं मकान मालिक हूँ</p>
          <p style={{color:"rgba(255,255,255,.6)",fontSize:12,fontWeight:600,marginTop:3}}>I am an Owner / Landlord</p>
        </div>
        <i className="fa-solid fa-chevron-right" style={{color:"rgba(255,255,255,.4)",flexShrink:0}}/>
      </button>

      {/* Tenant */}
      <button type="button" onClick={()=>onSelect("tenant")}
        style={{width:"100%",borderRadius:20,padding:"18px 20px",
          display:"flex",alignItems:"center",gap:16,border:"none",cursor:"pointer",
          background:"linear-gradient(135deg,#FF6B35,#F5A623)",
          boxShadow:"0 12px 32px rgba(255,107,53,.35)",textAlign:"left"}}
        onPointerDown={e=>e.currentTarget.style.transform="scale(.97)"}
        onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
        <div style={{width:56,height:56,borderRadius:16,background:"rgba(255,255,255,.18)",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <i className="fa-solid fa-house-user" style={{fontSize:22,color:"white"}}/>
        </div>
        <div style={{flex:1}}>
          <p style={{color:"white",fontWeight:900,fontSize:17,lineHeight:1.2}}>मैं किरायेदार हूँ</p>
          <p style={{color:"rgba(255,255,255,.7)",fontSize:12,fontWeight:600,marginTop:3}}>I am a Tenant / Kirayedaar</p>
        </div>
        <i className="fa-solid fa-chevron-right" style={{color:"rgba(255,255,255,.5)",flexShrink:0}}/>
      </button>
    </div>
  );
}

/* ─── Step 2a: Owner Login ────────────────────────────────── */
function OwnerLoginStep({ onBack, onSwitchSignup }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const { setUserRole } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      // Persist role so AppContext resolveRole fast-paths
      localStorage.setItem(`rkp_role_${cred.user.uid}`, "owner");
      setUserRole("owner");
      navigate("/owner", { replace: true });
    } catch (err) {
      setError(
        err.code === "auth/user-not-found"   ? "No account found. Please sign up." :
        err.code === "auth/wrong-password"   ? "Wrong password. Try again." :
        err.code === "auth/invalid-email"    ? "Invalid email address." :
        err.code === "auth/invalid-credential" ? "Wrong email or password." :
        "Login failed. Check your email and password."
      );
    }
    setLoading(false);
  };

  return (
    <div style={{animation:"slideIn .38s cubic-bezier(.34,1.2,.64,1) both"}}>
      <BackBtn onClick={onBack}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg,#1E1B4B,#4C1D95)",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <i className="fa-solid fa-key" style={{color:"white",fontSize:16}}/>
        </div>
        <div>
          <p style={{fontWeight:900,fontSize:17,color:"#1E1B4B"}}>मकान मालिक Login</p>
          <p style={{fontSize:12,color:"#9CA3AF",marginTop:2}}>Owner Sign In</p>
        </div>
      </div>

      <div style={{background:"white",borderRadius:20,padding:"20px 18px",
        border:`1.5px solid ${BDR}`,boxShadow:"0 8px 32px rgba(30,27,75,.08)"}}>
        <form onSubmit={handleSubmit}>
          <Field label="Email" type="email" value={email} onChange={setEmail}
            placeholder="your@email.com" required autoComplete="email"/>
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder="••••••••" required min={6} autoComplete="current-password"/>
          <ErrBox msg={error}/>
          <PrimaryBtn label="Sign In →" loading={loading} color="violet"/>
        </form>
      </div>

      <p style={{textAlign:"center",fontSize:13,color:"#6B7280",marginTop:16}}>
        नया account?{" "}
        <button type="button" onClick={onSwitchSignup}
          style={{fontWeight:700,color:BRAND,background:"none",border:"none",cursor:"pointer",fontSize:13}}>
          Create Account
        </button>
      </p>
    </div>
  );
}

/* ─── Step 2b: Owner Signup ───────────────────────────────── */
function OwnerSignupStep({ onBack, onSwitchLogin }) {
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const { setUserRole } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Please enter your full name."); return; }
    setLoading(true);
    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // 2. Save owner profile to Firestore
      await addDoc(collection(db, "ownerProfiles"), {
        uid:       cred.user.uid,
        name:      name.trim(),
        email:     email.trim(),
        createdAt: new Date().toISOString(),
      });
      // 3. Persist role + set in context
      localStorage.setItem(`rkp_role_${cred.user.uid}`, "owner");
      setUserRole("owner");
      // 4. New owner → go to onboarding to add buildings
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(
        err.code === "auth/email-already-in-use" ? "Email already in use. Sign in instead." :
        err.code === "auth/weak-password"         ? "Password must be at least 6 characters." :
        err.code === "auth/invalid-email"         ? "Invalid email address." :
        "Signup failed. Please try again."
      );
    }
    setLoading(false);
  };

  return (
    <div style={{animation:"slideIn .38s cubic-bezier(.34,1.2,.64,1) both"}}>
      <BackBtn onClick={onBack}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg,#1E1B4B,#4C1D95)",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <i className="fa-solid fa-user-plus" style={{color:"white",fontSize:16}}/>
        </div>
        <div>
          <p style={{fontWeight:900,fontSize:17,color:"#1E1B4B"}}>Account बनाएं</p>
          <p style={{fontSize:12,color:"#9CA3AF",marginTop:2}}>Create Owner Account</p>
        </div>
      </div>

      <div style={{background:"white",borderRadius:20,padding:"20px 18px",
        border:`1.5px solid ${BDR}`,boxShadow:"0 8px 32px rgba(30,27,75,.08)"}}>
        <form onSubmit={handleSubmit}>
          <Field label="आपका पूरा नाम" value={name} onChange={setName}
            placeholder="Ramesh Sharma" required autoComplete="name"/>
          <Field label="Email" type="email" value={email} onChange={setEmail}
            placeholder="your@email.com" required autoComplete="email"/>
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder="Min 6 characters" required min={6} autoComplete="new-password"/>
          <ErrBox msg={error}/>
          <PrimaryBtn label="Create Account →" loading={loading} color="violet"/>
        </form>
      </div>

      <p style={{textAlign:"center",fontSize:13,color:"#6B7280",marginTop:16}}>
        पहले से account है?{" "}
        <button type="button" onClick={onSwitchLogin}
          style={{fontWeight:700,color:BRAND,background:"none",border:"none",cursor:"pointer",fontSize:13}}>
          Sign In
        </button>
      </p>
    </div>
  );
}

/* ─── Step 2c: Tenant Login ───────────────────────────────── */
function TenantStep({ onBack }) {
  const [phone,   setPhone]   = useState("");
  const [code,    setCode]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const { setUserRole } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async e => {
    e.preventDefault();
    setError("");
    if (phone.length !== 10) { setError("कृपया valid 10-digit WhatsApp number डालें।"); return; }
    if (!code.trim())        { setError("कृपया Connection Code डालें।"); return; }
    setLoading(true);
    try {
      // 1. Find room with this connection code
      const snap = await getDocs(
        query(collection(db, "rooms"), where("connectionCode", "==", code.trim().toUpperCase()))
      );
      if (snap.empty) { setError("❌ Invalid Code! मकान मालिक से सही code लें।"); setLoading(false); return; }

      const roomDoc  = snap.docs[0];
      const roomId   = roomDoc.id;
      const roomData = roomDoc.data();

      // 2. Anonymous sign in
      const cred = await signInAnonymously(auth);
      const tenantUid = cred.user.uid;

      // 3. Link to room
      await updateDoc(doc(db, "rooms", roomId), {
        tenantPhone: phone,
        tenantUid:   tenantUid,
        status:      roomData.status || "pending",
      });

      // 4. Tenant profile
      await setDoc(doc(db, "tenantProfiles", tenantUid),
        { phone, roomId, joinedAt: new Date().toISOString() },
        { merge: true }
      );

      // 5. Persist role
      localStorage.setItem(`rkp_role_${tenantUid}`, "tenant");
      setUserRole("tenant");
      navigate("/tenant", { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{animation:"slideIn .38s cubic-bezier(.34,1.2,.64,1) both"}}>
      <BackBtn onClick={onBack}/>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{width:44,height:44,borderRadius:14,background:"linear-gradient(135deg,#FF6B35,#F5A623)",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <i className="fa-solid fa-house-user" style={{color:"white",fontSize:16}}/>
        </div>
        <div>
          <p style={{fontWeight:900,fontSize:17,color:"#1E1B4B"}}>किरायेदार Login</p>
          <p style={{fontSize:12,color:"#9CA3AF",marginTop:2}}>Tenant Sign In via Code</p>
        </div>
      </div>

      {/* Info banner */}
      <div style={{background:"#FFF7ED",border:"1.5px solid #FED7AA",borderRadius:14,
        padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:8}}>
        <i className="fa-solid fa-circle-info" style={{color:BRAND,marginTop:2,flexShrink:0,fontSize:13}}/>
        <p style={{fontSize:12,color:"#92400E",fontWeight:500,lineHeight:1.5}}>
          अपना <strong>WhatsApp नंबर</strong> और मकान मालिक से मिला <strong>Connection Code</strong> डालें।
        </p>
      </div>

      <div style={{background:"white",borderRadius:20,padding:"20px 18px",
        border:"1.5px solid #FED7AA",boxShadow:"0 8px 32px rgba(255,107,53,.08)"}}>
        <form onSubmit={handleSubmit}>
          <Field label="WhatsApp Number" type="tel" value={phone}
            onChange={v=>setPhone(v.replace(/\D/g,"").slice(0,10))}
            placeholder="10-digit mobile number" required prefix="+91"/>
          <Field label="Connection Code (Room ID)" value={code}
            onChange={v=>setCode(v.toUpperCase().replace(/[^A-Z0-9-]/g,"").slice(0,9))}
            placeholder="RK-A4X9B2" required mono/>
          <ErrBox msg={error}/>
          <PrimaryBtn label="Room Join करें →" loading={loading}/>
        </form>
      </div>
    </div>
  );
}

/* ─── ROOT ────────────────────────────────────────────────── */
export default function LoginView() {
  // step: "role" | "owner_login" | "owner_signup" | "tenant"
  const [step, setStep] = useState(S.ROLE);

  const handleRoleSelect = (role) => {
    if (role === "owner")  setStep(S.OWNER_LOGIN);
    if (role === "tenant") setStep(S.TENANT);
  };

  return (
    <>
      <style>{`
        @keyframes ls { to { transform:rotate(360deg) } }
        @keyframes slideIn {
          from { opacity:0; transform:translateX(30px) }
          to   { opacity:1; transform:translateX(0)    }
        }
        @keyframes logoFloat {
          0%,100% { transform:translateY(0)    rotate(-2deg) }
          50%      { transform:translateY(-10px) rotate(2deg)  }
        }
      `}</style>

      <div style={{width:"100%",height:"100%",overflowY:"auto",overflowX:"hidden",
        background:"linear-gradient(160deg,#FFFBF5 0%,#F5F3FF 60%,#FFFBF5 100%)",
        WebkitOverflowScrolling:"touch"}}>

        <div style={{maxWidth:380,margin:"0 auto",padding:"40px 20px 32px"}}>

          {/* Logo — only show on role step */}
          {step === S.ROLE && (
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:36}}>
              <div style={{position:"relative",marginBottom:14}}>
                <div style={{width:84,height:84,borderRadius:26,
                  background:"linear-gradient(135deg,#FF6B35,#F5A623)",
                  boxShadow:"0 16px 44px rgba(255,107,53,.4)",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  animation:"logoFloat 3.5s ease-in-out infinite"}}>
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
                    stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 10L12 3l9 7"/>
                    <path d="M5 10v11a2 2 0 002 2h10a2 2 0 002-2V10"/>
                    <rect x="8" y="10" width="8" height="10" rx="1"/>
                    <path d="M10 13h4"/><path d="M10 16h4"/>
                  </svg>
                </div>
                <div style={{position:"absolute",top:-5,right:-5,width:26,height:26,
                  borderRadius:"50%",background:"#F5A623",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  boxShadow:"0 3px 10px rgba(245,166,35,.4)"}}>
                  <span style={{color:"white",fontWeight:900,fontSize:13}}>₹</span>
                </div>
              </div>
              <h1 style={{fontSize:32,fontWeight:900,letterSpacing:"-.03em",
                color:"#1E1B4B",lineHeight:1,marginBottom:6}}>
                Room<span style={{color:"#FF6B35"}}>Khata</span>
              </h1>
              <p style={{fontSize:10,fontWeight:700,letterSpacing:".28em",color:"#A0AEC0"}}>
                RENT · TRACK · RELAX
              </p>
              <p style={{fontSize:11,fontWeight:600,color:"#D97706",marginTop:4}}>
                किराया खाता प्रो 🏠
              </p>
            </div>
          )}

          {/* Steps */}
          {step === S.ROLE        && <RoleStep      onSelect={handleRoleSelect} />}
          {step === S.OWNER_LOGIN && <OwnerLoginStep  onBack={()=>setStep(S.ROLE)} onSwitchSignup={()=>setStep(S.OWNER_SIGNUP)} />}
          {step === S.OWNER_SIGNUP&& <OwnerSignupStep onBack={()=>setStep(S.ROLE)} onSwitchLogin={()=>setStep(S.OWNER_LOGIN)} />}
          {step === S.TENANT      && <TenantStep      onBack={()=>setStep(S.ROLE)} />}

        </div>
      </div>
    </>
  );
}
