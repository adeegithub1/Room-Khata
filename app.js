import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, query, where, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAp6oj_KE0nxfInqVG44P42pYljKVHKaHo",
  authDomain: "room-khata-43cd3.firebaseapp.com",
  projectId: "room-khata-43cd3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let roomsData = [];
let currentUser = null; 
let magicRoomIdCache = null;
let currentShareLink = ""; 

// ==========================================
// PREMIUM CUSTOM MODALS (NO BROWSER ALERTS)
// ==========================================

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-500 text-white';
    const icon = type === 'success' ? '<i class="fa-solid fa-circle-check text-[#25D366] text-lg"></i>' : '<i class="fa-solid fa-circle-exclamation text-white text-lg"></i>';
    
    toast.className = `${bgClass} px-5 py-4 rounded-2xl shadow-xl text-sm font-bold transform transition-all duration-300 -translate-y-10 opacity-0 flex items-center gap-3 w-full max-w-[350px]`;
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => { toast.classList.remove('-translate-y-10', 'opacity-0'); toast.classList.add('translate-y-0', 'opacity-100'); }, 10);
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100'); toast.classList.add('-translate-y-10', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Custom Promise-based Confirm Modal
window.showConfirm = function(title, message, btnText, isDanger = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm-modal');
        const box = document.getElementById('custom-confirm-box');
        const icon = document.getElementById('confirm-icon');
        const okBtn = document.getElementById('confirm-ok-btn');
        
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-message').innerText = message;
        okBtn.innerText = btnText;

        if(isDanger) {
            icon.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl bg-red-50 text-red-500";
            icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            okBtn.className = "flex-1 py-3.5 bg-red-500 text-white font-bold rounded-xl active:scale-95 transition-all shadow-[0_8px_15px_-5px_rgba(239,68,68,0.5)]";
        } else {
            icon.className = "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl bg-blue-50 text-blue-500";
            icon.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
            okBtn.className = "flex-1 py-3.5 bg-blue-600 text-white font-bold rounded-xl active:scale-95 transition-all shadow-[0_8px_15px_-5px_rgba(37,99,235,0.5)]";
        }

        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-90'); }, 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0'); box.classList.add('scale-90');
            setTimeout(() => { modal.classList.add('hidden'); resolve(val); }, 300);
            // Cleanup listeners
            document.getElementById('confirm-cancel-btn').onclick = null;
            okBtn.onclick = null;
        };

        document.getElementById('confirm-cancel-btn').onclick = () => closeAndResolve(false);
        okBtn.onclick = () => closeAndResolve(true);
    });
}

// Custom Promise-based Prompt Modal
window.showPrompt = function(title, placeholder) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        const box = document.getElementById('custom-prompt-box');
        const input = document.getElementById('prompt-input');
        
        document.getElementById('prompt-title').innerText = title;
        input.placeholder = placeholder;
        input.value = "";

        modal.classList.remove('hidden');
        setTimeout(() => { modal.classList.remove('opacity-0'); box.classList.remove('scale-90'); input.focus(); }, 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0'); box.classList.add('scale-90');
            setTimeout(() => { modal.classList.add('hidden'); resolve(val); }, 300);
            document.getElementById('prompt-cancel-btn').onclick = null;
            document.getElementById('prompt-ok-btn').onclick = null;
        };

        document.getElementById('prompt-cancel-btn').onclick = () => closeAndResolve(null);
        document.getElementById('prompt-ok-btn').onclick = () => {
            if(input.value.trim() === "") showToast("Please enter a value", "error");
            else closeAndResolve(input.value.trim());
        };
    });
}

// Bottom Sheet Logics
window.shareRoomLink = function(roomId, roomNo) {
    currentShareLink = `${window.location.origin}/?room=${roomId}`;
    document.getElementById('share-title').innerText = `Room ${roomNo}`;
    const modal = document.getElementById('share-modal');
    const sheet = document.getElementById('share-sheet');
    modal.classList.remove('hidden');
    setTimeout(() => { modal.classList.remove('opacity-0'); sheet.classList.remove('translate-y-full'); }, 10);
}
window.closeShareModal = function() {
    const modal = document.getElementById('share-modal');
    const sheet = document.getElementById('share-sheet');
    modal.classList.add('opacity-0'); sheet.classList.add('translate-y-full');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}
