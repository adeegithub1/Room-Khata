// src/views/LoginView.jsx
// ─────────────────────────────────────────────────────────────
//  Flow:
//    Step 1 — Role selection (Owner / Tenant)
//    Step 2a (Owner Login)  — email + password sign-in
//    Step 2b (Owner Signup) — name + email + password → creates
//                             ownerProfiles doc (id === uid) → /onboarding
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
  collection, getDocs,
  query, where, updateDoc, setDoc, doc,
} from "firebase/firestore";
import { auth, db } from "../firebase/config";
import { useApp } from "../context/AppContext";
import { Field, Button, ErrorNote, BackLink, TextLink } from "../ui/components";

const S = { ROLE: "role", OWNER_LOGIN: "owner_login", OWNER_SIGNUP: "owner_signup", TENANT: "tenant" };

/* ─── Step 1: Role Selection ──────────────────────────────── */
function RoleStep({ onSelect }) {
  return (
    <div className="animate-fadeUp">
      <p className="text-center text-[13px] font-medium text-ink-soft mb-6">
        आप कौन हैं? / Who are you?
      </p>

      <button
        type="button"
        onClick={() => onSelect("owner")}
        className="tap w-full mb-3 receipt-slip flex items-center gap-4 px-5 py-5 text-left bg-ink border-ink"
      >
        <div className="w-12 h-12 rounded-md bg-paper-light/10 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-key text-paper-light text-lg" />
        </div>
        <div className="flex-1">
          <p className="text-paper-light font-semibold text-[16px] leading-tight">मैं मकान मालिक हूँ</p>
          <p className="text-paper-light/55 text-[12px] mt-0.5">I am an Owner / Landlord</p>
        </div>
        <i className="fa-solid fa-chevron-right text-paper-light/40" />
      </button>

      <button
        type="button"
        onClick={() => onSelect("tenant")}
        className="tap w-full receipt-slip flex items-center gap-4 px-5 py-5 text-left bg-brass border-brass"
      >
        <div className="w-12 h-12 rounded-md bg-paper-light/15 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-house-user text-paper-light text-lg" />
        </div>
        <div className="flex-1">
          <p className="text-paper-light font-semibold text-[16px] leading-tight">मैं किरायेदार हूँ</p>
          <p className="text-paper-light/70 text-[12px] mt-0.5">I am a Tenant / Kirayedaar</p>
        </div>
        <i className="fa-solid fa-chevron-right text-paper-light/50" />
      </button>
    </div>
  );
}

/* ─── Step 2a: Owner Login ────────────────────────────────── */
function OwnerLoginStep({ onBack, onSwitchSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUserRole } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setUserRole("owner");
      navigate("/owner", { replace: true });
    } catch (err) {
      setError(
        err.code === "auth/user-not-found"     ? "No account found. Please sign up." :
        err.code === "auth/wrong-password"      ? "Wrong password. Try again." :
        err.code === "auth/invalid-email"       ? "Invalid email address." :
        err.code === "auth/invalid-credential"  ? "Wrong email or password." :
        "Login failed. Check your email and password."
      );
    }
    setLoading(false);
  };

  return (
    <div className="animate-fadeUp">
      <BackLink onClick={onBack} />
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-md bg-ink flex items-center justify-center shrink-0">
          <i className="fa-solid fa-key text-paper-light text-sm" />
        </div>
        <div>
          <p className="font-serif font-semibold text-[18px] text-ink leading-none">मकान मालिक Login</p>
          <p className="text-[12px] text-ink-soft mt-1">Owner sign in</p>
        </div>
      </div>

      <div className="receipt-slip px-4 pt-4 pb-1">
        <form onSubmit={handleSubmit}>
          <Field label="Email" type="email" value={email} onChange={setEmail}
            placeholder="your@email.com" required autoComplete="email" />
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder="••••••••" required min={6} autoComplete="current-password" />
          <ErrorNote message={error} />
          <Button type="submit" loading={loading}>Sign in</Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-ink-soft mt-4">
        नया account?{" "}
        <TextLink onClick={onSwitchSignup}>Create account</TextLink>
      </p>
    </div>
  );
}

