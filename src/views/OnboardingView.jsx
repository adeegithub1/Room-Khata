// src/views/OnboardingView.jsx
import {useState,useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {motion,AnimatePresence} from "framer-motion";
import {collection,addDoc} from "firebase/firestore";
import {db} from "../firebase/config";
import {useApp} from "../context/AppContext";

const ease=[0.22,1,0.36,1];
const vSlide={hidden:{opacity:0,x:40},visible:{opacity:1,x:0,transition:{duration:.4,ease}},exit:{opacity:0,x:-30,transition:{duration:.25,ease}}};

function mkCode(){
  const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "RK-"+Array.from({length:6},()=>c[Math.floor(Math.random()*32)]).join("");
}

function FInput({label,value,onChange,placeholder,type="text",min,max,required}){
  const [f,setF]=useState(false);
  return <div style={{marginBottom:14}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:700,color:"#6366F1",
      textTransform:"uppercase",letterSpacing:".07em",marginBottom:5}}>{label}{required?" *":""}</label>}
    <input type={type} value={value} placeholder={placeholder} required={required}
      min={min} max={max} onChange={e=>onChange(e.target.value)}
      onFocus={()=>setF(true)} onBlur={()=>setF(false)}
      style={{width:"100%",padding:"13px 14px",borderRadius:14,fontSize:15,fontWeight:500,outline:"none",
        fontFamily:"'Poppins',sans-serif",color:"#18181B",
        background:f?"#fff":"#F5F3FF",border:`1.5px solid ${f?"#6366F1":"#EDE9FE"}`,
        boxShadow:f?"0 0 0 3px rgba(99,102,241,.12)":"none",transition:"all .18s"}}/>
  </div>;
}

