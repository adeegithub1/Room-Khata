// src/views/OnboardingView.jsx
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { collection, addDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useApp } from "../context/AppContext";
import { Field, Button } from "../ui/components";

const ease = [0.22, 1, 0.36, 1];
// One deliberate motion beat: a page-turn between onboarding steps.
const vPage = {
  hidden:  { opacity: 0, x: 32 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease } },
  exit:    { opacity: 0, x: -24, transition: { duration: 0.2, ease } },
};

function mkCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "RK-" + Array.from({ length: 6 }, () => c[Math.floor(Math.random() * 32)]).join("");
}

/* ─── Step 1 — Name ───────────────────────────────────────── */
function Step1({ onNext }) {
  const [name, setName] = useState("");
  return (
    <motion.div variants={vPage} initial="hidden" animate="visible" exit="exit"
      className="w-full max-w-[340px] mx-auto text-center">
      <div className="w-16 h-16 rounded-md bg-ink flex items-center justify-center mx-auto mb-5">
        <i className="fa-solid fa-feather-pointed text-paper-light text-xl" />
      </div>
      <h2 className="font-serif font-semibold text-[24px] text-ink mb-1">नमस्ते</h2>
      <p className="text-[13px] text-ink-soft mb-7">पहला पन्ना खोलते हैं — आपका नाम बताएं</p>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onNext(name.trim()); }} className="text-left">
        <Field label="आपका नाम" value={name} onChange={setName} placeholder="Ramesh Sharma" required />
        <Button type="submit">आगे बढ़ें</Button>
      </form>
    </motion.div>
  );
}

/* ─── Step 2 — Building count ─────────────────────────────── */
function Step2({ ownerName, onNext, onBack }) {
  const [count, setCount] = useState(null);
  return (
    <motion.div variants={vPage} initial="hidden" animate="visible" exit="exit"
      className="w-full max-w-[340px] mx-auto text-center">
      <div className="w-16 h-16 rounded-md bg-brass flex items-center justify-center mx-auto mb-5">
        <i className="fa-solid fa-building text-paper-light text-xl" />
      </div>
      <h2 className="font-serif font-semibold text-[24px] text-ink mb-1">
        बढ़िया, {ownerName.split(" ")[0]}
      </h2>
      <p className="text-[13px] text-ink-soft mb-7">कितनी buildings हैं?</p>

      <div className="grid grid-cols-4 gap-2.5 mb-6">
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" onClick={() => setCount(n)}
            className={[
              "tap py-4 rounded-md font-serif font-semibold text-xl border-[1.5px] transition-colors",
              count === n ? "bg-ink text-paper-light border-ink" : "bg-paper-light text-ink border-rule",
            ].join(" ")}>
            {n === 4 ? "4+" : n}
          </button>
        ))}
      </div>

      <Button onClick={() => count && onNext(count)} disabled={!count}>Continue</Button>
      <button type="button" onClick={onBack} className="mt-3.5 text-ink-soft font-medium text-[13px]">
        ← वापस
      </button>
    </motion.div>
  );
}