/* ─── Step 2b: Owner Signup ───────────────────────────────── */
function OwnerSignupStep({ onBack, onSwitchLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUserRole } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) { setError("Please enter your full name."); return; }
    setLoading(true);
    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      // 2. Save owner profile — doc ID === UID (matches tenantProfiles pattern,
      //    and is what lets the security rules do a direct-doc check).
      await setDoc(doc(db, "ownerProfiles", cred.user.uid), {
        uid:       cred.user.uid,
        name:      name.trim(),
        email:     email.trim(),
        createdAt: new Date().toISOString(),
      });
      // 3. Set role in context (Firestore is the source of truth on next load)
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
    <div className="animate-fadeUp">
      <BackLink onClick={onBack} />
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-md bg-ink flex items-center justify-center shrink-0">
          <i className="fa-solid fa-user-plus text-paper-light text-sm" />
        </div>
        <div>
          <p className="font-serif font-semibold text-[18px] text-ink leading-none">Account बनाएं</p>
          <p className="text-[12px] text-ink-soft mt-1">Create owner account</p>
        </div>
      </div>

      <div className="receipt-slip px-4 pt-4 pb-1">
        <form onSubmit={handleSubmit}>
          <Field label="आपका पूरा नाम" value={name} onChange={setName}
            placeholder="Ramesh Sharma" required autoComplete="name" />
          <Field label="Email" type="email" value={email} onChange={setEmail}
            placeholder="your@email.com" required autoComplete="email" />
          <Field label="Password" type="password" value={password} onChange={setPassword}
            placeholder="Min 6 characters" required min={6} autoComplete="new-password" />
          <ErrorNote message={error} />
          <Button type="submit" loading={loading}>Create account</Button>
        </form>
      </div>

      <p className="text-center text-[13px] text-ink-soft mt-4">
        पहले से account है?{" "}
        <TextLink onClick={onSwitchLogin}>Sign in</TextLink>
      </p>
    </div>
  );
}