window.shareViaWhatsAppAction = function() {
    const msg = `Hello! Room Khata app par apni details bhariye. Click here to join:\n${currentShareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    closeShareModal();
}
window.copyShareLinkAction = async function() {
    try { await navigator.clipboard.writeText(currentShareLink); closeShareModal(); showToast("Magic Link Copied!", "success"); } 
    catch (err) { showToast("Failed to copy", "error"); }
}

// ==========================================
// CORE APP ROUTING
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const magicRoomId = urlParams.get('room');

onAuthStateChanged(auth, async (user) => {
    if (magicRoomId) {
        magicRoomIdCache = magicRoomId;
        window.switchView('view-tenant-join');
        try {
            const roomSnap = await getDoc(doc(db, "rooms", magicRoomId));
            if(roomSnap.exists()) document.getElementById('magic-room-display').innerText = `Room ${roomSnap.data().roomNo} • ₹${roomSnap.data().rent}`;
            else showToast("Invalid Invite Link", "error");
        } catch(e) { console.error(e); }
    } else if (user) { currentUser = user; window.switchView('view-owner'); } 
    else { currentUser = null; window.switchView('view-login'); }
});

// ==========================================
// DATA LOGIC
// ==========================================
window.fetchRoomsFromCloud = async function() {
    if (!currentUser) return; 
    try {
        const q = query(collection(db, "rooms"), where("ownerId", "==", currentUser.uid));
        const querySnapshot = await getDocs(q);
        roomsData = []; 
        querySnapshot.forEach((doc) => { let data = doc.data(); data.id = doc.id; roomsData.push(data); });
        
        // Sort by roomNo length, then value for proper ordering
        roomsData.sort((a,b) => a.roomNo.localeCompare(b.roomNo, undefined, {numeric: true}));
        window.renderRooms();
    } catch (error) { showToast(error.message, "error"); }
}

window.renderRooms = function() {
    const listHome = document.getElementById('room-list-home');
    if(!listHome) return; listHome.innerHTML = ''; 

    let totalRev = 0, pendingRev = 0;

    if (roomsData.length === 0) {
        listHome.innerHTML = `
        <div class="text-center py-12 px-6 border-2 border-dashed border-gray-200 rounded-3xl mt-4 bg-gray-50/50">
            <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm text-2xl text-gray-300"><i class="fa-solid fa-house-chimney-blank"></i></div>
            <h4 class="text-gray-900 font-bold mb-1">No Properties Yet</h4>
            <p class="text-sm text-gray-500 font-medium">Add a room to start managing.</p>
        </div>`;
    } else {
        roomsData.forEach((room, index) => {
            const rent = Number(room.rent) || 0;
            const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant';
            const status = room.status || 'pending'; 
            const phone = room.tenantPhone || '';
            
            if (tenantName !== 'Vacant') {
                totalRev += rent;
                if(status === 'pending') pendingRev += rent;
            }

            const isVacant = tenantName === 'Vacant';
            const delay = index * 0.06; 

            let actionButtons = '';
            if (isVacant) {
                // Manually Assign Quick Button (Now uses Custom Prompt)
                actionButtons += `<button onclick="quickAssign('${room.id}', '${room.roomNo}')" class="w-10 h-10 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-90 transition-all flex items-center justify-center mr-2"><i class="fa-solid fa-pencil text-sm"></i></button>`;
                actionButtons += `<button onclick="shareRoomLink('${room.id}', '${room.roomNo}')" class="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-sm border border-blue-100"><i class="fa-solid fa-link mr-1"></i> Invite</button>`;
                actionButtons += `<button onclick="deleteRoom('${room.id}', true)" class="w-10 h-10 rounded-xl text-red-500 hover:bg-red-50 active:scale-90 transition-all flex items-center justify-center ml-2"><i class="fa-solid fa-trash text-sm"></i></button>`;
            } else {
                actionButtons += status === 'pending' ? `<button onclick="sendWhatsApp('${tenantName}', '${phone}', '${rent}')" class="w-10 h-10 rounded-xl text-[#25D366] bg-[#25D366]/10 active:scale-90 transition-all flex items-center justify-center mr-2"><i class="fa-brands fa-whatsapp text-lg"></i></button>` : '';
                actionButtons += `<button onclick="togglePaymentStatus('${room.id}', '${status}')" class="text-[28px] active:scale-75 transition-all ${status === 'pending' ? 'text-gray-200 hover:text-green-500 drop-shadow-sm' : 'text-[#25D366] drop-shadow-md'}"><i class="fa-solid fa-circle-check"></i></button>`;
                actionButtons += `<button onclick="vacateRoom('${room.id}')" class="w-10 h-10 rounded-xl text-gray-400 hover:text-orange-500 hover:bg-orange-50 active:scale-90 transition-all flex items-center justify-center ml-2"><i class="fa-solid fa-person-walking-arrow-right text-sm"></i></button>`;
            }

            const cardHtml = `
            <div class="bg-white p-4 rounded-3xl border border-gray-100 flex items-center justify-between shadow-[0_5px_15px_rgba(0,0,0,0.03)] hover:shadow-[0_10px_25px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all duration-300 room-card-animate" style="animation-delay: ${delay}s">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 ${isVacant ? 'bg-gray-50 text-gray-500' : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'} rounded-2xl flex items-center justify-center font-extrabold text-lg">${room.roomNo}</div>
                    <div>
                        <h4 class="font-bold text-gray-900 text-[15px] mb-0.5">${tenantName}</h4>
                        <p class="text-xs font-semibold text-gray-400">₹${rent}/mo <span class="ml-1 ${isVacant ? 'hidden' : (status === 'pending' ? 'text-orange-500' : 'text-[#25D366]')}">• ${status.toUpperCase()}</span></p>
                    </div>
                </div>
                <div class="flex items-center">${actionButtons}</div>
            </div>`;
            listHome.innerHTML += cardHtml; 
        });
    }

    if(document.getElementById('total-revenue')) document.getElementById('total-revenue').innerText = '₹' + totalRev.toLocaleString('en-IN');
    if(document.getElementById('total-pending')) document.getElementById('total-pending').innerText = '₹' + pendingRev.toLocaleString('en-IN');
}

// ==========================================
// ACTIONS
// ==========================================
window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('view-active'));
    setTimeout(() => { 
        document.getElementById(viewId).classList.add('view-active'); 
        if(viewId === 'view-owner') window.fetchRoomsFromCloud();
    }, 10);
}

window.handleAddRoomSubmit = async function(e) {
    e.preventDefault(); 
    if (!currentUser) return;
    const btn = document.getElementById('add-room-btn');
    const ogText = btn.innerText;
    btn.innerText = "Saving..."; btn.disabled = true;

    const roomNo = document.getElementById('new-room-no').value;
    const rentAmount = document.getElementById('new-rent-amount').value;
    try {
        await addDoc(collection(db, "rooms"), { roomNo, tenantName: "", rent: Number(rentAmount), status: "pending", ownerId: currentUser.uid });
        document.getElementById('add-room-form').reset(); 
        showToast("Room added successfully!", "success");
        window.switchView('view-owner'); 
    } catch (err) { showToast(err.message, "error"); }
    finally { btn.innerText = ogText; btn.disabled = false; }
}

window.deleteRoom = async function(id, isVacant) { 
    if(!isVacant) return showToast("Cannot delete occupied room!", "error");
    
    const isConfirmed = await showConfirm("Delete Property", "Are you sure you want to permanently delete this empty room?", "Delete", true);
    if(isConfirmed) { 
        await deleteDoc(doc(db, "rooms", id)); 
        showToast("Room Deleted", "success");
        window.fetchRoomsFromCloud(); 
    } 
}

window.vacateRoom = async function(id) { 
    const isConfirmed = await showConfirm("Vacate Tenant", "Has the tenant cleared all their dues? This will remove them from the room.", "Yes, Vacate", false);
    if(isConfirmed) { 
        await updateDoc(doc(db, "rooms", id), { tenantName: "", tenantPhone: "", status: "pending" }); 
        showToast("Room is now vacant", "success");
        window.fetchRoomsFromCloud(); 
    } 
}

window.quickAssign = async function(id, roomNo) {
    const name = await showPrompt("Assign Tenant Manually", `Enter name for Room ${roomNo}`);
    if(name) {
        await updateDoc(doc(db, "rooms", id), { tenantName: name, status: "pending" }); 
        showToast("Tenant Assigned", "success");
        window.fetchRoomsFromCloud();
    }
}

window.togglePaymentStatus = async function(id, currentStatus) { 
    await updateDoc(doc(db, "rooms", id), { status: currentStatus === 'pending' ? 'paid' : 'pending' }); 
    window.fetchRoomsFromCloud(); 
}

window.sendWhatsApp = function(name, phone, rent) {
    if(!phone) { showToast("No phone number saved!", "error"); return; }
    const msg = `Hello ${name}, aapka Room Khata rent ₹${rent} baaki hai. Kripya jaldi pay karein. Thank you!`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

window.handleMagicJoinSubmit = async function(e) {
    e.preventDefault();
    if(!magicRoomIdCache) return;
    const btn = document.getElementById('join-room-btn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    const name = document.getElementById('magic-tenant-name').value;
    const phone = document.getElementById('magic-tenant-phone').value;
    
    try {
        await updateDoc(doc(db, "rooms", magicRoomIdCache), { tenantName: name, tenantPhone: phone, status: "pending" });
        showToast("Welcome! You joined successfully.", "success");
        setTimeout(() => { window.location.href = window.location.origin; }, 2000);
    } catch(err) { showToast(err.message, "error"); btn.innerHTML = 'Try Again'; }
}

// AUTH
window.handleLoginSubmit = async function(e) {
    e.preventDefault(); 
    const btn = document.getElementById('login-btn'); btn.innerHTML = "Authenticating...";
    try { await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-password').value); } 
    catch (err) { showToast("Invalid Credentials", "error"); btn.innerHTML = "Access Dashboard"; }
};
window.handleSignup = async function() {
    try { await createUserWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-password').value); showToast("Account Created!", "success");} 
    catch (err) { showToast(err.message, "error"); }
};
window.confirmLogout = async function() {
    const isConfirmed = await showConfirm("Logout", "Are you sure you want to securely logout?", "Logout", true);
    if(isConfirmed) { await signOut(auth); showToast("Logged Out Successfully", "success"); }
};
