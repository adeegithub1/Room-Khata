import { initializeApp }  from "firebase/app";
import { getFirestore }   from "firebase/firestore";
import { getAuth }        from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyAp6oj_KE0nxfInqVG44P42pYljKVHKaHo",
  authDomain:        "room-khata-43cd3.firebaseapp.com",
  projectId:         "room-khata-43cd3",
  storageBucket:     "room-khata-43cd3.firebasestorage.app",
  messagingSenderId: "739355882640",
  appId:             "1:739355882640:web:8bd01c7b05d8129fa29415",
  measurementId:     "G-3ZJJ8NGT56",
};

// Initialise Firebase (singleton — safe to import from anywhere)
const firebaseApp = initializeApp(firebaseConfig);

export const db   = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
export default firebaseApp;