/* ─── Step 2c: Tenant Login ───────────────────────────────── */
function TenantStep({ onBack }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { setUserRole } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim())        { setError("कृपया अपना नाम डालें।"); return; }
    if (phone.length !== 10) { setError("कृपया valid 10-digit WhatsApp number डालें।"); return; }
    if (!code.trim())        { setError("कृपया Connection Code डालें।"); return; }
    setLoading(true);
    try {
      // 1. Sign in anonymously FIRST — Firestore security rules require an
      //    authenticated session to read `rooms`, so auth must exist before
      //    we can query by connectionCode at all.
      const cred      = await signInAnonymously(auth);
      const tenantUid = cred.user.uid;

      // 2. Find room with this connection code (now authenticated)
      const snap = await getDocs(
        query(collection(db, "rooms"), where("connectionCode", "==", code.trim().toUpperCase()))
      );
      if (snap.empty) {
        setError("❌ Invalid Code! मकान मालिक से सही code लें।");
        setLoading(false);
        return;
      }

      const roomDoc  = snap.docs[0];
      const roomId   = roomDoc.id;
      const roomData = roomDoc.data();

      // 2b. Refuse to join a room already claimed by a DIFFERENT tenant —
      //     prevents a leaked/old code from overwriting the current occupant.
      if (roomData.tenantUid && roomData.tenantUid !== tenantUid) {
        setError("यह Room पहले से किसी और तक assign है। मकान मालिक से नया code लें।");
        setLoading(false);
        return;
      }

      // 3. Save tenant profile FIRST (doc id = tenantUid)
      await setDoc(doc(db, "tenantProfiles", tenantUid), {
        phone,
        name:    name.trim(),
        roomId,
        ownerId: roomData.ownerId || "",
        joinedAt: new Date().toISOString(),
      }, { merge: true });

      // 4. Update room — set tenantName so owner dashboard shows room as OCCUPIED
      await updateDoc(doc(db, "rooms", roomId), {
        tenantName:  name.trim(),
        tenantPhone: phone,
        tenantUid:   tenantUid,
        status:      roomData.status === "paid" ? "pending" : (roomData.status || "pending"),
        assignedAt:  new Date().toISOString(),
      });

      // 5. Set role and navigate
      setUserRole("tenant");
      navigate("/tenant", { replace: true });

    } catch (err) {
      console.error("Tenant login error:", err);
      setError(
        err.code === "permission-denied"
          ? "Permission error — Firestore rules deploy करें।"
          : err.message || "Something went wrong. Please try again."
      );
    }
    setLoading(false);
  };

  return (
    <div className="animate-fadeUp">
      <BackLink onClick={onBack} />
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-md bg-brass flex items-center justify-center shrink-0">
          <i className="fa-solid fa-house-user text-paper-light text-sm" />
        </div>
        <div>
          <p className="font-serif font-semibold text-[18px] text-ink leading-none">किरायेदार Login</p>
          <p className="text-[12px] text-ink-soft mt-1">Tenant sign in via code</p>
        </div>
      </div>

      <div className="flex items-start gap-2 border-l-[3px] border-brass bg-brass/[0.08] rounded-r-md px-3 py-2.5 mb-4">
        <i className="fa-solid fa-circle-info text-brass text-[13px] mt-0.5 shrink-0" />
        <p className="text-[12px] text-brass-2 font-medium leading-snug">
          अपना <strong>WhatsApp नंबर</strong> और मकान मालिक से मिला <strong>Connection Code</strong> डालें।
        </p>
      </div>

      <div className="receipt-slip px-4 pt-4 pb-1">
        <form onSubmit={handleSubmit}>
          <Field label="आपका नाम" value={name} onChange={setName}
            placeholder="Ravi Kumar" required />
          <Field label="WhatsApp Number" type="tel" value={phone}
            onChange={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
            placeholder="10-digit mobile number" required prefix="+91" />
          <Field label="Connection Code (Room ID)" value={code}
            onChange={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 9))}
            placeholder="RK-A4X9B2" required mono />
          <ErrorNote message={error} />
          <Button type="submit" loading={loading} variant="brass">Room join करें</Button>
        </form>
      </div>
    </div>
  );
}

/* ─── ROOT ────────────────────────────────────────────────── */
export default function LoginView() {
  const [step, setStep] = useState(S.ROLE);

  const handleRoleSelect = (role) => {
    if (role === "owner")  setStep(S.OWNER_LOGIN);
    if (role === "tenant") setStep(S.TENANT);
  };

  return (
    <div className="w-full h-full overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
      <div className="max-w-[380px] mx-auto px-5 pt-10 pb-8">

        {step === S.ROLE && (
          <div className="flex flex-col items-center mb-9 animate-fadeUp">
            <div className="w-16 h-16 rounded-md bg-stamp flex items-center justify-center mb-3 border-[1.5px] border-stamp-2">
              <span className="font-serif text-white font-bold text-[26px] leading-none">₹</span>
            </div>
            <h1 className="font-serif font-semibold text-[30px] text-ink leading-none tracking-tight">
              Room Khata
            </h1>
            <div className="w-10 h-px bg-rule my-2.5" />
            <p className="text-[13px] text-ink-soft">किराया खाता — rent, tracked simply</p>
          </div>
        )}

        {step === S.ROLE         && <RoleStep        onSelect={handleRoleSelect} />}
        {step === S.OWNER_LOGIN  && <OwnerLoginStep   onBack={() => setStep(S.ROLE)} onSwitchSignup={() => setStep(S.OWNER_SIGNUP)} />}
        {step === S.OWNER_SIGNUP && <OwnerSignupStep  onBack={() => setStep(S.ROLE)} onSwitchLogin={() => setStep(S.OWNER_LOGIN)} />}
        {step === S.TENANT       && <TenantStep       onBack={() => setStep(S.ROLE)} />}

      </div>
    </div>
  );
}