function PrimaryBtn({label,loading,onClick,type="submit",color="#6366F1"}){
  return <button type={type} onClick={onClick} disabled={loading}
    style={{width:"100%",padding:"14px",borderRadius:16,border:"none",cursor:"pointer",
      background:`linear-gradient(135deg,${color},${color}dd)`,color:"white",
      fontWeight:800,fontSize:15,fontFamily:"'Poppins',sans-serif",
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      boxShadow:`0 4px 16px ${color}44`,opacity:loading?.5:1,transition:"opacity .2s"}}
    onPointerDown={e=>e.currentTarget.style.transform="scale(.97)"}
    onPointerUp={e=>e.currentTarget.style.transform="scale(1)"}>
    {loading?<><svg style={{width:20,height:20,animation:"spin 1s linear infinite"}} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12"/></svg>Saving…</>:label}
  </button>;
}

/* Step 1 — Name */
function Step1({onNext}){
  const [name,setName]=useState("");
  return <motion.div key="s1" variants={vSlide} initial="hidden" animate="visible" exit="exit"
    style={{width:"100%",maxWidth:360,margin:"0 auto",textAlign:"center"}}>
    <div style={{width:80,height:80,borderRadius:26,background:"linear-gradient(135deg,#6366F1,#4F46E5)",
      boxShadow:"0 12px 36px rgba(99,102,241,.45)",display:"flex",alignItems:"center",
      justifyContent:"center",margin:"0 auto 20px"}}>
      <i className="fa-solid fa-person" style={{fontSize:34,color:"white"}}/>
    </div>
    <h2 style={{fontFamily:"'Nunito',sans-serif",fontSize:26,fontWeight:900,color:"#1E1B4B",marginBottom:6}}>नमस्ते! 🙏</h2>
    <p style={{fontSize:14,color:"#71717A",marginBottom:28}}>Property management शुरू करते हैं</p>
    <form onSubmit={e=>{e.preventDefault();if(name.trim())onNext(name.trim());}}>
      <FInput label="आपका नाम" value={name} onChange={setName} placeholder="Ramesh Sharma" required/>
      <PrimaryBtn label="आगे बढ़ें →" loading={false}/>
    </form>
  </motion.div>;
}

/* Step 2 — Building count */
function Step2({ownerName,onNext,onBack}){
  const [count,setCount]=useState(null);
  return <motion.div key="s2" variants={vSlide} initial="hidden" animate="visible" exit="exit"
    style={{width:"100%",maxWidth:360,margin:"0 auto",textAlign:"center"}}>
    <div style={{width:80,height:80,borderRadius:26,background:"linear-gradient(135deg,#0F9D8B,#0D9488)",
      boxShadow:"0 12px 36px rgba(15,157,139,.4)",display:"flex",alignItems:"center",
      justifyContent:"center",margin:"0 auto 20px"}}>
      <i className="fa-solid fa-building" style={{fontSize:34,color:"white"}}/>
    </div>
    <h2 style={{fontFamily:"'Nunito',sans-serif",fontSize:26,fontWeight:900,color:"#1E1B4B",marginBottom:6}}>
      बढ़िया, <span style={{color:"#6366F1"}}>{ownerName.split(" ")[0]}</span>!
    </h2>
    <p style={{fontSize:14,color:"#71717A",marginBottom:28}}>कितनी buildings हैं?</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
      {[1,2,3,4].map(n=>(
        <button key={n} type="button" onClick={()=>setCount(n)}
          style={{padding:"16px 8px",borderRadius:16,border:"none",cursor:"pointer",
            fontSize:20,fontWeight:900,fontFamily:"'Nunito',sans-serif",
            background:count===n?"linear-gradient(135deg,#6366F1,#4F46E5)":"#F5F3FF",
            color:count===n?"white":"#6366F1",
            boxShadow:count===n?"0 4px 16px rgba(99,102,241,.35)":"none",
            transition:"all .2s"}}>
          {n===4?"4+":n}
        </button>
      ))}
    </div>
    <PrimaryBtn label="Continue" loading={false} onClick={()=>count&&onNext(count)}/>
    <button type="button" onClick={onBack} style={{marginTop:14,background:"none",border:"none",
      cursor:"pointer",color:"#6366F1",fontWeight:700,fontSize:13}}>← वापस</button>
  </motion.div>;
}

/* Step 3 — Add building + rooms */
function Step3({idx,total,authUid,onDone,onBack}){
  const [bName,setBName]=useState(""); const [cnt,setCnt]=useState(""); const [start,setStart]=useState("");
  const [loading,setLoading]=useState(false); const [err,setErr]=useState("");
  const go=async e=>{
    e.preventDefault(); setErr(""); const n=parseInt(cnt,10);
    if(!bName.trim()||!n||n<1){setErr("Name and room count required.");return;}
    setLoading(true);
    try{
      const bRef=await addDoc(collection(db,"buildings"),{ownerId:authUid,name:bName.trim(),createdAt:new Date()});
      const s=parseInt(start,10)||1;
      await Promise.all(Array.from({length:n},(_,i)=>addDoc(collection(db,"rooms"),{
        buildingId:bRef.id,ownerId:authUid,roomNo:(s+i).toString(),tenantName:"",rent:0,
        status:"pending",connectionCode:mkCode(),createdAt:new Date(),
      })));
      setBName("");setCnt("");setStart(""); onDone();
    }catch(e){setErr(e.message);}
    setLoading(false);
  };
  return <motion.div key={`s3-${idx}`} variants={vSlide} initial="hidden" animate="visible" exit="exit"
    style={{width:"100%"}}>
    <div style={{background:"linear-gradient(135deg,#0F9D8B,#047857)",padding:"20px 20px 24px",
      borderRadius:"0 0 24px 24px",marginBottom:20}}>
      <h2 style={{fontFamily:"'Nunito',sans-serif",fontSize:22,fontWeight:900,color:"white",marginBottom:4}}>
        Building {idx+1} जोड़ें 🏠
      </h2>
      <p style={{fontSize:12,color:"rgba(255,255,255,.7)"}}>Step {idx+1} of {total}</p>
      <div style={{marginTop:12,height:3,borderRadius:99,background:"rgba(255,255,255,.2)"}}>
        <div style={{height:"100%",borderRadius:99,background:"white",
          width:`${(idx/total)*100}%`,transition:"width .5s"}}/>
      </div>
    </div>
    <div style={{padding:"0 20px"}}>
      <form onSubmit={go}>
        <FInput label="Building Name" value={bName} onChange={setBName} placeholder="e.g. Sharma Niwas" required/>
        <FInput label="Number of Rooms" type="number" value={cnt} onChange={setCnt} placeholder="6" min="1" max="99" required/>
        <FInput label="Start Room No. (optional)" value={start} onChange={setStart} placeholder="101 → 101, 102, 103…"/>
        {err&&<div style={{background:"#FEE2E2",color:"#991B1B",borderRadius:12,padding:"10px 14px",
          fontSize:13,fontWeight:600,marginBottom:12}}>{err}</div>}
        <PrimaryBtn label="✓ Rooms जोड़ें" loading={loading} color="#0F9D8B"/>
      </form>
      <div style={{display:"flex",gap:10,marginTop:12}}>
        <button type="button" onClick={onBack}
          style={{flex:1,padding:"12px",borderRadius:14,border:"1.5px solid #EDE9FE",
            cursor:"pointer",background:"#F5F3FF",color:"#6366F1",fontWeight:700,fontSize:14}}>
          वापस
        </button>
        <button type="button" onClick={onDone}
          style={{flex:1,padding:"12px",borderRadius:14,border:"none",
            cursor:"pointer",background:"#FEF3C7",color:"#B45309",fontWeight:700,fontSize:14}}>
          Skip
        </button>
      </div>
    </div>
  </motion.div>;
}

export default function OnboardingView(){
  const {authUser,setUserRole}=useApp();
  const nav=useNavigate();
  const [step,setStep]=useState(1);
  const [ownerName,setOwnerName]=useState("");
  const [bldgCount,setBldgCount]=useState(1);
  const [bldgIdx,setBldgIdx]=useState(0);

  const finish=useCallback(()=>{setUserRole("owner");nav("/owner",{replace:true});},[nav,setUserRole]);

  const handleBldgDone=useCallback(()=>{
    const next=bldgIdx+1;
    if(next<bldgCount){setBldgIdx(next);}
    else{finish();}
  },[bldgIdx,bldgCount,finish]);

  return <>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",
      background:"linear-gradient(160deg,#FFFBF5 0%,#F5F3FF 100%)"}}>
      {/* Progress dots */}
      {step<3&&<div style={{display:"flex",justifyContent:"center",gap:8,paddingTop:52,paddingBottom:20}}>
        {[1,2,3].map(i=>(
          <div key={i} style={{height:7,borderRadius:99,transition:"all .3s",
            width:i===step?20:7,
            background:i<=step?"#6366F1":"#DDD6FE"}}/>
        ))}
      </div>}
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:step<3?"center":"flex-start",
        padding:step<3?"0 20px 40px":"0",WebkitOverflowScrolling:"touch"}}>
        <AnimatePresence mode="wait">
          {step===1&&<Step1 key="s1" onNext={n=>{setOwnerName(n);setStep(2);}}/>}
          {step===2&&<Step2 key="s2" ownerName={ownerName} onNext={n=>{setBldgCount(n);setStep(3);}} onBack={()=>setStep(1)}/>}
          {step===3&&<Step3 key={`s3-${bldgIdx}`} idx={bldgIdx} total={bldgCount}
            authUid={authUser?.uid} onDone={handleBldgDone} onBack={()=>setStep(2)}/>}
        </AnimatePresence>
      </div>
    </div>
  </>;
}