/* ─── Step 3 — Add building + rooms ───────────────────────── */
function Step3({ idx, total, authUid, onDone, onBack }) {
  const [bName, setBName] = useState("");
  const [cnt, setCnt] = useState("");
  const [start, setStart] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const go = async (e) => {
    e.preventDefault();
    setErr("");
    const n = parseInt(cnt, 10);
    if (!bName.trim() || !n || n < 1) { setErr("Building name and room count required."); return; }
    setLoading(true);
    try {
      const bRef = await addDoc(collection(db, "buildings"), {
        ownerId: authUid, name: bName.trim(), createdAt: new Date(),
      });
      const s = parseInt(start, 10) || 1;
      await Promise.all(Array.from({ length: n }, (_, i) => addDoc(collection(db, "rooms"), {
        buildingId: bRef.id, ownerId: authUid, roomNo: (s + i).toString(),
        tenantName: "", rent: 0, status: "pending", connectionCode: mkCode(), createdAt: new Date(),
      })));
      setBName(""); setCnt(""); setStart("");
      onDone();
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  return (
    <motion.div key={`s3-${idx}`} variants={vPage} initial="hidden" animate="visible" exit="exit" className="w-full">
      <div className="bg-ink px-5 pt-6 pb-6 rounded-b-lg mb-6">
        <p className="text-[11px] font-medium text-paper-light/50 mb-1">Step {idx + 1} of {total}</p>
        <h2 className="font-serif font-semibold text-[21px] text-paper-light mb-3">
          Building {idx + 1} जोड़ें
        </h2>
        <div className="h-[3px] rounded-full bg-paper-light/15 overflow-hidden">
          <div className="h-full bg-brass transition-all duration-500" style={{ width: `${(idx / total) * 100}%` }} />
        </div>
      </div>

      <div className="px-5">
        <form onSubmit={go}>
          <Field label="Building Name" value={bName} onChange={setBName} placeholder="e.g. Sharma Niwas" required />
          <Field label="Number of Rooms" type="number" value={cnt} onChange={setCnt} placeholder="6" min="1" max="99" required />
          <Field label="Start Room No. (optional)" value={start} onChange={setStart} placeholder="101 → 101, 102, 103…" />
          {err && (
            <div className="border-l-[3px] border-stamp bg-stamp/[0.06] rounded-r-md px-3 py-2.5 mb-3 text-[13px] font-medium text-stamp-2">
              {err}
            </div>
          )}
          <Button type="submit" loading={loading} variant="brass">Rooms जोड़ें</Button>
        </form>
        <div className="flex gap-2.5 mt-3">
          <Button onClick={onBack} variant="outline" full={false} disabled={loading}>
            <span className="flex-1 text-center">वापस</span>
          </Button>
          <Button onClick={onDone} variant="ghost" full={false} disabled={loading}>
            <span className="flex-1 text-center underline decoration-ink-soft/30 underline-offset-4">Skip</span>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export default function OnboardingView() {
  const { authUser, setUserRole } = useApp();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [ownerName, setOwnerName] = useState("");
  const [bldgCount, setBldgCount] = useState(1);
  const [bldgIdx, setBldgIdx] = useState(0);

  const finish = useCallback(() => {
    setUserRole("owner");
    nav("/owner", { replace: true });
  }, [nav, setUserRole]);

  const handleBldgDone = useCallback(() => {
    const next = bldgIdx + 1;
    if (next < bldgCount) setBldgIdx(next);
    else finish();
  }, [bldgIdx, bldgCount, finish]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-paper">
      {step < 3 && (
        <div className="flex justify-center gap-2 pt-12 pb-5">
          {[1, 2, 3].map((i) => (
            <div key={i}
              className={`h-[6px] rounded-full transition-all duration-300 ${i === step ? "w-5" : "w-[6px]"} ${i <= step ? "bg-stamp" : "bg-rule"}`} />
          ))}
        </div>
      )}
      <div className={`flex-1 overflow-y-auto flex flex-col items-center ${step < 3 ? "justify-center px-5 pb-10" : "justify-start"}`}
        style={{ WebkitOverflowScrolling: "touch" }}>
        <AnimatePresence mode="wait">
          {step === 1 && <Step1 key="s1" onNext={(n) => { setOwnerName(n); setStep(2); }} />}
          {step === 2 && <Step2 key="s2" ownerName={ownerName} onNext={(n) => { setBldgCount(n); setStep(3); }} onBack={() => setStep(1)} />}
          {step === 3 && (
            <Step3 key={`s3-${bldgIdx}`} idx={bldgIdx} total={bldgCount}
              authUid={authUser?.uid} onDone={handleBldgDone} onBack={() => setStep(2)} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
