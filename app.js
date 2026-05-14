import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, query, where, getDoc, onSnapshot, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAp6oj_KE0nxfInqVG44P42pYljKVHKaHo",
  authDomain: "room-khata-43cd3.firebaseapp.com",
  projectId: "room-khata-43cd3",
  storageBucket: "room-khata-43cd3.firebasestorage.app",
  messagingSenderId: "739355882640",
  appId: "1:739355882640:web:8bd01c7b05d8129fa29415",
  measurementId: "G-3ZJJ8NGT56"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let roomsData = [];
let currentUser = null;
let magicRoomIdCache = null;
let currentShareLink = "";
let expenses = [];
let paymentHistory = [];
let chartInstances = { revenueChart: null, occupancyChart: null };

// ==========================================
// TENANT DASHBOARD STATE
// ==========================================
let tenantRoomData = null;       // The room doc for the logged-in tenant
let tenantUnsubscribe = null;    // onSnapshot unsubscriber
let selectedComplaintType = '';
let selectedPriority = 'medium';
let tenantRoomId = null;         // room ID the tenant is linked to

// ==========================================
// ONBOARDING STATE
// ==========================================
let onboardingState = {
    ownerName: '',
    buildingCount: 0,
    currentBuildingIndex: 0,
    buildings: []
};

let buildingsData = {}; // { buildingId: { name, rooms: [] } }

// ==========================================
// MONTHLY RESET & RECEIPT STATE
// ==========================================
let monthlyResetState = {
    lastResetMonth: null,
    isResetInProgress: false
};

let receiptState = {
    currentRoom: null,
    currentBuilding: null,
    buildingName: '',
    roomNo: '',
    tenantName: '',
    rent: 0,
    date: new Date()
};

// ==========================================
// FILTER & SEARCH STATE
// ==========================================
let filterState = {
    paymentFilter: 'all', // 'all', 'paid', 'pending'
    searchQuery: '',
    buildingFilter: 'all' // 'all' or specific buildingId
};

// ==========================================
// MONTHLY RESET & DIGITAL RECEIPT LOGIC
// ==========================================

async function checkAndPerformMonthlyReset() {
    if (!currentUser) return;
    
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const storedMonth = localStorage.getItem(`lastResetMonth_${currentUser.uid}`);
    
    // Check if reset needed for this month
    if (storedMonth !== currentMonth) {
        await performMonthlyReset();
        localStorage.setItem(`lastResetMonth_${currentUser.uid}`, currentMonth);
    }
}

async function performMonthlyReset() {
    console.log('🔄 Performing monthly reset...');
    
    try {
        const roomsQuery = query(collection(db, "rooms"), where("ownerId", "==", currentUser.uid));
        const snapshot = await getDocs(roomsQuery);
        
        const batch = [];
        const previousMonthHistory = {
            month: new Date(new Date().setDate(0)).toISOString().slice(0, 7), // Previous month
            records: [],
            timestamp: new Date().toISOString()
        };

        for (const roomDoc of snapshot.docs) {
            const roomData = roomDoc.data();
            
            // Save to history if status was paid
            if (roomData.status === 'paid') {
                previousMonthHistory.records.push({
                    roomId: roomDoc.id,
                    roomNo: roomData.roomNo,
                    tenantName: roomData.tenantName,
                    rent: roomData.rent,
                    status: 'paid',
                    date: new Date().toISOString()
                });
            }
            
            // Reset status to pending
            batch.push(updateDoc(doc(db, "rooms", roomDoc.id), {
                status: 'pending',
                amountPaid: 0,
                balanceDue: roomData.rent || 0,
                electricityBill: 0,
                lastResetDate: new Date().toISOString()
            }));
        }

        // Execute all updates
        await Promise.all(batch);
        
        // Save history if there are records
        if (previousMonthHistory.records.length > 0) {
            await addDoc(collection(db, "paymentHistory"), {
                ownerId: currentUser.uid,
                ...previousMonthHistory
            });
        }
        
        console.log('✅ Monthly reset completed');
        showToast('📅 Monthly reset completed! All statuses reset to Pending.', 'success');
    } catch (err) {
        console.error('Error during monthly reset:', err);
        showToast('Error during monthly reset', 'error');
    }
}

// ==========================================
// DIGITAL RENT RECEIPT
// ==========================================

window.showDigitalReceipt = async function(roomId, buildingId) {
    const room = roomsData.find(r => r.id === roomId);
    if (!room) return;

    const building = buildingsData[buildingId];
    const buildingName = building?.name || 'Building';

    receiptState = {
        currentRoom: roomId,
        currentBuilding: buildingId,
        buildingName: buildingName,
        roomNo: room.roomNo,
        tenantName: room.tenantName || 'Tenant',
        rent: room.rent || 0,
        date: new Date()
    };

    // Create receipt HTML
    const receiptHTML = `
    <div id="receipt-modal" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fadeUp">
        <div id="receipt-content" class="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-scaleIn">
            <!-- Receipt Header -->
            <div class="text-center mb-8 pb-6 border-b-2 border-gray-200">
                <div class="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                    <i class="fa-solid fa-receipt text-2xl text-white"></i>
                </div>
                <h2 class="text-2xl font-black text-gray-900">Payment Receipt</h2>
                <p class="text-gray-500 text-sm mt-2">Digital Receipt</p>
            </div>

            <!-- Building & Room Info -->
            <div class="bg-gray-50 rounded-2xl p-4 mb-6">
                <div class="text-center">
                    <p class="text-gray-600 text-sm font-semibold mb-1">Building</p>
                    <p class="text-xl font-black text-gray-900 mb-3">${buildingName}</p>
                    <div class="border-b border-gray-300 my-3"></div>
                    <p class="text-gray-600 text-sm font-semibold mb-1">Room No.</p>
                    <p class="text-2xl font-black text-blue-600">${room.roomNo}</p>
                </div>
            </div>

            <!-- Tenant Info -->
            <div class="mb-6">
                <div class="flex justify-between items-center mb-4">
                    <span class="text-gray-600 font-semibold">Tenant Name</span>
                    <span class="text-gray-900 font-bold">${room.tenantName}</span>
                </div>
                <div class="flex justify-between items-center mb-4">
                    <span class="text-gray-600 font-semibold">Period</span>
                    <span class="text-gray-900 font-bold">${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
                </div>
                <div class="flex justify-between items-center pb-4 border-b-2 border-dashed border-gray-300">
                    <span class="text-gray-600 font-semibold">Date Paid</span>
                    <span class="text-gray-900 font-bold">${new Date().toLocaleDateString('en-IN')}</span>
                </div>
            </div>

            <!-- Amount -->
            <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 mb-6 text-center border-2 border-green-200">
                <p class="text-gray-600 text-sm font-semibold mb-2">Amount Paid</p>
                <p class="text-4xl font-black text-green-600">₹${room.rent.toLocaleString('en-IN')}</p>
                <p class="text-xs text-green-600 font-bold mt-2">✓ PAYMENT CONFIRMED</p>
            </div>

            <!-- Receipt ID -->
            <div class="text-center mb-6 text-xs">
                <p class="text-gray-500">Receipt ID: <span class="font-mono font-bold text-gray-700">${generateReceiptId()}</span></p>
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-3">
                <button onclick="shareReceiptToWhatsApp()" class="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 rounded-xl active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 btn-premium">
                    <i class="fa-brands fa-whatsapp"></i> Share
                </button>
                <button onclick="downloadReceipt()" class="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl active:scale-95 transition-all btn-premium">
                    <i class="fa-solid fa-download"></i>
                </button>
            </div>

            <!-- Close Button -->
            <button onclick="closeReceipt()" class="w-full mt-4 py-2 text-gray-600 font-semibold hover:text-gray-900 transition-colors">
                Close
            </button>
        </div>
    </div>
    `;

    // Inject into page
    document.body.insertAdjacentHTML('beforeend', receiptHTML);
}

function generateReceiptId() {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `RCP-${timestamp}-${random}`;
}

window.shareReceiptToWhatsApp = function() {
    const receiptText = `
*🏠 RENT PAYMENT RECEIPT*

📍 Building: ${receiptState.buildingName}
🚪 Room No: ${receiptState.roomNo}
👤 Tenant: ${receiptState.tenantName}

💰 Amount Paid: ₹${receiptState.rent.toLocaleString('en-IN')}
📅 Period: ${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
✅ Status: PAID

Thank you for the payment!
    `.trim();

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(receiptText)}`;
    window.open(whatsappUrl, '_blank');
}

// downloadReceipt is defined below (html2pdf implementation)

window.closeReceipt = function() {
    const modal = document.getElementById('receipt-modal');
    if (modal) {
        modal.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => modal.remove(), 300);
    }
}

// ==========================================
// NEW DIGITAL RECEIPT MODAL (Sleek Version)
// ==========================================

window.showDigitalReceiptModal = async function(roomId, buildingId) {
    const room = roomsData.find(r => r.id === roomId);
    if (!room) return;

    const building = buildingsData[buildingId];
    const buildingName = building?.name || 'Building';
    const currentDate = new Date();
    const monthYear = currentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const receiptNo = generateReceiptId();

    // Set receipt modal data
    receiptState = {
        currentRoom: roomId,
        currentBuilding: buildingId,
        buildingName: buildingName,
        roomNo: room.roomNo,
        tenantName: room.tenantName || 'Tenant',
        rent: room.rent || 0,
        date: currentDate,
        receiptNo: receiptNo,
        monthYear: monthYear,
        phone: room.tenantPhone || ''
    };

    // Update modal content
    document.getElementById('receipt-amount').innerText = `₹${room.rent.toLocaleString('en-IN')}`;
    document.getElementById('receipt-month-year').innerText = monthYear;
    document.getElementById('receipt-building').innerText = buildingName;
    document.getElementById('receipt-room').innerText = `Room ${room.roomNo}`;
    document.getElementById('receipt-tenant').innerText = room.tenantName || 'Tenant';
    document.getElementById('receipt-date').innerText = currentDate.toLocaleDateString('en-IN');
    document.getElementById('receipt-number').innerText = receiptNo;

    // Show modal with animation
    const modal = document.getElementById('receipt-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
    }, 10);

    showToast('✓ Receipt Generated!', 'success');
}

window.closeReceiptModal = function() {
    const modal = document.getElementById('receipt-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    }
}

window.shareReceiptWhatsApp = function() {
    if (!receiptState.phone && !receiptState.tenantName) {
        showToast('No contact information available', 'error');
        return;
    }

    const message = `
🏠 *RENT PAYMENT RECEIPT*

Building: ${receiptState.buildingName}
Room No: ${receiptState.roomNo}
Tenant: ${receiptState.tenantName}

💰 Amount Paid: ₹${receiptState.rent.toLocaleString('en-IN')}
📅 Period: ${receiptState.monthYear}
📅 Date: ${receiptState.date.toLocaleDateString('en-IN')}
🎫 Receipt No: ${receiptState.receiptNo}

✓ PAYMENT CONFIRMED

Thank you for the payment! 🙏

Generated by Khata Pro`;

    const encoded = encodeURIComponent(message);
    const whatsappLink = `https://wa.me/?text=${encoded}`;
    window.open(whatsappLink, '_blank');
    showToast('Opening WhatsApp...', 'success');
}

window.downloadReceipt = function() {
    const element = document.getElementById('receipt-content');
    if (!element) {
        showToast('Receipt not found', 'error');
        return;
    }

    const filename = `receipt-room-${receiptState.roomNo || 'unknown'}.pdf`;

    const opt = {
        margin:      [8, 8, 8, 8],            // top, left, bottom, right in mm
        filename:    filename,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale:           2,                // 2× for retina-sharp output
            useCORS:         true,
            logging:         false,
            backgroundColor: '#ffffff'
        },
        jsPDF: {
            unit:        'mm',
            format:      'a5',                 // A5 fits a receipt perfectly
            orientation: 'portrait'
        }
    };

    // Disable the button while rendering to prevent double-clicks
    const btn = event?.target?.closest('button');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

    html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(() => {
            showToast(`📄 receipt-room-${receiptState.roomNo}.pdf downloaded!`, 'success');
        })
        .catch(err => {
            console.error('html2pdf error:', err);
            showToast('PDF generation failed. Try Ctrl+P to print instead.', 'error');
        })
        .finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-download"></i>'; }
        });
}

// ==========================================
// PREMIUM TOAST NOTIFICATIONS
// ==========================================

window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white' : 'bg-gradient-to-r from-red-500 to-red-600 text-white';
    const icon = type === 'success' ? '<i class="fa-solid fa-circle-check text-white text-lg"></i>' : '<i class="fa-solid fa-circle-exclamation text-white text-lg"></i>';
    
    toast.className = `${bgClass} px-6 py-4 rounded-2xl shadow-2xl text-sm font-bold transform transition-all duration-300 flex items-center gap-3 w-full max-w-[380px] toast`;
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => toast.remove(), 4000);
}

// ==========================================
// PREMIUM CUSTOM MODALS
// ==========================================

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
            icon.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl bg-red-100 text-red-600";
            icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            okBtn.className = "flex-1 py-3 bg-red-600 text-white font-bold rounded-xl active:scale-95 transition-all shadow-lg hover:bg-red-700";
        } else {
            icon.className = "w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl bg-blue-100 text-blue-600";
            icon.innerHTML = '<i class="fa-solid fa-circle-question"></i>';
            okBtn.className = "flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl active:scale-95 transition-all shadow-lg hover:bg-blue-700";
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0');
            setTimeout(() => { 
                modal.classList.add('hidden'); 
                modal.classList.remove('flex');
                resolve(val); 
            }, 300);
            document.getElementById('confirm-cancel-btn').onclick = null;
            okBtn.onclick = null;
        };

        document.getElementById('confirm-cancel-btn').onclick = () => closeAndResolve(false);
        okBtn.onclick = () => closeAndResolve(true);
    });
}

window.showPrompt = function(title, placeholder) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt-modal');
        const box = document.getElementById('custom-prompt-box');
        const input = document.getElementById('prompt-input');
        
        document.getElementById('prompt-title').innerText = title;
        input.placeholder = placeholder;
        input.value = "";

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => { modal.classList.remove('opacity-0'); input.focus(); }, 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0');
            setTimeout(() => { 
                modal.classList.add('hidden'); 
                modal.classList.remove('flex');
                resolve(val); 
            }, 300);
            document.getElementById('prompt-cancel-btn').onclick = null;
            document.getElementById('prompt-ok-btn').onclick = null;
        };

        document.getElementById('prompt-cancel-btn').onclick = () => closeAndResolve(null);
        document.getElementById('prompt-ok-btn').onclick = () => {
            if(input.value.trim() === "") showToast("Please enter a value", "error");
            else closeAndResolve(input.value.trim());
        };

        input.addEventListener('keypress', (e) => {
            if(e.key === 'Enter' && input.value.trim() !== "") closeAndResolve(input.value.trim());
        });
    });
}

// ==========================================
// SHARE MODAL
// ==========================================

window.shareRoomLink = async function(roomId, roomNo) {
    // Try in-memory cache first; fall back to Firestore fetch
    let room = roomsData.find(r => r.id === roomId);
    if (!room || !room.connectionCode) {
        try {
            const snap = await getDoc(doc(db, 'rooms', roomId));
            if (snap.exists()) room = { id: snap.id, ...snap.data() };
        } catch (e) { /* ignore */ }
    }
    const code = room?.connectionCode || '';

    // If room still has no code, generate and persist one now
    if (!code) {
        const newCode = window.generateRoomCode();
        try { await updateDoc(doc(db, 'rooms', roomId), { connectionCode: newCode }); } catch (e) { /* ignore */ }
        if (room) room.connectionCode = newCode;
    }

    const finalCode = room?.connectionCode || '(code not set)';
    currentShareLink = `${window.location.origin}/?room=${roomId}`;

    // ── Issue 1 Fix: WhatsApp message that includes the Connection Code ──────
    const msg =
`🏠 *Room Khata Pro* – Tenant Invite

Namaste! 🙏

Aapko *Room ${roomNo}* ke liye invite kiya gaya hai.

Neeche diye steps follow karein:
1️⃣ App kholein: ${window.location.origin}
2️⃣ "मैं किरायेदार हूँ" button dabayein
3️⃣ Apna WhatsApp number aur yeh *Connection Code* dalein:

🔑 Code: *${finalCode}*

_Room Khata Pro – Rent · Track · Relax_`;

    // Open share bottom-sheet but pre-set WA message so both buttons work
    window._pendingShareMsg = msg;
    document.getElementById('share-title').innerText = `Room ${roomNo}`;
    document.getElementById('share-code-display').textContent = finalCode;
    document.getElementById('share-code-block').classList.remove('hidden');

    const modal = document.getElementById('share-modal');
    const sheet = document.getElementById('share-sheet');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { modal.classList.remove('opacity-0'); sheet.classList.remove('translate-y-full'); }, 10);
}

window.closeShareModal = function() {
    const modal = document.getElementById('share-modal');
    const sheet = document.getElementById('share-sheet');
    modal.classList.add('opacity-0');
    sheet.classList.add('translate-y-full');
    setTimeout(() => { 
        modal.classList.add('hidden'); 
        modal.classList.remove('flex');
        document.getElementById('share-code-block').classList.add('hidden');
    }, 300);
}

window.shareViaWhatsAppAction = function() {
    const msg = window._pendingShareMsg ||
        `🏠 Join my Room Khata app!\n${currentShareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    closeShareModal();
}

window.copyShareLinkAction = async function() {
    const room = roomsData.find(r => currentShareLink.includes(r.id));
    const code = room?.connectionCode || '';
    const textToCopy = code
        ? `Room Khata Pro Connection Code: ${code}\nApp: ${currentShareLink}`
        : currentShareLink;
    try { 
        await navigator.clipboard.writeText(textToCopy); 
        closeShareModal(); 
        showToast("✨ Code + Link Copied!", "success"); 
    } catch (err) { 
        showToast("Failed to copy", "error"); 
    }
}

// ==========================================
// ONBOARDING FLOW
// ==========================================

window.handleOnboardingStep1 = function(e) {
    e.preventDefault();
    const ownerName = document.getElementById('owner-name').value.trim();
    
    if (!ownerName) {
        showToast("Please enter your name", "error");
        return;
    }

    onboardingState.ownerName = ownerName;
    
    // Animate transition to step 2
    const step1 = document.getElementById('onboarding-step-1');
    step1.classList.add('onboarding-slide-exit');
    
    setTimeout(() => {
        step1.classList.add('hidden');
        document.getElementById('onboarding-name-display').innerText = ownerName.split(' ')[0];
        
        const step2 = document.getElementById('onboarding-step-2');
        step2.classList.remove('hidden');
        step2.classList.add('onboarding-slide-enter');
    }, 300);
}

window.selectBuildingCount = function(count) {
    const btn = document.querySelector(`[data-count="${count === 4 ? '4' : count}"]`);
    document.querySelectorAll('.building-count-btn').forEach(b => {
        b.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
        b.classList.add('bg-gray-100');
    });
    
    btn.classList.remove('bg-gray-100');
    btn.classList.add('bg-blue-500', 'text-white', 'border-blue-500');
    
    document.getElementById('building-count').value = count === 4 ? 4 : count;
    document.getElementById('buildings-submit').disabled = false;
    
    showToast(`${count === 4 ? '4 or more' : count} building${count !== 1 ? 's' : ''} selected!`, 'success');
}

window.handleOnboardingStep2 = function(e) {
    e.preventDefault();
    const count = parseInt(document.getElementById('building-count').value);
    
    if (!count || count < 1) {
        showToast("Please select number of buildings", "error");
        return;
    }

    onboardingState.buildingCount = count;
    onboardingState.buildings = Array(count).fill(null).map((_, i) => ({ name: '', rooms: 0 }));
    
    // Animate to step 3
    const step2 = document.getElementById('onboarding-step-2');
    step2.classList.add('onboarding-slide-exit');
    
    setTimeout(() => {
        step2.classList.add('hidden');
        
        document.getElementById('current-building').innerText = 1;
        document.getElementById('total-buildings').innerText = count;
        
        const step3 = document.getElementById('onboarding-step-3');
        step3.classList.remove('hidden');
        step3.classList.add('onboarding-slide-enter');
        
        document.getElementById('building-name').focus();
    }, 300);
}

window.handleAddBuildingRoom = async function(e) {
    e.preventDefault();
    
    const buildingName = document.getElementById('building-name').value.trim();
    const roomCount = parseInt(document.getElementById('building-rooms-count').value);
    const startNumber = document.getElementById('building-start-number').value.trim() || '101';
    
    if (!buildingName || !roomCount) {
        showToast("Please fill all fields", "error");
        return;
    }

    const currentIndex = onboardingState.currentBuildingIndex;
    
    try {
        // Create building first
        const buildingRef = await addDoc(collection(db, "buildings"), {
            ownerId: currentUser.uid,
            name: buildingName,
            createdAt: new Date()
        });

        const buildingId = buildingRef.id;
        
        // Create rooms for this building
        for (let i = 0; i < roomCount; i++) {
            const roomNumber = parseInt(startNumber) + i;
            await addDoc(collection(db, "rooms"), {
                buildingId: buildingId,
                roomNo: roomNumber.toString(),
                tenantName: "",
                rent: 0,
                status: "pending",
                ownerId: currentUser.uid,
                connectionCode: generateConnectionCode(),
                createdAt: new Date()
            });
        }

        showToast(`✓ ${buildingName} added with ${roomCount} rooms!`, "success");
        
        // Move to next building or finish
        onboardingState.currentBuildingIndex++;
        
        if (onboardingState.currentBuildingIndex < onboardingState.buildingCount) {
            // Reset form and show next building
            document.getElementById('onboarding-building-form').reset();
            document.getElementById('current-building').innerText = onboardingState.currentBuildingIndex + 1;
            document.getElementById('building-name').focus();
        } else {
            // Finish onboarding
            finishOnboarding();
        }
    } catch (err) {
        showToast("Error creating building: " + err.message, "error");
    }
}

window.skipAddingMoreRooms = function() {
    finishOnboarding();
}

window.previousOnboardingStep = function() {
    const currentStep = document.querySelector('.onboarding-step:not(.hidden)');
    const step = parseInt(currentStep.id.match(/\d+/)[0]);
    
    if (step === 2) {
        const step2 = document.getElementById('onboarding-step-2');
        const step1 = document.getElementById('onboarding-step-1');
        
        step2.classList.add('onboarding-slide-exit');
        setTimeout(() => {
            step2.classList.add('hidden');
            step1.classList.remove('hidden');
            step1.classList.add('onboarding-slide-enter');
        }, 300);
    } else if (step === 3) {
        const step3 = document.getElementById('onboarding-step-3');
        const step2 = document.getElementById('onboarding-step-2');
        
        step3.classList.add('onboarding-slide-exit');
        setTimeout(() => {
            step3.classList.add('hidden');
            onboardingState.currentBuildingIndex = 0;
            step2.classList.remove('hidden');
            step2.classList.add('onboarding-slide-enter');
            
            // Reset building count selection
            document.querySelectorAll('.building-count-btn').forEach(b => {
                b.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
                b.classList.add('bg-gray-100');
            });
            document.getElementById('buildings-submit').disabled = true;
        }, 300);
    }
}

function finishOnboarding() {
    const step3 = document.getElementById('onboarding-step-3');
    step3.classList.add('onboarding-slide-exit');
    
    setTimeout(() => {
        onboardingState = {
            ownerName: '',
            buildingCount: 0,
            currentBuildingIndex: 0,
            buildings: []
        };
        
        showToast("🎉 Onboarding complete! Welcome to Khata Pro", "success");
        window.fetchRoomsFromCloud();
        window.switchView('view-owner');
    }, 600);
}

// ==========================================
// CORE APP ROUTING
// ==========================================

const urlParams = new URLSearchParams(window.location.search);
const magicRoomId = urlParams.get('room');

// Feature 1: Cached owner profile
let ownerProfile = { name: '', address: '', upiId: '' };

async function loadOwnerProfile(uid) {
    try {
        // Try setDoc path first (keyed by uid directly)
        const directSnap = await getDoc(doc(db, "ownerProfiles", uid));
        if (directSnap.exists()) {
            const d = directSnap.data();
            ownerProfile = { name: d.name || '', address: d.address || '', upiId: d.upiId || '' };
            return;
        }
        // Fallback: legacy addDoc path
        const q = query(collection(db, "ownerProfiles"), where("uid", "==", uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const d = snap.docs[0].data();
            ownerProfile = { name: d.name || '', address: d.address || '', upiId: d.upiId || '' };
        }
    } catch (e) {
        console.warn("Could not load owner profile:", e);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (magicRoomId) {
        magicRoomIdCache = magicRoomId;
        window.switchView('view-tenant-join');
        try {
            const roomSnap = await getDoc(doc(db, "rooms", magicRoomId));
            if (roomSnap.exists()) {
                document.getElementById('magic-room-display').innerText = `Room ${roomSnap.data().roomNo}`;
            }
        } catch (err) {
            console.error("Error loading room:", err);
        }
    } else if (user) {
        currentUser = user;

        // ── ROLE-BASED ROUTING ──────────────────────────
        // Check if this user is a tenant (has a room linked to their UID)
        const tenantRoomQuery = query(collection(db, "rooms"), where("tenantUid", "==", user.uid));
        const tenantRoomSnap = await getDocs(tenantRoomQuery);

        if (!tenantRoomSnap.empty) {
            // ✅ TENANT ROUTE
            tenantRoomId = tenantRoomSnap.docs[0].id;
            window.switchView('view-tenant-dashboard');
            subscribeToTenantRoom(tenantRoomId);
            return;
        }

        // ── OWNER ROUTE ──────────────────────────────────
        await loadOwnerProfile(user.uid);

        const buildingsQuery = query(collection(db, "buildings"), where("ownerId", "==", user.uid));
        const buildingsSnap = await getDocs(buildingsQuery);
        
        if (buildingsSnap.empty) {
            window.switchView('view-onboarding');
        } else {
            window.switchView('view-owner');
            window.fetchRoomsFromCloud();
        }

        // Start real-time complaints + verifications inbox right after login
        subscribeToOwnerInbox();
        applyTimeBasedHeader();
        initHeaderScrollCollapse();
    } else {
        currentUser = null;
        ownerProfile = { name: '', address: '' };
        // Tear down any live tenant subscription on logout
        if (tenantUnsubscribe) { tenantUnsubscribe(); tenantUnsubscribe = null; }
        window.switchView('view-login');
    }
});

// ==========================================
// FETCH & RENDER
// ==========================================

window.fetchRoomsFromCloud = async function() {
    if(!currentUser) return;
    
    // Check for monthly reset
    await checkAndPerformMonthlyReset();
    
    // Fetch rooms
    const roomsQuery = query(collection(db, "rooms"), where("ownerId", "==", currentUser.uid));
    const roomsSnapshot = await getDocs(roomsQuery);
    roomsData = roomsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Fetch buildings
    const buildingsQuery = query(collection(db, "buildings"), where("ownerId", "==", currentUser.uid));
    const buildingsSnapshot = await getDocs(buildingsQuery);
    buildingsData = {};
    buildingsSnapshot.docs.forEach(d => {
        buildingsData[d.id] = { id: d.id, ...d.data() };
    });
    
    window.renderRoomsList();
    window.renderTenantsList();
    window.renderPaymentsList();
    
    updateAnalytics();
}

window.renderRoomsList = function() {
    const container = document.getElementById('buildings-container');
    
    // Apply filters first
    const filteredRooms = applyFilters(roomsData);
    
    if (filteredRooms.length === 0) {
        if (roomsData.length === 0) {
            container.innerHTML = `
            <div class="empty-state pt-8 text-center">
                <div class="empty-icon text-6xl text-gray-300 mb-4"><i class="fa-regular fa-building"></i></div>
                <p class="text-gray-500 font-medium text-lg">No buildings yet</p>
                <p class="text-gray-400 text-sm mt-1">Click "+ Add Building" to get started</p>
            </div>`;
        } else {
            container.innerHTML = `
            <div class="empty-state pt-8 text-center">
                <div class="empty-icon text-6xl text-gray-300 mb-4"><i class="fa-solid fa-filter"></i></div>
                <p class="text-gray-500 font-medium text-lg">No results found</p>
                <p class="text-gray-400 text-sm mt-1">Try adjusting your search or filters</p>
            </div>`;
        }
        if(document.getElementById('clear-search-btn')) {
            document.getElementById('clear-search-btn').classList.add('hidden');
        }
        return;
    }
    
    container.innerHTML = '';
    
    // Update search visibility
    if (filterState.searchQuery) {
        document.getElementById('clear-search-btn').classList.remove('hidden');
    } else {
        document.getElementById('clear-search-btn').classList.add('hidden');
    }
    
    // Group rooms by building
    const groupedByBuilding = {};
    let totalRev = 0, pendingRev = 0;
    
    filteredRooms.forEach(room => {
        const buildingId = room.buildingId || 'no-building';
        if (!groupedByBuilding[buildingId]) {
            groupedByBuilding[buildingId] = [];
        }
        groupedByBuilding[buildingId].push(room);
        
        const rent = room.rent || 0;
        const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant';
        if (tenantName !== 'Vacant') {
            totalRev += (room.amountPaid || 0);
            if(room.status === 'pending' || room.status === 'partial') pendingRev += (room.balanceDue || rent);
        }
    });

    // ── Collect ALL building HTML first, inject once (anti-flicker) ──────────
    const allBuildingParts = [];

    // Render each building group
    Object.entries(groupedByBuilding).forEach(([buildingId, rooms]) => {
        const bName = getBuildingName(buildingId);
        const roomCardsHTML = rooms.map((room) => {
                    const rent = room.rent || 0;
                    const electricityBill = room.electricityBill || 0;
                    const totalDue = rent + electricityBill;
                    const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant';
                    const status = room.status || 'pending';
                    const isVacant = tenantName === 'Vacant';
                    const initials = tenantName === 'Vacant' ? '?' : tenantName.split(' ').map(n => n[0]).join('').substring(0, 2);
                    const balanceDue = room.balanceDue || 0;
                    const securityDeposit = room.securityDeposit || 0;
                    const isPartial = status === 'partial';
                    const isPendingVerify = status === 'pending_verification';

                    // ── Status badge ──────────────────────────────────────────
                    let statusBadge = '';
                    if (isVacant) {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg">Vacant</span>';
                    } else if (status === 'paid') {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg">✓ Paid</span>';
                    } else if (isPendingVerify) {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-lg badge-pulse">👀 Verify</span>';
                    } else if (isPartial) {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">⟳ Partial</span>';
                    } else {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-lg">⏳ Pending</span>';
                    }

                    // ── Card border colour ─────────────────────────────────────
                    const borderColor = isVacant          ? 'border-gray-200'
                        : status === 'paid'               ? 'border-green-200'
                        : isPendingVerify                 ? 'border-purple-300'
                        : isPartial                       ? 'border-blue-200'
                        :                                   'border-orange-200';

                    // ── Avatar bg ─────────────────────────────────────────────
                    const avatarBg = isVacant     ? 'bg-gradient-to-br from-gray-200 to-gray-300'
                        : isPendingVerify          ? 'bg-gradient-to-br from-purple-500 to-purple-700'
                        :                            'bg-gradient-to-br from-blue-500 to-indigo-600';
                    const avatarContent = isVacant
                        ? '<i class="fa-solid fa-door-open text-2xl opacity-50"></i>'
                        : isPendingVerify ? '👀' : initials;

                    // ── Verification meta ──────────────────────────────────────
                    const verifyAmount  = room.paymentAmount || room.rent || 0;
                    const verifyApp     = room.paymentApp || 'UPI';
                    const verifyTimeStr = room.paymentInitiatedAt ? getTimeAgo(new Date(room.paymentInitiatedAt)) : '';

                    return `
                    <div class="room-card-grid bg-white rounded-2xl p-3 relative overflow-hidden" style="border:1.5px solid ${isVacant ? '#ECEEF4' : status === 'paid' ? '#BBF7D0' : isPendingVerify ? '#DDD6FE' : isPartial ? '#BFDBFE' : '#FED7AA'}">

                        <!-- Top-right edit/delete icons -->
                        <div class="absolute top-2 right-2 flex gap-1 z-10">
                            <button onclick="event.stopPropagation(); openEditRoom('${room.id}', '${room.roomNo}', ${rent})" class="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-90" style="background:var(--surface2)">
                                <i class="fa-solid fa-pencil text-[9px]" style="color:var(--text-secondary)"></i>
                            </button>
                            ${isVacant ? `<button onclick="event.stopPropagation(); deleteRoom('${room.id}', true)" class="w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-90" style="background:#FEF2F2">
                                <i class="fa-solid fa-trash text-[9px] text-red-500"></i>
                            </button>` : ''}
                        </div>

                        <!-- Avatar -->
                        <div class="w-full mb-2.5">
                            <div class="w-full aspect-square rounded-2xl flex items-center justify-center font-black text-xl shadow-sm ${avatarBg}" style="color:white">
                                ${avatarContent}
                            </div>
                        </div>

                        <!-- Room number + name -->
                        <div class="text-center mb-1.5">
                            <p class="text-sm font-black" style="color:var(--text-primary)">Room ${room.roomNo}</p>
                            <p class="text-[11px] font-semibold truncate" style="color:var(--text-muted)">${tenantName}</p>
                        </div>

                        <!-- Security deposit -->
                        ${securityDeposit > 0 ? `<div class="text-center mb-1">
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style="background:#F3E8FF;color:#7C3AED">🔒 ₹${securityDeposit.toLocaleString('en-IN')}</span>
                        </div>` : ''}

                        <!-- Electricity -->
                        ${electricityBill > 0 ? `<div class="text-center mb-1">
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style="background:#FEFCE8;color:#CA8A04">⚡ +₹${electricityBill.toLocaleString('en-IN')}</span>
                        </div>` : ''}

                        <!-- Rent total -->
                        <div class="text-center pb-1.5 mb-1.5" style="border-bottom:1.5px solid var(--border)">
                            <p class="text-[10px]" style="color:var(--text-muted)">Rent${electricityBill > 0 ? '+Elec' : ''}</p>
                            <p class="text-sm font-black" style="color:var(--text-primary)">₹${totalDue.toLocaleString('en-IN')}</p>
                        </div>

                        <!-- Balance due -->
                        ${(isPartial && balanceDue > 0) ? `<div class="text-center mb-1">
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style="background:#FEE2E2;color:#991B1B">Due ₹${balanceDue.toLocaleString('en-IN')}</span>
                        </div>` : ''}

                        <!-- Verify meta -->
                        ${isPendingVerify ? `<div class="text-center mb-1">
                            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style="background:#F3E8FF;color:#7C3AED">via ${verifyApp}${verifyTimeStr ? ' · ' + verifyTimeStr : ''}</span>
                        </div>` : ''}

                        <!-- Status badge -->
                        <div class="text-center mb-2">${statusBadge}</div>

                        <!-- Action buttons -->
                        ${!isVacant ? `
                        <div class="flex flex-col gap-1">
                            ${isPendingVerify ? `
                            <button onclick="approvePaymentVerification('${room.id}', ${verifyAmount})" class="w-full py-1.5 text-white text-[10px] font-black rounded-xl transition-all active:scale-95 btn-premium" style="background:linear-gradient(135deg,#7C3AED,#6D28D9)">
                                ✓ Verify
                            </button>
                            <button onclick="rejectPaymentVerification('${room.id}')" class="w-full py-1.5 text-[10px] font-bold rounded-xl transition-all active:scale-95" style="background:var(--surface2);color:var(--text-secondary)">
                                ✗ Reject
                            </button>
                            ` : `
                            <button onclick="togglePaymentStatus('${room.id}','${status}')" class="w-full py-1.5 text-[10px] font-black rounded-xl transition-all active:scale-95 btn-premium" style="background:${status === 'paid' ? 'linear-gradient(135deg,#F59E0B,#D97706)' : 'linear-gradient(135deg,#22C55E,#16A34A)'};color:white">
                                ${status === 'paid' ? '⏳ Undo' : '₹ Receive'}
                            </button>
                            <button onclick="openElectricityModal('${room.id}', '${room.roomNo}')" class="w-full py-1.5 text-[10px] font-bold rounded-xl transition-all active:scale-95" style="background:#FEFCE8;color:#CA8A04;border:1.5px solid #FEF08A">
                                ⚡ Bill
                            </button>
                            `}
                        </div>
                        ` : `
                        <div class="flex gap-1">
                            <button onclick="quickAssign('${room.id}', '${room.roomNo}')" class="flex-1 py-1.5 text-[10px] font-bold rounded-xl transition-all active:scale-95" style="background:rgba(45,27,105,.08);color:var(--indigo)">
                                + Assign
                            </button>
                            <button onclick="shareRoomLink('${room.id}', '${room.roomNo}')" class="flex-1 py-1.5 text-[10px] font-black rounded-xl transition-all active:scale-95 btn-premium" style="background:linear-gradient(135deg,#FF6600,#F59E0B);color:white">
                                🔗 Invite
                            </button>
                        </div>
                        `}
                    </div>
                    `;
        }).join('');

        allBuildingParts.push(`
        <div class="building-card">
            <!-- Building Header Pill (light premium) -->
            <div class="building-header-pill p-4 mb-3">
                <div class="flex justify-between items-center">
                    <div class="flex items-center gap-3 flex-1 min-w-0">
                        <!-- Icon -->
                        <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
                             style="background:linear-gradient(135deg,#2D1B69,#6D28D9)">
                            <i class="fa-solid fa-building text-white text-base"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="text-[10px] font-bold uppercase tracking-wider" style="color:var(--text-muted)">Building</p>
                            <h3 class="text-lg font-black truncate" style="color:var(--text-primary)">${bName}</h3>
                        </div>
                    </div>
                    <!-- Actions -->
                    <div class="flex items-center gap-1.5 ml-2 shrink-0">
                        ${buildingId !== 'no-building' ? `
                        <button onclick="openEditBuilding('${buildingId}','${bName}')" class="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90" style="background:var(--surface2);border:1.5px solid var(--border)" title="Rename">
                            <i class="fa-solid fa-pencil text-[10px]" style="color:var(--text-secondary)"></i>
                        </button>
                        <button onclick="deleteBuilding('${buildingId}')" class="w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90" style="background:#FEF2F2;border:1.5px solid #FECACA" title="Delete">
                            <i class="fa-solid fa-trash text-[10px] text-red-500"></i>
                        </button>
                        <button onclick="addNewRoom('${buildingId}')" class="h-8 px-2.5 rounded-xl flex items-center gap-1 text-[10px] font-black transition-all active:scale-90 text-white btn-premium" style="background:linear-gradient(135deg,#FF6600,#F59E0B);box-shadow:0 3px 10px rgba(255,102,0,.25)" title="Add Room">
                            <i class="fa-solid fa-plus text-[9px]"></i> Room
                        </button>
                        ` : ''}
                    </div>
                </div>
                <!-- Stats strip -->
                <div class="flex gap-3 mt-3 pt-3" style="border-top:1.5px solid var(--border)">
                    <div class="flex items-center gap-1.5">
                        <div class="w-5 h-5 rounded-lg flex items-center justify-center" style="background:#F0FDF4">
                            <i class="fa-solid fa-door-closed text-[8px] text-green-600"></i>
                        </div>
                        <div>
                            <p class="text-[9px] font-bold uppercase tracking-wider" style="color:var(--text-muted)">Occupied</p>
                            <p class="text-sm font-black" style="color:var(--text-primary)">${rooms.filter(r => r.tenantName?.trim()).length}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <div class="w-5 h-5 rounded-lg flex items-center justify-center" style="background:#FFF7ED">
                            <i class="fa-solid fa-door-open text-[8px]" style="color:var(--saffron)"></i>
                        </div>
                        <div>
                            <p class="text-[9px] font-bold uppercase tracking-wider" style="color:var(--text-muted)">Vacant</p>
                            <p class="text-sm font-black" style="color:var(--text-primary)">${rooms.filter(r => !r.tenantName?.trim()).length}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 ml-auto">
                        <div class="w-5 h-5 rounded-lg flex items-center justify-center" style="background:rgba(45,27,105,.1)">
                            <i class="fa-solid fa-layer-group text-[8px]" style="color:var(--indigo)"></i>
                        </div>
                        <div>
                            <p class="text-[9px] font-bold uppercase tracking-wider" style="color:var(--text-muted)">Total</p>
                            <p class="text-sm font-black" style="color:var(--text-primary)">${rooms.length}</p>
                        </div>
                    </div>
                </div>
            </div>
            <div class="room-grid">${roomCardsHTML}</div>
        </div>
        `);
    });

    // ── Single DOM write — no flicker ────────────────────────────────────────
    container.innerHTML = allBuildingParts.join('');

    if(document.getElementById('total-revenue')) document.getElementById('total-revenue').innerText = '₹' + totalRev.toLocaleString('en-IN');
    if(document.getElementById('total-pending')) document.getElementById('total-pending').innerText = '₹' + pendingRev.toLocaleString('en-IN');
    updateMiniRevenue('₹' + totalRev.toLocaleString('en-IN'));
}

// Helper function to get building name synchronously from in-memory cache
function getBuildingName(buildingId) {
    if (buildingId === 'no-building') return 'Uncategorized';
    if (buildingsData[buildingId]) return buildingsData[buildingId].name;
    return 'Building';
}

window.selectRoom = function(roomId, roomNo) {
    // Can be used for room details view
    showToast(`Room ${roomNo} selected`, 'success');
}

window.renderTenantsList = function() {
    const list = document.getElementById('tenants-list');
    if (!list) return;
    
    const tenants = roomsData.filter(r => r.tenantName && r.tenantName.trim() !== '');
    
    if (tenants.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-users"></i></div>
            <p class="text-gray-500 font-medium">No tenants yet</p>
        </div>`;
        return;
    }
    
    list.innerHTML = tenants.map((room, i) => `
    <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all fade-in-delay" style="animation-delay: ${i * 0.1}s">
        <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3 flex-1">
                <div class="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-full flex items-center justify-center font-bold">
                    ${room.tenantName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <p class="font-bold text-gray-900">${room.tenantName}</p>
                    <p class="text-xs text-gray-500">Room ${room.roomNo}</p>
                </div>
            </div>
            <span class="text-xs font-bold ${room.status === 'paid' ? 'text-green-600 bg-green-50' : 'text-orange-600 bg-orange-50'} px-2.5 py-1 rounded-lg">${room.status.toUpperCase()}</span>
        </div>
        <div class="flex gap-2">
            <button onclick="sendWhatsApp('${room.tenantName}', '${room.tenantPhone}', '${room.rent}')" class="flex-1 py-2 bg-green-50 text-green-600 font-bold text-xs rounded-lg hover:bg-green-100 transition-all active:scale-95 btn-premium">
                <i class="fa-brands fa-whatsapp mr-1"></i>Message
            </button>
            <button onclick="vacateRoom('${room.id}')" class="flex-1 py-2 bg-red-50 text-red-600 font-bold text-xs rounded-lg hover:bg-red-100 transition-all active:scale-95 btn-premium">
                <i class="fa-solid fa-sign-out mr-1"></i>Vacate
            </button>
        </div>
    </div>
    `).join('');
}

window.renderPaymentsList = function(filter = 'all') {
    const list = document.getElementById('payments-list');
    if (!list) return;
    
    const payments = roomsData
        .filter(r => r.tenantName && r.tenantName.trim() !== '')
        .filter(r => filter === 'all' || r.status === filter)
        .map(r => ({
            roomNo: r.roomNo,
            tenant: r.tenantName,
            amount: r.rent,
            status: r.status,
            date: new Date().toLocaleDateString('en-IN')
        }));
    
    if (payments.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-wallet"></i></div>
            <p class="text-gray-500 font-medium">No ${filter !== 'all' ? filter : ''} payments</p>
        </div>`;
        return;
    }
    
    list.innerHTML = payments.map((p, i) => `
    <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all payment-status-${p.status} fade-in-delay" style="animation-delay: ${i * 0.1}s">
        <div class="flex items-center justify-between">
            <div>
                <p class="font-bold text-gray-900">Room ${p.roomNo}</p>
                <p class="text-sm text-gray-600">${p.tenant}</p>
                <p class="text-xs text-gray-500 mt-1">₹${p.amount}</p>
            </div>
            <div class="text-right">
                <span class="text-sm font-bold ${p.status === 'paid' ? 'text-green-600' : 'text-orange-600'} block mb-2">
                    ${p.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                </span>
                <p class="text-xs text-gray-500">${p.date}</p>
            </div>
        </div>
    </div>
    `).join('');
}

// ==========================================
// ANALYTICS & CHARTS
// ==========================================

async function updateAnalytics() {
    const canvas1 = document.getElementById('revenueChart');
    const canvas2 = document.getElementById('occupancyChart');
    
    if (!canvas1 || !canvas2) return;

    // ── Real occupancy numbers ───────────────────────────────────────────────
    const occupied = roomsData.filter(r => r.tenantName && r.tenantName.trim() !== '').length;
    const vacant   = roomsData.length - occupied;

    // ── Real 6-month revenue trend from paymentHistory ───────────────────────
    // Build an array of the last 6 calendar months (oldest → newest)
    const monthLabels = [];
    const monthKeys   = []; // "YYYY-MM" strings used as bucket keys
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        monthLabels.push(d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));
        monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Initialise revenue buckets to 0
    const revenueBuckets = Object.fromEntries(monthKeys.map(k => [k, 0]));

    // Add amountPaid from rooms that are currently marked paid/partial (current month)
    const currentMonthKey = monthKeys[5]; // last entry = this month
    roomsData.forEach(r => {
        if ((r.status === 'paid' || r.status === 'partial') && r.amountPaid > 0) {
            revenueBuckets[currentMonthKey] = (revenueBuckets[currentMonthKey] || 0) + (r.amountPaid || 0);
        }
    });

    // Pull historical paid records from Firestore paymentHistory collection
    try {
        if (currentUser) {
            const histQ = query(
                collection(db, "paymentHistory"),
                where("ownerId", "==", currentUser.uid)
            );
            const histSnap = await getDocs(histQ);
            histSnap.docs.forEach(d => {
                const data = d.data();
                // Only count fully-paid records; skip pending_verification noise
                if (data.status !== 'paid' && data.status !== 'partial') return;
                const paidDate = data.paidDate || data.timestamp;
                if (!paidDate) return;
                const dt = new Date(paidDate);
                const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
                if (revenueBuckets.hasOwnProperty(key)) {
                    revenueBuckets[key] += Number(data.amount) || 0;
                }
            });
        }
    } catch (err) {
        console.warn("Could not load paymentHistory for analytics:", err);
    }

    const revenueData = monthKeys.map(k => revenueBuckets[k]);

    // ── Revenue Chart ────────────────────────────────────────────────────────
    if (chartInstances.revenueChart) chartInstances.revenueChart.destroy();
    chartInstances.revenueChart = new Chart(canvas1, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Revenue (₹)',
                data: revenueData,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { font: { weight: 'bold', size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ₹${ctx.parsed.y.toLocaleString('en-IN')}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        callback: v => '₹' + Number(v).toLocaleString('en-IN')
                    }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    // ── Occupancy Chart ──────────────────────────────────────────────────────
    if (chartInstances.occupancyChart) chartInstances.occupancyChart.destroy();
    chartInstances.occupancyChart = new Chart(canvas2, {
        type: 'doughnut',
        data: {
            labels: ['Occupied', 'Vacant'],
            datasets: [{
                data: [occupied, vacant],
                backgroundColor: ['#10b981', '#ef4444'],
                borderColor: '#fff',
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { font: { weight: 'bold', size: 12 } }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} room${ctx.parsed !== 1 ? 's' : ''}`
                    }
                }
            }
        }
    });
}

// ==========================================
// ACTIONS
// ==========================================

// ── Views that are "sub-pages" — pressing back should return to owner dashboard
const PUSHSTATE_VIEWS = new Set([
    'view-tenants', 'view-payments', 'view-settings', 'view-analytics',
    'view-tenant-dashboard', 'view-onboarding'
]);
// Track current view so popstate knows where to go back from
let _currentViewId = 'view-login';

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('view-active'));
    setTimeout(() => {
        const view = document.getElementById(viewId);
        if (view) view.classList.add('view-active');
        
        if(viewId === 'view-owner') window.fetchRoomsFromCloud();
        if(viewId === 'view-analytics') { setTimeout(updateAnalytics, 300); window.fetchExpenses(); }
        if(viewId === 'view-settings') window.fetchExpenses();
        
        // Update navbar
        document.querySelectorAll('.navbar-item').forEach(item => item.classList.remove('active'));
        if(viewId === 'view-owner')    document.querySelectorAll('.navbar-item')[0].classList.add('active');
        if(viewId === 'view-tenants')  document.querySelectorAll('.navbar-item')[1].classList.add('active');
        if(viewId === 'view-payments') document.querySelectorAll('.navbar-item')[2].classList.add('active');
        if(viewId === 'view-settings') document.querySelectorAll('.navbar-item')[3].classList.add('active');

        // ── Issue 2: Push a history entry so physical back works correctly ──
        const prevView = _currentViewId;
        _currentViewId = viewId;

        if (viewId === 'view-owner') {
            // Always reset to a clean home state
            window.history.replaceState({ view: 'view-owner' }, '', window.location.pathname);
        } else if (PUSHSTATE_VIEWS.has(viewId)) {
            window.history.pushState({ view: viewId, returnTo: prevView }, '', window.location.pathname);
        }
    }, 10);
}

window.handleAddRoomSubmit = async function(e) {
    e.preventDefault();
    if (!currentUser) return;
    
    const btn = document.getElementById('add-room-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Saving...';
    btn.disabled = true;

    const roomNo = document.getElementById('new-room-no').value;
    const rentAmount = document.getElementById('new-rent-amount').value;
    const maintenance = document.getElementById('new-maintenance').value || 0;
    
    try {
        await addDoc(collection(db, "rooms"), {
            roomNo,
            tenantName: "",
            rent: Number(rentAmount),
            maintenance: Number(maintenance),
            status: "pending",
            ownerId: currentUser.uid,
            connectionCode: generateConnectionCode(),
            createdAt: new Date()
        });
        
        document.getElementById('add-room-form').reset();
        showToast("🎉 Property added successfully!", "success");
        window.switchView('view-owner');
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btn.innerHTML = ogHTML;
        btn.disabled = false;
    }
}

window.deleteRoom = async function(id, isVacant) {
    if(!isVacant) return showToast("Cannot delete occupied property!", "error");
    
    const isConfirmed = await showConfirm("Delete Property", "Are you sure? This action cannot be undone.", "Delete", true);
    if(isConfirmed) {
        try {
            await deleteDoc(doc(db, "rooms", id));
            showToast("🗑️ Property deleted", "success");
            window.fetchRoomsFromCloud();
        } catch(err) {
            showToast(err.message, "error");
        }
    }
}

window.vacateRoom = async function(id) {
    const isConfirmed = await showConfirm("Vacate Tenant", "Clear all dues and vacate this tenant?", "Yes, Vacate", false);
    if(isConfirmed) {
        try {
            await updateDoc(doc(db, "rooms", id), {
                tenantName: "",
                tenantPhone: "",
                status: "pending"
            });
            showToast("📤 Room is now vacant", "success");
            window.fetchRoomsFromCloud();
        } catch(err) {
            showToast(err.message, "error");
        }
    }
}

// ==========================================
// FEATURE 2: TENANT KYC & DEPOSIT MODAL
// ==========================================

let kycRoomId = null;

window.quickAssign = function(id, roomNo) {
    kycRoomId = id;
    document.getElementById('kyc-room-label').innerText = `Room ${roomNo}`;
    document.getElementById('kyc-name').value = '';
    document.getElementById('kyc-phone').value = '';
    document.getElementById('kyc-movein').value = new Date().toISOString().slice(0, 10);
    document.getElementById('kyc-deposit').value = '';
    document.getElementById('kyc-idproof').value = '';
    
    const modal = document.getElementById('kyc-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeKycModal = function() {
    const modal = document.getElementById('kyc-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    kycRoomId = null;
}

window.submitKyc = async function() {
    const name = document.getElementById('kyc-name').value.trim();
    const phone = document.getElementById('kyc-phone').value.trim();
    const movein = document.getElementById('kyc-movein').value;
    const deposit = parseFloat(document.getElementById('kyc-deposit').value) || 0;
    const idproof = document.getElementById('kyc-idproof').value.trim();

    if (!name || !phone) {
        showToast("Name and WhatsApp number are required", "error");
        return;
    }

    try {
        // Generate a fresh connection code every time a new tenant is assigned
        const newCode = generateConnectionCode();
        await updateDoc(doc(db, "rooms", kycRoomId), {
            tenantName: name,
            tenantPhone: phone,
            moveInDate: movein,
            securityDeposit: deposit,
            idProof: idproof,
            connectionCode: newCode,
            status: "pending"
        });
        showToast(`👤 Tenant assigned! Code: ${newCode}`, "success");
        closeKycModal();
        window.fetchRoomsFromCloud();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ==========================================
// FEATURE 1: PARTIAL PAYMENTS & BALANCE TRACKING
// ==========================================

let partialPaymentRoomId = null;

window.togglePaymentStatus = async function(id, currentStatus) {
    const room = roomsData.find(r => r.id === id);
    if (!room) return;

    // If marking as pending (reverting), just toggle back
    if (currentStatus === 'paid') {
        try {
            await updateDoc(doc(db, "rooms", id), {
                status: 'pending',
                amountPaid: 0,
                balanceDue: room.rent || 0,
                paidDate: null
            });
            showToast('⏳ Marked as pending', "success");
            window.fetchRoomsFromCloud();
        } catch (err) {
            showToast(err.message, "error");
        }
        return;
    }

    // Open partial payment modal
    partialPaymentRoomId = id;
    const totalRent = (room.rent || 0) + (room.electricityBill || 0);
    document.getElementById('pp-total-rent').innerText = `₹${totalRent.toLocaleString('en-IN')}`;
    document.getElementById('pp-amount-input').value = totalRent;
    
    const modal = document.getElementById('partial-payment-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closePartialPaymentModal = function() {
    const modal = document.getElementById('partial-payment-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    partialPaymentRoomId = null;
}

window.confirmPartialPayment = async function() {
    const room = roomsData.find(r => r.id === partialPaymentRoomId);
    if (!room) return;

    const totalRent = (room.rent || 0) + (room.electricityBill || 0);
    const amountPaid = parseFloat(document.getElementById('pp-amount-input').value) || 0;

    if (amountPaid <= 0) {
        showToast("Please enter a valid amount", "error");
        return;
    }

    const balanceDue = Math.max(0, totalRent - amountPaid);
    const newStatus = balanceDue === 0 ? 'paid' : 'partial';
    const buildingId = room.buildingId || 'no-building';

    try {
        await updateDoc(doc(db, "rooms", partialPaymentRoomId), {
            status: newStatus,
            amountPaid: amountPaid,
            balanceDue: balanceDue,
            paidDate: new Date().toISOString(),
            electricityBill: 0 // clear electricity bill after payment
        });

        closePartialPaymentModal();

        if (balanceDue > 0) {
            showToast(`✓ ₹${amountPaid.toLocaleString('en-IN')} received. Balance: ₹${balanceDue.toLocaleString('en-IN')}`, "success");
        } else {
            showToast('✓ Full payment received!', "success");
            setTimeout(() => window.showDigitalReceiptModal(partialPaymentRoomId || room.id, buildingId), 500);
        }

        window.fetchRoomsFromCloud();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window.sendWhatsApp = function(name, phone, rent) {
    if(!phone) {
        showToast("No phone number saved!", "error");
        return;
    }
    const msg = `Hi ${name}! 👋\n\nYour rent of ₹${rent} is due. Please make the payment at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

window.handleMagicJoinSubmit = async function(e) {
    e.preventDefault();
    if(!magicRoomIdCache) return;
    
    const btn = document.getElementById('join-room-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Processing...';
    
    const name = document.getElementById('magic-tenant-name').value.trim();
    const phone = document.getElementById('magic-tenant-phone').value.trim();
    
    if (!name || !phone) {
        showToast("Name and number are required", "error");
        btn.innerHTML = ogHTML;
        return;
    }

    try {
        // Step 1: Create / sign-in anonymous account for tenant so they have a UID
        let tenantUid = null;
        if (currentUser) {
            tenantUid = currentUser.uid;
        } else {
            // Create Firebase anonymous auth session for the tenant
            const cred = await signInAnonymously(auth);
            tenantUid = cred.user.uid;
        }

        // Step 2: Save tenant info + link UID to the room
        await updateDoc(doc(db, "rooms", magicRoomIdCache), {
            tenantName: name,
            tenantPhone: phone,
            tenantUid: tenantUid,   // ← THE KEY LINK
            status: "pending"
        });

        // Step 3: Save a lightweight tenant profile
        await setDoc(doc(db, "tenantProfiles", tenantUid), {
            name: name,
            phone: phone,
            roomId: magicRoomIdCache,
            joinedAt: new Date().toISOString()
        }, { merge: true });
        
        showToast("🎉 Welcome! You've joined successfully.", "success");
        // onAuthStateChanged will now detect tenantUid and route to tenant dashboard
        setTimeout(() => { window.location.href = window.location.origin; }, 1500);
    } catch(err) {
        showToast(err.message, "error");
        btn.innerHTML = ogHTML;
    }
}

// ==========================================
// AUTHENTICATION
// ==========================================

window.handleLoginSubmit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Signing in...';
    
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-password').value);
        showToast("✓ Welcome back!", "success");
    } catch (err) {
        showToast("Invalid email or password", "error");
        btn.innerHTML = ogHTML;
    }
}

// Feature 1: Full Signup with Name & Address saved to Firestore
window.handleSignupSubmit = async function(e) {
    e.preventDefault();
    const btn = document.getElementById('signup-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Creating...';
    btn.disabled = true;

    const name    = document.getElementById('signup-name').value.trim();
    const address = document.getElementById('signup-address').value.trim();
    const email   = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    if (!name || !email || !password) {
        showToast("Name, email and password are required", "error");
        btn.innerHTML = ogHTML;
        btn.disabled = false;
        return;
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // Save profile to Firestore
        await addDoc(collection(db, "ownerProfiles"), {
            uid: cred.user.uid,
            name: name,
            address: address,
            email: email,
            createdAt: new Date().toISOString()
        });
        showToast(`🎉 Welcome, ${name}! Account created.`, "success");
        // onAuthStateChanged will route to onboarding automatically
    } catch (err) {
        showToast(err.message, "error");
        btn.innerHTML = ogHTML;
        btn.disabled = false;
    }
}

// Legacy shim – now just switches to signup view
window.handleSignup = function() {
    window.switchView('view-signup');
}

// ==========================================
// LOGIN PANEL SWITCHER (Role-based login UI)
// ==========================================

window.showLoginPanel = function(panel) {
    const rolePanel   = document.getElementById('login-role-panel');
    const ownerPanel  = document.getElementById('login-owner-panel');
    const tenantPanel = document.getElementById('login-tenant-panel');

    // Hide all
    [rolePanel, ownerPanel, tenantPanel].forEach(p => { if(p) p.classList.add('hidden'); });

    if (panel === 'owner') {
        ownerPanel.classList.remove('hidden');
        ownerPanel.classList.add('login-panel-enter-right');
        setTimeout(() => ownerPanel.classList.remove('login-panel-enter-right'), 500);
        document.getElementById('auth-email')?.focus();
    } else if (panel === 'tenant') {
        tenantPanel.classList.remove('hidden');
        tenantPanel.classList.add('login-panel-enter-right');
        setTimeout(() => tenantPanel.classList.remove('login-panel-enter-right'), 500);
        document.getElementById('tenant-login-phone')?.focus();
        // Clear any previous error
        hideTenantLoginError();
    } else {
        // role selection
        rolePanel.classList.remove('hidden');
        rolePanel.classList.add('login-panel-enter-left');
        setTimeout(() => rolePanel.classList.remove('login-panel-enter-left'), 500);
    }
};

function hideTenantLoginError() {
    const err = document.getElementById('tenant-login-error');
    if (err) err.classList.add('hidden');
}
function showTenantLoginError(msg) {
    const err = document.getElementById('tenant-login-error');
    const txt = document.getElementById('tenant-login-error-text');
    if (err && txt) { txt.textContent = msg; err.classList.remove('hidden'); }
}

// ==========================================
// CONNECTION CODE GENERATOR
// ==========================================

function generateConnectionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars (0/O, 1/I)
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `RK-${code}`;
}

// 6-char alphanumeric room code (exposed globally)
window.generateRoomCode = function() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `RK-${code}`;
};

// Add a single new room to an existing building from the Owner Dashboard
window.addNewRoom = async function(buildingId) {
    if (!currentUser) return;
    const roomNo = await showPrompt('New Room Number', 'e.g. 105');
    if (!roomNo) return;
    const rentStr = await showPrompt('Monthly Rent (₹)', 'e.g. 5000');
    const rent = parseInt(rentStr) || 0;
    try {
        await addDoc(collection(db, 'rooms'), {
            buildingId: buildingId || null,
            ownerId: currentUser.uid,
            roomNo,
            rent,
            tenantName: '',
            status: 'pending',
            connectionCode: window.generateRoomCode(),
            createdAt: new Date().toISOString()
        });
        showToast(`🎉 Room ${roomNo} added!`, 'success');
        window.fetchRoomsFromCloud();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
};

// ==========================================
// TENANT CODE LOGIN
// ==========================================

window.handleTenantCodeLoginSubmit = async function(e) {
    e.preventDefault();
    const phone = document.getElementById('tenant-login-phone').value.trim();
    const code  = document.getElementById('tenant-login-code').value.trim().toUpperCase();

    if (!phone || phone.length !== 10) {
        showTenantLoginError('कृपया valid 10-digit WhatsApp number डालें।');
        return;
    }
    if (!code) {
        showTenantLoginError('कृपया Connection Code डालें।');
        return;
    }

    const btn = document.getElementById('tenant-login-btn');
    const ogHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner mr-2"></span> Verifying...';
    btn.disabled = true;
    hideTenantLoginError();

    try {
        await handleTenantCodeLogin(phone, code);
    } catch(err) {
        btn.innerHTML = ogHTML;
        btn.disabled = false;
    }
};

async function handleTenantCodeLogin(phone, code) {
    // Step 1: Query Firestore for a room with matching connectionCode
    const roomQuery = query(collection(db, "rooms"), where("connectionCode", "==", code));
    const roomSnap  = await getDocs(roomQuery);

    if (roomSnap.empty) {
        showTenantLoginError('❌ Invalid Code! मकान मालिक से सही code लें।');
        const btn = document.getElementById('tenant-login-btn');
        if (btn) { btn.innerHTML = '<span>Room Join करें</span><i class="fa-solid fa-right-to-bracket ml-2"></i>'; btn.disabled = false; }
        return;
    }

    const roomDoc  = roomSnap.docs[0];
    const roomId   = roomDoc.id;
    const roomData = roomDoc.data();

    // Step 2: Anonymous Firebase Auth
    let tenantUid = null;
    if (currentUser) {
        tenantUid = currentUser.uid;
    } else {
        const cred = await signInAnonymously(auth);
        tenantUid  = cred.user.uid;
    }

    // Step 3: Update the room with tenant's WhatsApp & UID
    await updateDoc(doc(db, "rooms", roomId), {
        tenantPhone : phone,
        tenantUid   : tenantUid,
        status      : roomData.status || "pending"
    });

    // Step 4: Save a lightweight tenant profile
    await setDoc(doc(db, "tenantProfiles", tenantUid), {
        phone    : phone,
        roomId   : roomId,
        joinedAt : new Date().toISOString()
    }, { merge: true });

    showToast(`🎉 स्वागत है! Room ${roomData.roomNo} join हो गया।`, "success");

    // onAuthStateChanged will pick up the UID and route to tenant dashboard
    tenantRoomId = roomId;
    window.switchView('view-tenant-dashboard');
    subscribeToTenantRoom(roomId);
}

window.confirmLogout = async function() {
    const isConfirmed = await showConfirm("Logout", "Are you sure you want to logout?", "Yes, Logout", true);
    if(isConfirmed) {
        try {
            await signOut(auth);
            showToast("👋 Logged out successfully", "success");
        } catch(err) {
            showToast(err.message, "error");
        }
    }
}

// ==========================================
// NEW FEATURES
// ==========================================

// ── Fetch all expenses from Firestore and re-render ──────────────────────
window.fetchExpenses = async function() {
    if (!currentUser) return;
    try {
        const q = query(
            collection(db, "expenses"),
            where("ownerId", "==", currentUser.uid),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderExpenses();
    } catch (err) {
        console.error("fetchExpenses error:", err);
        showToast("Could not load expenses", "error");
    }
}

window.addExpense = async function() {
    if (!currentUser) return;

    const category = await showPrompt("Add Expense", "Category (Maintenance, Repair, etc.)");
    if (!category) return;

    const amount = await showPrompt("Expense Amount", "Amount (₹)");
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        showToast("Please enter a valid amount", "error");
        return;
    }

    try {
        const docRef = await addDoc(collection(db, "expenses"), {
            ownerId: currentUser.uid,
            category,
            amount: Number(amount),
            date: new Date().toLocaleDateString('en-IN'),
            createdAt: new Date().toISOString()
        });

        // Optimistically add to local array so UI updates instantly
        expenses.unshift({
            id: docRef.id,
            ownerId: currentUser.uid,
            category,
            amount: Number(amount),
            date: new Date().toLocaleDateString('en-IN'),
            createdAt: new Date().toISOString()
        });

        showToast("💰 Expense saved!", "success");
        renderExpenses();
    } catch (err) {
        showToast("Error saving expense: " + err.message, "error");
    }
}

function renderExpenses() {
    const list = document.getElementById('expenses-list');
    if(!list) return;
    
    if(expenses.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <div class="empty-icon"><i class="fa-solid fa-receipt"></i></div>
            <p class="text-gray-500 font-medium">No expenses recorded</p>
        </div>`;
        return;
    }
    
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    list.innerHTML = `
        <div class="bg-red-50 p-4 rounded-2xl border border-red-200 mb-4">
            <p class="text-xs font-bold text-red-600 uppercase mb-1">Total Expenses</p>
            <p class="text-3xl font-black text-red-600 stat-number">₹${total.toLocaleString('en-IN')}</p>
        </div>
        ${expenses.map((e, i) => `
        <div class="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all expense-item fade-in-delay" style="animation-delay: ${i * 0.1}s">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <i class="fa-solid fa-receipt text-red-600"></i>
                    </div>
                    <div>
                        <p class="font-bold text-gray-900">${e.category}</p>
                        <p class="text-xs text-gray-500">${e.date}</p>
                    </div>
                </div>
                <button onclick="deleteExpense(${e.id})" class="w-8 h-8 rounded-lg text-red-500 hover:bg-red-50 transition-all flex items-center justify-center btn-premium">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </div>
            <div class="mt-2 text-right">
                <p class="text-lg font-black text-red-600 stat-number">-₹${e.amount}</p>
            </div>
        </div>
        `).join('')}
    `;
}

window.deleteExpense = async function(id) {
    if (!currentUser) return;
    try {
        await deleteDoc(doc(db, "expenses", id));
        expenses = expenses.filter(e => e.id !== id);
        showToast("Expense deleted", "success");
        renderExpenses();
    } catch (err) {
        showToast("Error deleting expense: " + err.message, "error");
    }
}

window.filterPayments = function(filter) {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('opacity-50', btn.getAttribute('data-filter') !== filter);
    });
    window.renderPaymentsList(filter);
}

window.exportMonthlyReport = function() {
    const report = `
Room Khata - Monthly Report
Generated: ${new Date().toLocaleDateString('en-IN')}

PROPERTIES SUMMARY
==================
Total Properties: ${roomsData.length}
Occupied: ${roomsData.filter(r => r.tenantName?.trim()).length}
Vacant: ${roomsData.length - roomsData.filter(r => r.tenantName?.trim()).length}

REVENUE SUMMARY
==================
Total Expected Revenue: ₹${roomsData.reduce((sum, r) => sum + r.rent, 0).toLocaleString('en-IN')}
Pending Dues: ₹${roomsData.filter(r => r.status === 'pending' && r.tenantName?.trim()).reduce((sum, r) => sum + r.rent, 0).toLocaleString('en-IN')}

PROPERTY DETAILS
==================
${roomsData.map(r => `Room ${r.roomNo}: ${r.tenantName || 'Vacant'} - ₹${r.rent}/mo (${r.status})`).join('\n')}

EXPENSES
==================
${expenses.length > 0 ? expenses.map(e => `${e.category}: ₹${e.amount} (${e.date})`).join('\n') : 'No expenses recorded'}
    `;
    
    downloadFile(report, 'monthly-report.txt');
    showToast("📄 Report downloaded!", "success");
}

window.exportPaymentHistory = function() {
    const csv = [
        ['Room', 'Tenant', 'Amount', 'Status', 'Date'].join(','),
        ...roomsData
            .filter(r => r.tenantName?.trim())
            .map(r => [r.roomNo, r.tenantName, r.rent, r.status.toUpperCase(), new Date().toLocaleDateString('en-IN')].join(','))
    ].join('\n');
    
    downloadFile(csv, 'payment-history.csv');
    showToast("📊 CSV exported!", "success");
}

function downloadFile(content, filename) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

window.toggleNotifications = function(event) {
    if(event) event.stopPropagation();
    
    let dropdown = document.getElementById('notification-dropdown');
    
    // Agar dropdown nahi bana hai HTML me, toh JS se khud bana dega (No HTML edit required)
    if(!dropdown) {
        const header = document.getElementById('dashboard-header');
        if(header) {
            dropdown = document.createElement('div');
            dropdown.id = 'notification-dropdown';
            dropdown.className = 'hidden flex-col absolute top-[80px] right-6 w-64 sm:w-80 bg-white/95 backdrop-blur-xl border border-white/50 shadow-2xl rounded-2xl overflow-hidden z-[100] text-left transition-all';
            dropdown.innerHTML = `
                <div class="p-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex justify-between items-center shadow-md z-10 relative">
                    <h3 class="text-xs font-black tracking-wider uppercase"><i class="fa-solid fa-bell mr-1"></i> Notifications</h3>
                    <button onclick="window.toggleNotifications()" class="text-white/80 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div id="notification-dropdown-list" class="max-h-64 overflow-y-auto bg-white/90 relative z-0">
                    <div class="p-6 text-center text-gray-400 text-xs font-bold">No new notifications ✨</div>
                </div>
            `;
            header.appendChild(dropdown);
            window.updateNotificationDropdown(); // Populate list
        }
    }

    if(dropdown) {
        dropdown.classList.toggle('hidden');
        dropdown.classList.toggle('flex');
        if(!dropdown.classList.contains('hidden')) dropdown.style.animation = "dropIn 0.3s forwards";
    }
}

window.updateNotificationDropdown = function() {
    const list = document.getElementById('notification-dropdown-list');
    const badges = document.querySelectorAll('.notification-badge');
    let total = currentVerifications.length + currentComplaints.length;
    
    // Update red dot counts
    badges.forEach(b => {
        if(total > 0) { b.classList.remove('hidden'); b.style.display = 'block'; } 
        else { b.style.display = 'none'; }
    });

    if(!list) return;
    if(total === 0) {
        list.innerHTML = `<div class="p-6 text-center text-gray-400 text-xs font-bold">No new notifications ✨</div>`;
        return;
    }

    let html = '';
    currentVerifications.forEach(v => {
        html += `
        <div class="p-4 border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-all flex items-center gap-3" onclick="window.location.hash='#owner-verifications-section'; document.getElementById('owner-verifications-section')?.classList.remove('hidden'); window.toggleNotifications();">
            <div class="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-lg shadow-sm shrink-0">₹</div>
            <div>
                <p class="text-sm font-black text-gray-800">Room ${v.roomNo} paid ₹${v.paymentAmount || v.rent}</p>
                <p class="text-xs font-bold text-purple-600 mt-0.5">Click to verify</p>
            </div>
        </div>`;
    });

    currentComplaints.forEach(c => {
        html += `
        <div class="p-4 border-b border-gray-100 hover:bg-red-50 cursor-pointer transition-all flex items-center gap-3" onclick="window.location.hash='#owner-complaints-section'; document.getElementById('owner-complaints-section')?.classList.remove('hidden'); window.toggleNotifications();">
            <div class="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm shadow-sm shrink-0"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div class="min-w-0">
                <p class="text-sm font-black text-gray-800">Room ${c.roomNo} Issue</p>
                <p class="text-xs text-gray-500 truncate w-[180px]">${c.type} - ${c.description}</p>
            </div>
        </div>`;
    });
    list.innerHTML = html;
}

// Click outside to close dropdown
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!dropdown.contains(e.target) && !e.target.closest('button[onclick*="toggleNotifications"]')) {
            dropdown.classList.add('hidden'); dropdown.classList.remove('flex');
        }
    }
});


window.toggleDarkMode = async function() {
    showToast("🌙 Dark mode coming soon!", "success");
}

window.showNotifications = async function() {
    showToast("✓ Notifications enabled", "success");
}

window.backupData = async function() {
    const data = {
        rooms: roomsData,
        expenses: expenses,
        backup_date: new Date().toISOString()
    };
    
    downloadFile(JSON.stringify(data, null, 2), 'khata-backup.json');
    showToast("☁️ Backup downloaded!", "success");
}

// ==========================================
// FILTER & SEARCH FUNCTIONS
// ==========================================

window.updatePaymentFilter = function(filterType) {
    filterState.paymentFilter = filterType;
    window.renderRoomsList();
    
    // Update button highlights
    document.querySelectorAll('[data-filter]').forEach(btn => {
        btn.classList.toggle('active-filter', btn.getAttribute('data-filter') === filterType);
    });
}

window.updateSearchFilter = function(query) {
    filterState.searchQuery = query.toLowerCase().trim();
    window.renderRoomsList();
}

window.clearSearchFilter = function() {
    filterState.searchQuery = '';
    const searchInput = document.getElementById('building-search-input');
    if (searchInput) searchInput.value = '';
    window.renderRoomsList();
}

window.applyFilters = function(rooms) {
    let filtered = [...rooms];
    
    // Apply payment filter — treat 'partial' and 'pending_verification' as pending
    if (filterState.paymentFilter !== 'all') {
        if (filterState.paymentFilter === 'pending') {
            filtered = filtered.filter(r =>
                r.status === 'pending' || r.status === 'partial' || r.status === 'pending_verification'
            );
        } else {
            filtered = filtered.filter(r => r.status === filterState.paymentFilter);
        }
    }
    
    // Apply search filter
    if (filterState.searchQuery) {
        filtered = filtered.filter(r => {
            const roomNo = String(r.roomNo || '').toLowerCase();
            const tenantName = (r.tenantName || '').toLowerCase();
            return roomNo.includes(filterState.searchQuery) || tenantName.includes(filterState.searchQuery);
        });
    }
    
    return filtered;
}

// ==========================================
// FEATURE 2: TIME-BASED DYNAMIC HEADER
// ==========================================

function getTimeOfDay() {
    const h = new Date().getHours();
    if (h >= 5  && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
}

const TIME_CONFIG = {
    morning:   { label: 'Good Morning ☀️',  emoji: '☀️',  cssClass: 'header-morning' },
    afternoon: { label: 'Good Afternoon 🌤️', emoji: '🌤️', cssClass: 'header-afternoon' },
    evening:   { label: 'Good Evening 🌅',  emoji: '🌅', cssClass: 'header-evening' },
    night:     { label: 'Good Night ✨',     emoji: '🌙', cssClass: 'header-night' }
};

function applyTimeBasedHeader() {
    const header = document.getElementById('dashboard-header');
    if (!header) return;

    const tod = getTimeOfDay();
    const cfg = TIME_CONFIG[tod];

    // Remove all time classes first
    Object.values(TIME_CONFIG).forEach(c => header.classList.remove(c.cssClass));
    header.classList.add(cfg.cssClass);

    // Feature 1: Build greeting with owner name
    const firstName = ownerProfile.name ? ownerProfile.name.split(' ')[0] : '';
    const greetingEl = document.getElementById('header-owner-greeting');
    const timeLabelEl = document.getElementById('header-time-label');
    const miniNameEl = document.getElementById('mini-owner-name');
    const miniIconEl = document.getElementById('mini-time-icon');

    if (greetingEl) greetingEl.textContent = firstName ? `Hey, ${firstName}! 👋` : 'Properties';
    if (timeLabelEl) timeLabelEl.textContent = cfg.label;
    if (miniNameEl) miniNameEl.textContent = firstName ? `Hey, ${firstName}!` : 'Dashboard';
    if (miniIconEl) miniIconEl.textContent = cfg.emoji;
}

// ==========================================
// FEATURE 3: COLLAPSIBLE SCROLL HEADER
// ==========================================

let _scrollCollapseInit = false;

function initHeaderScrollCollapse() {
    if (_scrollCollapseInit) return;        // Only wire up once per session
    _scrollCollapseInit = true;

    const scroller = document.getElementById('dashboard-scroll');
    const header   = document.getElementById('dashboard-header');
    if (!scroller || !header) return;

    const COLLAPSE_THRESHOLD = 40; // px scrolled before collapsing

    scroller.addEventListener('scroll', () => {
        if (scroller.scrollTop > COLLAPSE_THRESHOLD) {
            header.classList.add('header-collapsed');
        } else {
            header.classList.remove('header-collapsed');
        }
    }, { passive: true });
}

// Also update mini-revenue when revenue changes
function updateMiniRevenue(value) {
    const el = document.getElementById('mini-revenue');
    if (el) el.textContent = value;
}

// Initialize
window.addEventListener('load', () => {
    console.log('Room Khata Pro loaded successfully! 🏠');
});

// ==========================================
// FEATURE 3: ELECTRICITY BILL CALCULATOR
// ==========================================

let electricityRoomId = null;

window.openElectricityModal = function(roomId, roomNo) {
    electricityRoomId = roomId;
    document.getElementById('elec-room-label').innerText = `Room ${roomNo}`;
    document.getElementById('elec-prev').value = '';
    document.getElementById('elec-curr').value = '';
    document.getElementById('elec-rate').value = '8';
    document.getElementById('elec-preview').classList.add('hidden');
    
    const modal = document.getElementById('electricity-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Live calculation on input
    ['elec-prev', 'elec-curr', 'elec-rate'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateElecPreview);
    });
}

function updateElecPreview() {
    const prev = parseFloat(document.getElementById('elec-prev').value) || 0;
    const curr = parseFloat(document.getElementById('elec-curr').value) || 0;
    const rate = parseFloat(document.getElementById('elec-rate').value) || 0;
    const units = Math.max(0, curr - prev);
    const amount = units * rate;

    if (units > 0) {
        document.getElementById('elec-preview').classList.remove('hidden');
        document.getElementById('elec-calc-result').innerText = `₹${amount.toLocaleString('en-IN')}`;
        document.getElementById('elec-calc-units').innerText = `${units} units consumed`;
    } else {
        document.getElementById('elec-preview').classList.add('hidden');
    }
}

window.closeElectricityModal = function() {
    const modal = document.getElementById('electricity-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    electricityRoomId = null;
}

window.calculateAndAddBill = async function() {
    const prev = parseFloat(document.getElementById('elec-prev').value) || 0;
    const curr = parseFloat(document.getElementById('elec-curr').value) || 0;
    const rate = parseFloat(document.getElementById('elec-rate').value) || 8;

    if (curr <= prev) {
        showToast("Current reading must be greater than previous", "error");
        return;
    }

    const units = curr - prev;
    const billAmount = units * rate;
    const room = roomsData.find(r => r.id === electricityRoomId);
    const existingBill = room?.electricityBill || 0;

    try {
        await updateDoc(doc(db, "rooms", electricityRoomId), {
            electricityBill: existingBill + billAmount,
            elecPrevReading: prev,
            elecCurrReading: curr,
            elecRate: rate
        });
        showToast(`⚡ ₹${billAmount.toLocaleString('en-IN')} electricity bill added to rent!`, "success");
        closeElectricityModal();
        window.fetchRoomsFromCloud();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ==========================================
// FEATURE 4: EDIT & DELETE MANAGEMENT
// ==========================================

// --- Edit Room ---
window.openEditRoom = function(roomId, roomNo, rent) {
    document.getElementById('edit-room-id').value = roomId;
    document.getElementById('edit-room-no').value = roomNo;
    document.getElementById('edit-room-rent').value = rent;
    
    const modal = document.getElementById('edit-room-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeEditRoomModal = function() {
    const modal = document.getElementById('edit-room-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.submitEditRoom = async function() {
    const id = document.getElementById('edit-room-id').value;
    const roomNo = document.getElementById('edit-room-no').value.trim();
    const rent = parseFloat(document.getElementById('edit-room-rent').value);

    if (!roomNo || isNaN(rent)) {
        showToast("Please fill all fields", "error");
        return;
    }

    try {
        await updateDoc(doc(db, "rooms", id), { roomNo, rent });
        showToast("✓ Room updated!", "success");
        closeEditRoomModal();
        window.fetchRoomsFromCloud();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// --- Edit Building ---
window.openEditBuilding = function(buildingId, currentName) {
    document.getElementById('edit-building-id').value = buildingId;
    document.getElementById('edit-building-name').value = currentName;
    
    const modal = document.getElementById('edit-building-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeEditBuildingModal = function() {
    const modal = document.getElementById('edit-building-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.submitEditBuilding = async function() {
    const id = document.getElementById('edit-building-id').value;
    const name = document.getElementById('edit-building-name').value.trim();

    if (!name) {
        showToast("Please enter a building name", "error");
        return;
    }

    try {
        await updateDoc(doc(db, "buildings", id), { name });
        showToast("✓ Building renamed!", "success");
        closeEditBuildingModal();
        window.fetchRoomsFromCloud();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// --- Delete Building ---
window.deleteBuilding = async function(buildingId) {
    const hasRooms = roomsData.some(r => r.buildingId === buildingId);
    if (hasRooms) {
        showToast("Delete or move all rooms first before deleting building", "error");
        return;
    }

    const confirmed = await showConfirm("Delete Building", "This will permanently delete the building. This cannot be undone.", "Delete", true);
    if (!confirmed) return;

    try {
        await deleteDoc(doc(db, "buildings", buildingId));
        showToast("🗑️ Building deleted", "success");
        window.fetchRoomsFromCloud();
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ==========================================
// FEATURE 5: BULK WHATSAPP REMINDERS
// ==========================================

window.bulkWhatsAppReminder = function() {
    const pendingRooms = roomsData.filter(r =>
        r.tenantName?.trim() &&
        (r.status === 'pending' || r.status === 'partial')
    );

    if (pendingRooms.length === 0) {
        showToast("🎉 No pending payments! All tenants are paid up.", "success");
        return;
    }

    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    let message = `🏠 *RENT REMINDER*\n📅 ${today}\n\nDear Tenants, your rent is due:\n\n`;

    pendingRooms.forEach((room, i) => {
        const due = room.balanceDue || room.rent || 0;
        const status = room.status === 'partial' ? '(Partial Pending)' : '';
        message += `${i + 1}. Room ${room.roomNo} — ${room.tenantName}\n   Due: ₹${due.toLocaleString('en-IN')} ${status}\n`;
    });

    message += `\nPlease make the payment at your earliest convenience.\nThank you! 🙏\n\n_Sent via Khata Pro_`;

    navigator.clipboard.writeText(message)
        .then(() => {
            showToast(`✓ Reminder for ${pendingRooms.length} tenant(s) copied! Paste in WhatsApp Broadcast.`, "success");
        })
        .catch(() => {
            // Fallback: open WhatsApp with the message
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
        });
}

// ==========================================
// TENANT DASHBOARD — REAL-TIME SUBSCRIPTION
// ==========================================

function subscribeToTenantRoom(roomId) {
    // Tear down previous subscription if any
    if (tenantUnsubscribe) { tenantUnsubscribe(); }

    const roomRef = doc(db, "rooms", roomId);

    tenantUnsubscribe = onSnapshot(roomRef, async (snap) => {
        if (!snap.exists()) {
            showToast("Room data not found. Contact your landlord.", "error");
            return;
        }

        tenantRoomData = { id: snap.id, ...snap.data() };
        renderTenantDashboard(tenantRoomData);
    }, (err) => {
        console.error("Tenant snapshot error:", err);
    });
}

async function renderTenantDashboard(room) {
    // Name & Room
    const nameEl = document.getElementById('td-tenant-name');
    const roomEl = document.getElementById('td-room-no');
    if (nameEl) nameEl.textContent = room.tenantName || 'Tenant';
    if (roomEl) roomEl.textContent = room.roomNo || '--';

    // Calculate amounts
    const baseRent = room.rent || 0;
    const elecBill = room.electricityBill || 0;
    const totalDue = baseRent + elecBill;
    const balanceDue = room.balanceDue ?? totalDue;
    const status = room.status || 'pending';

    // Amount Due
    const dueEl = document.getElementById('td-amount-due');
    if (dueEl) {
        dueEl.textContent = `₹${balanceDue.toLocaleString('en-IN')}`;
        // Remove pulse when paid
        if (status === 'paid') {
            dueEl.classList.remove('amount-due-pulse');
        } else {
            dueEl.classList.add('amount-due-pulse');
        }
    }

    // Status badge
    const statusBadge = document.getElementById('td-status-badge');
    if (statusBadge) {
        if (status === 'paid') {
            statusBadge.textContent = '✓ PAID';
            statusBadge.className = 'text-xs font-black px-2.5 py-1 rounded-lg bg-green-500/30 text-green-300';
        } else if (status === 'partial') {
            statusBadge.textContent = '◑ PARTIAL';
            statusBadge.className = 'text-xs font-black px-2.5 py-1 rounded-lg bg-yellow-500/30 text-yellow-300';
        } else {
            statusBadge.textContent = '⏳ PENDING';
            statusBadge.className = 'text-xs font-black px-2.5 py-1 rounded-lg bg-orange-500/30 text-orange-300';
        }
    }

    // Base rent
    const baseEl = document.getElementById('td-base-rent');
    if (baseEl) baseEl.textContent = `₹${baseRent.toLocaleString('en-IN')}`;

    // Electricity
    const elecBlock = document.getElementById('td-elec-block');
    const elecAmtEl = document.getElementById('td-elec-amount');
    if (elecBlock && elecAmtEl) {
        if (elecBill > 0) {
            elecBlock.classList.remove('hidden');
            elecAmtEl.textContent = `₹${elecBill.toLocaleString('en-IN')}`;
        } else {
            elecBlock.classList.add('hidden');
        }
    }

    // Balance (for partial)
    const balBlock = document.getElementById('td-balance-block');
    const balEl = document.getElementById('td-balance');
    if (balBlock && balEl) {
        if (status === 'partial' && balanceDue > 0) {
            balBlock.classList.remove('hidden');
            balEl.textContent = `₹${balanceDue.toLocaleString('en-IN')}`;
        } else {
            balBlock.classList.add('hidden');
        }
    }

    // Tenancy details
    const moveinEl = document.getElementById('td-movein');
    const depositEl = document.getElementById('td-deposit');
    const buildingEl = document.getElementById('td-building');
    if (moveinEl) moveinEl.textContent = room.moveInDate ? new Date(room.moveInDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    if (depositEl) depositEl.textContent = room.securityDeposit > 0 ? `₹${(room.securityDeposit || 0).toLocaleString('en-IN')}` : '₹0';

    // Fetch building name async
    if (room.buildingId && buildingEl) {
        try {
            const bSnap = await getDoc(doc(db, "buildings", room.buildingId));
            buildingEl.textContent = bSnap.exists() ? bSnap.data().name : 'Building';
        } catch { buildingEl.textContent = 'Building'; }
    }

    // Payment history
    renderTenantPaymentHistory(room);

    // UPI amount
    const upiAmtEl = document.getElementById('upi-amount-display');
    if (upiAmtEl) upiAmtEl.textContent = `₹${balanceDue.toLocaleString('en-IN')}`;
}

function renderTenantPaymentHistory(room) {
    const histContainer = document.getElementById('td-payment-history');
    const countEl = document.getElementById('td-history-count');
    if (!histContainer) return;

    // Build history from payment history collection (listen separately)
    // For now render from room's amountPaid if status is paid/partial + fetch from paymentHistory collection
    const historyItems = [];

    if (room.paidDate && (room.status === 'paid' || room.status === 'partial')) {
        historyItems.push({
            date: new Date(room.paidDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
            amount: room.amountPaid || room.rent,
            status: room.status,
            month: new Date(room.paidDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        });
    }

    // Fetch full payment history from Firestore collection
    const histQuery = query(
        collection(db, "paymentHistory"),
        where("roomId", "==", room.id)
    );
    getDocs(histQuery).then(snap => {
        const docs = snap.docs.map(d => d.data()).sort((a, b) => new Date(b.paidDate) - new Date(a.paidDate));
        const combined = [...docs, ...historyItems];

        if (countEl) countEl.textContent = `${combined.length} record${combined.length !== 1 ? 's' : ''}`;

        if (combined.length === 0) {
            histContainer.innerHTML = `
                <div class="text-center py-6 text-white/30">
                    <i class="fa-solid fa-clock-rotate-left text-3xl mb-2 block"></i>
                    <p class="text-sm">No payment history yet</p>
                </div>`;
            return;
        }

        histContainer.innerHTML = combined.map((h, i) => `
            <div class="history-item flex items-center justify-between py-3 border-b border-white/5 last:border-0" style="animation-delay:${i*0.08}s">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center ${h.status === 'paid' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}">
                        <i class="fa-solid ${h.status === 'paid' ? 'fa-check' : 'fa-circle-half-stroke'} text-sm"></i>
                    </div>
                    <div>
                        <p class="text-white/80 text-sm font-bold">${h.month || 'Payment'}</p>
                        <p class="text-white/40 text-xs">${h.date || '—'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-white font-bold stat-number text-sm">₹${(h.amount || 0).toLocaleString('en-IN')}</p>
                    <span class="text-[10px] font-bold ${h.status === 'paid' ? 'text-green-400' : 'text-yellow-400'}">${h.status?.toUpperCase()}</span>
                </div>
            </div>
        `).join('');
    }).catch(err => {
        console.warn("Could not load payment history:", err);
        if (countEl) countEl.textContent = historyItems.length ? `${historyItems.length} record` : '0 records';
        histContainer.innerHTML = historyItems.length ? historyItems.map(h => `
            <div class="flex items-center justify-between py-3">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-green-500/20 text-green-400">
                        <i class="fa-solid fa-check text-sm"></i>
                    </div>
                    <div>
                        <p class="text-white/80 text-sm font-bold">${h.month}</p>
                        <p class="text-white/40 text-xs">${h.date}</p>
                    </div>
                </div>
                <p class="text-white font-bold stat-number text-sm">₹${(h.amount || 0).toLocaleString('en-IN')}</p>
            </div>
        `).join('') : `<div class="text-center py-4 text-white/30 text-sm">No history yet</div>`;
    });
}

// ==========================================
// UPI PAYMENT MODAL
// ==========================================

window.openUpiModal = async function() {
    if (!tenantRoomData) return;
    const balanceDue = tenantRoomData.balanceDue ?? ((tenantRoomData.rent || 0) + (tenantRoomData.electricityBill || 0));
    const upiAmtEl = document.getElementById('upi-amount-display');
    if (upiAmtEl) upiAmtEl.textContent = `₹${balanceDue.toLocaleString('en-IN')}`;

    // Fetch the owner's real UPI ID and display it
    const upiIdEl = document.getElementById('upi-id-display');
    if (upiIdEl) {
        let ownerUpi = tenantRoomData.ownerUpiId || '';
        if (!ownerUpi && tenantRoomData.ownerId) {
            try {
                // Try direct doc first (setDoc path)
                const ownerSnap = await getDoc(doc(db, 'ownerProfiles', tenantRoomData.ownerId));
                if (ownerSnap.exists()) {
                    ownerUpi = ownerSnap.data().upiId || '';
                }
                if (!ownerUpi) {
                    // Legacy query path
                    const q2 = query(collection(db, 'ownerProfiles'), where('uid', '==', tenantRoomData.ownerId));
                    const s2 = await getDocs(q2);
                    if (!s2.empty) ownerUpi = s2.docs[0].data().upiId || '';
                }
            } catch (_) {}
        }
        // Cache on tenantRoomData so UPI-app buttons can use it without re-fetching
        tenantRoomData.ownerUpiId = ownerUpi;
        upiIdEl.textContent = ownerUpi || 'Contact landlord for UPI ID';
    }

    const modal = document.getElementById('upi-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeUpiModal = function() {
    const modal = document.getElementById('upi-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.openUpiApp = async function(appName) {
    if (!tenantRoomData || !currentUser) return;

    const balanceDue = tenantRoomData.balanceDue ?? ((tenantRoomData.rent || 0) + (tenantRoomData.electricityBill || 0));
    
    // 1. Status ko pending_verification karna
    try {
        await updateDoc(doc(db, 'rooms', tenantRoomData.id), {
            status: 'pending_verification',
            paymentInitiatedAt: new Date().toISOString(),
            paymentInitiatedBy: currentUser.uid,
            paymentApp: appName,
            paymentAmount: balanceDue
        });

        await addDoc(collection(db, 'paymentHistory'), {
            roomId: tenantRoomData.id,
            ownerId: tenantRoomData.ownerId,
            tenantUid: currentUser.uid,
            tenantName: tenantRoomData.tenantName,
            roomNo: tenantRoomData.roomNo,
            amount: balanceDue,
            status: 'pending_verification',
            paidDate: new Date().toISOString(),
            month: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
            date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
        });
    } catch (err) {
        console.warn('Could not set pending_verification:', err);
    }

    // 2. Asli UPI app kholna
    const upiId = tenantRoomData.ownerUpiId || 'owner@upi';
    const pn = encodeURIComponent('Rent Payment');
    const upiUrls = {
        gpay: `tez://upi/pay?pa=${upiId}&pn=${pn}&am=${balanceDue}&cu=INR`,
        phonepe: `phonepe://pay?pa=${upiId}&pn=${pn}&am=${balanceDue}&cu=INR`,
        paytm: `paytmmp://pay?pa=${upiId}&pn=${pn}&am=${balanceDue}&cu=INR`
    };

    closeUpiModal();
    window.location.href = upiUrls[appName] || upiUrls.gpay;
    setTimeout(() => { showToast('App not found. Please use the QR code above.', 'error'); }, 1800);
};

// ==========================================
// COMPLAINT MODAL
// ==========================================

window.openComplaintModal = function() {
    selectedComplaintType = '';
    selectedPriority = 'medium';
    document.getElementById('complaint-desc').value = '';
    document.getElementById('complaint-char-count').textContent = '0 / 300';
    document.querySelectorAll('.complaint-type-btn').forEach(b => b.classList.remove('selected'));
    document.querySelectorAll('.priority-btn').forEach(b => {
        b.classList.remove('border-green-500', 'text-green-400', 'border-yellow-500', 'text-yellow-400', 'border-red-500', 'text-red-400');
        b.classList.add('border-gray-700', 'text-gray-400');
    });

    const modal = document.getElementById('complaint-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Live char count
    const desc = document.getElementById('complaint-desc');
    desc.oninput = () => {
        const len = desc.value.length;
        document.getElementById('complaint-char-count').textContent = `${len} / 300`;
        if (len > 300) desc.value = desc.value.slice(0, 300);
    };
}

window.closeComplaintModal = function() {
    const modal = document.getElementById('complaint-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

window.selectComplaintType = function(btn, type) {
    selectedComplaintType = type;
    document.querySelectorAll('.complaint-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

window.selectPriority = function(btn, priority) {
    selectedPriority = priority;
    const colorMap = {
        low: ['border-green-500', 'text-green-400'],
        medium: ['border-yellow-500', 'text-yellow-400'],
        high: ['border-red-500', 'text-red-400']
    };
    document.querySelectorAll('.priority-btn').forEach(b => {
        b.classList.remove(...['border-green-500','text-green-400','border-yellow-500','text-yellow-400','border-red-500','text-red-400']);
        b.classList.add('border-gray-700', 'text-gray-400');
    });
    btn.classList.remove('border-gray-700', 'text-gray-400');
    btn.classList.add(...colorMap[priority]);
}

window.submitComplaint = async function() {
    if (!selectedComplaintType) {
        showToast("Please select a complaint type", "error");
        return;
    }
    const desc = document.getElementById('complaint-desc').value.trim();
    if (!desc) {
        showToast("Please describe the issue", "error");
        return;
    }
    if (!tenantRoomData || !currentUser) return;

    try {
        const complaintData = {
            roomId: tenantRoomData.id,
            roomNo: tenantRoomData.roomNo,
            tenantName: tenantRoomData.tenantName,
            tenantUid: currentUser.uid,
            ownerId: tenantRoomData.ownerId,
            type: selectedComplaintType,
            description: desc,
            priority: selectedPriority,
            status: 'open',
            createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, "complaints"), complaintData);

        closeComplaintModal();
        showToast("✓ Complaint submitted! Your landlord has been notified.", "success");

        // Show in open complaints section
        renderOpenComplaints();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function renderOpenComplaints() {
    if (!currentUser) return;
    const section = document.getElementById('td-complaints-section');
    const list = document.getElementById('td-complaints-list');
    if (!section || !list) return;

    try {
        const q = query(
            collection(db, "complaints"),
            where("tenantUid", "==", currentUser.uid),
            where("status", "==", "open")
        );
        const snap = await getDocs(q);
        
        if (snap.empty) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        const priorityColors = { high: 'text-red-400 bg-red-500/20', medium: 'text-yellow-400 bg-yellow-500/20', low: 'text-green-400 bg-green-500/20' };
        const typeIcons = { plumbing: '🔧', electrical: '⚡', cleaning: '🧹', security: '🔒', noise: '🔊', other: '📋' };

        list.innerHTML = snap.docs.map(d => {
            const c = d.data();
            const pColor = priorityColors[c.priority] || priorityColors.medium;
            return `
            <div class="bg-white/5 rounded-xl p-4 border border-white/10">
                <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-lg">${typeIcons[c.type] || '📋'}</span>
                        <span class="text-white/80 font-bold text-sm capitalize">${c.type}</span>
                    </div>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg ${pColor}">${c.priority?.toUpperCase()}</span>
                </div>
                <p class="text-white/50 text-xs">${c.description.slice(0, 80)}${c.description.length > 80 ? '...' : ''}</p>
                <p class="text-white/30 text-[10px] mt-2">${new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
            </div>`;
        }).join('');
    } catch (err) {
        console.warn("Couldn't load complaints:", err);
    }
}

// Also save payment history record per room (called from confirmPartialPayment)
// We extend confirmPartialPayment to also write to paymentHistory sub-collection
const _origConfirmPartialPayment = window.confirmPartialPayment;
window.confirmPartialPayment = async function() {
    // We will call the existing function and after it, write history
    const room = roomsData.find(r => r.id === partialPaymentRoomId);
    const totalRent = room ? (room.rent || 0) + (room.electricityBill || 0) : 0;
    const amountPaid = parseFloat(document.getElementById('pp-amount-input').value) || 0;
    const balanceDue = Math.max(0, totalRent - amountPaid);
    const newStatus = balanceDue === 0 ? 'paid' : 'partial';
    const paidDate = new Date().toISOString();

    // Call original
    await _origConfirmPartialPayment();

    // Write to paymentHistory collection for tenant's history view
    if (room && amountPaid > 0) {
        try {
            await addDoc(collection(db, "paymentHistory"), {
                roomId: partialPaymentRoomId || room?.id,
                ownerId: room.ownerId,
                tenantUid: room.tenantUid || null,
                roomNo: room.roomNo,
                tenantName: room.tenantName,
                amount: amountPaid,
                balanceDue: balanceDue,
                status: newStatus,
                paidDate: paidDate,
                month: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
                date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            });
        } catch(e) {
            console.warn("Could not write payment history:", e);
        }
    }
}

// ==========================================
// FEATURE A: LANGUAGE TOGGLE (Hindi/English)
// ==========================================

const TRANSLATIONS = {
  en: {
    settings: 'Settings', editProfile: 'Edit Profile', preferences: 'Preferences',
    language: 'Language', darkMode: 'Dark Mode', notifications: 'Notifications',
    data: 'Data', backupData: 'Backup Data', logout: 'Logout',
    totalRevenue: 'Total Revenue', pendingDues: 'Pending Dues',
    yourBuildings: 'Your Buildings', addBuilding: 'Add Building',
    quickActions: 'Quick Actions', remindAllPending: 'Remind All Pending Tenants',
    thisMonth: 'This month', urgent: 'Urgent',
    allRooms: 'All Rooms', pending: 'Pending', paid: 'Paid',
    home: 'Home', tenants: 'Tenants', payments: 'Payments',
    amountDue: 'Total Due This Month', payRent: 'Pay Rent', raiseComplaint: 'Raise Complaint',
    tenantComplaints: 'Tenant Complaints', paymentRequests: 'Payment Requests',
    welcomeBack: 'Welcome back,', room: 'Room',
    tenancyDetails: 'Your Tenancy Details', moveInDate: 'Move-in Date',
    securityDeposit: 'Security Deposit', building: 'Building',
    paymentHistory: 'Payment History', openComplaints: 'Open Complaints',
    upiQr: 'UPI / QR Code', reportIssue: 'Report an issue',
    scanWithUpi: 'Scan with any UPI app', orPayWith: 'Or pay with',
    afterPaymentNote: 'After payment, your landlord will confirm & update your status.',
    done: 'Done', landlordNotified: 'Your landlord will be notified',
    typeOfIssue: 'Type of Issue', describeIssue: 'Describe the Issue',
    priority: 'Priority', low: 'Low', medium: 'Medium', high: 'High',
    cancel: 'Cancel', submit: 'Submit',
  },
  hi: {
    settings: 'सेटिंग्स', editProfile: 'प्रोफाइल बदलें', preferences: 'सेटिंग्स',
    language: 'भाषा', darkMode: 'डार्क मोड', notifications: 'नोटिफिकेशन',
    data: 'डेटा', backupData: 'डेटा बचाएं', logout: 'बाहर जाएं',
    totalRevenue: 'कुल कमाई', pendingDues: 'बाकी पैसे',
    yourBuildings: 'आपकी बिल्डिंग', addBuilding: 'बिल्डिंग जोड़ें',
    quickActions: 'जरूरी काम', remindAllPending: 'सभी बकाया किरायेदारों को याद दिलाएं',
    thisMonth: 'इस महीने', urgent: 'जरूरी',
    allRooms: 'सभी कमरे', pending: 'बाकी', paid: 'जमा',
    home: 'होम', tenants: 'किरायेदार', payments: 'पेमेंट',
    amountDue: 'इस महीने का बकाया', payRent: 'किराया दें', raiseComplaint: 'शिकायत करें',
    tenantComplaints: 'शिकायतें', paymentRequests: 'पेमेंट रिक्वेस्ट',
    welcomeBack: 'वापसी पर स्वागत,', room: 'कमरा',
    tenancyDetails: 'आपकी किरायेदारी की जानकारी', moveInDate: 'आने की तारीख',
    securityDeposit: 'सिक्योरिटी जमा', building: 'बिल्डिंग',
    paymentHistory: 'पेमेंट हिस्ट्री', openComplaints: 'खुली शिकायतें',
    upiQr: 'UPI / QR कोड', reportIssue: 'दिक्कत बताएं',
    scanWithUpi: 'किसी भी UPI ऐप से स्कैन करें', orPayWith: 'या इससे दें',
    afterPaymentNote: 'पेमेंट के बाद मकान मालिक चेक करके आपका स्टेटस अपडेट करेगा।',
    done: 'हो गया', landlordNotified: 'मकान मालिक को खबर मिलेगी',
    typeOfIssue: 'दिक्कत का टाइप', describeIssue: 'दिक्कत बताएं',
    priority: 'कितना जरूरी', low: 'कम', medium: 'ठीक-ठाक', high: 'बहुत जरूरी',
    cancel: 'रद्द करें', submit: 'भेजें',
  }
};

let currentLanguage = localStorage.getItem('rkp_lang') || 'en';

function applyLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem('rkp_lang', lang);
  const t = TRANSLATIONS[lang];

  // Update all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });

  // Update toggle UI
  const track = document.getElementById('lang-toggle-track');
  const thumb = document.getElementById('lang-toggle-thumb');
  const label = document.getElementById('lang-current-label');
  if (track && thumb && label) {
    if (lang === 'hi') {
      track.classList.add('active');
      thumb.textContent = 'HI';
      label.textContent = 'हिंदी';
    } else {
      track.classList.remove('active');
      thumb.textContent = 'EN';
      label.textContent = 'English';
    }
  }

  // Update specific dynamic labels
  const revEl = document.querySelector('#total-revenue')?.previousElementSibling;
  if (revEl) revEl.textContent = t.totalRevenue;
}

window.toggleLanguage = function() {
  const newLang = currentLanguage === 'en' ? 'hi' : 'en';
  applyLanguage(newLang);
  showToast(newLang === 'hi' ? '🇮🇳 हिंदी में बदला गया' : '🌐 Switched to English', 'success');
};

// ==========================================
// FEATURE B: OWNER PROFILE EDIT
// ==========================================

window.openEditProfileModal = function() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;

  // Pre-fill with current data
  const nameEl  = document.getElementById('ep-name');
  const addrEl  = document.getElementById('ep-address');
  const upiEl   = document.getElementById('ep-upi');
  const preview = document.getElementById('ep-avatar-preview');

  if (nameEl)  nameEl.value  = ownerProfile.name    || '';
  if (addrEl)  addrEl.value  = ownerProfile.address || '';
  if (upiEl)   upiEl.value   = ownerProfile.upiId   || '';
  if (preview && ownerProfile.name) preview.textContent = ownerProfile.name.charAt(0).toUpperCase();

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => nameEl?.focus(), 100);
};

window.closeEditProfileModal = function() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.saveOwnerProfile = async function() {
  const name    = document.getElementById('ep-name')?.value.trim();
  const address = document.getElementById('ep-address')?.value.trim();
  const upiId   = document.getElementById('ep-upi')?.value.trim();

  if (!name) { showToast('Name is required', 'error'); return; }
  if (!currentUser) return;

  const btn = document.getElementById('ep-submit-btn');
  const originalText = btn ? btn.textContent : '';
  if (btn) btn.innerHTML = '<span class="spinner mr-2"></span> Saving...';

  try {
    await setDoc(doc(db, 'ownerProfiles', currentUser.uid), {
      uid: currentUser.uid,
      name, address: address || '', upiId: upiId || '',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Update in-memory cache
    ownerProfile = { ...ownerProfile, name, address: address || '', upiId: upiId || '' };

    // Refresh settings header
    refreshSettingsHeader();

    // Refresh owner dashboard greeting
    if (document.getElementById('header-owner-greeting')) {
      document.getElementById('header-owner-greeting').textContent = name.split(' ')[0];
    }
    if (document.getElementById('mini-owner-name')) {
      document.getElementById('mini-owner-name').textContent = name.split(' ')[0];
    }

    closeEditProfileModal();
    showToast('✓ Profile updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.innerHTML = originalText;
  }
};

function refreshSettingsHeader() {
  const nameEl   = document.getElementById('settings-owner-name');
  const addrEl   = document.getElementById('settings-owner-address');
  const avatar   = document.getElementById('settings-avatar');
  const emailEl  = document.getElementById('settings-owner-email');

  if (nameEl)  nameEl.textContent  = ownerProfile.name    || 'Owner';
  if (addrEl)  addrEl.textContent  = ownerProfile.address || '—';
  if (avatar)  avatar.textContent  = (ownerProfile.name?.charAt(0) || 'A').toUpperCase();
  if (emailEl) emailEl.textContent = currentUser?.email   || '';
}

// Hook into the existing switchView to refresh settings header when opened
const _origSwitchView = window.switchView;
window.switchView = function(viewId) {
  if (_origSwitchView) _origSwitchView(viewId);
  if (viewId === 'view-settings') {
    refreshSettingsHeader();
    applyLanguage(currentLanguage);
  }
};

// ==========================================
// FEATURE C: ADD BUILDING MODAL
// ==========================================

window.openAddBuildingModal = function() {
  const modal = document.getElementById('add-building-modal');
  if (!modal) return;
  // Reset form
  ['ab-name','ab-rooms','ab-upi'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const startEl = document.getElementById('ab-start');
  if (startEl) startEl.value = '101';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  setTimeout(() => document.getElementById('ab-name')?.focus(), 100);
};

window.closeAddBuildingModal = function() {
  const modal = document.getElementById('add-building-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.submitAddBuilding = async function() {
  const name      = document.getElementById('ab-name')?.value.trim();
  const roomCount = parseInt(document.getElementById('ab-rooms')?.value) || 0;
  const startNo   = document.getElementById('ab-start')?.value.trim() || '101';
  const rentVal   = parseInt(document.getElementById('ab-rent')?.value) || 0;

  if (!name)       { showToast('Building name is required', 'error'); return; }
  if (roomCount < 1) { showToast('At least 1 room is required', 'error'); return; }
  if (!currentUser) return;

  const btn = document.getElementById('ab-submit-btn');
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span class="spinner mr-2"></span> Creating...';
  btn.disabled = true;

  try {
    // 1. Create building
    const buildingRef = await addDoc(collection(db, 'buildings'), {
      ownerId: currentUser.uid,
      name,
      createdAt: new Date().toISOString()
    });

    // 2. Create rooms
    const startNum = parseInt(startNo) || 101;
    for (let i = 0; i < roomCount; i++) {
      const roomNoStr = isNaN(parseInt(startNo))
        ? `${startNo}${i + 1}`
        : (startNum + i).toString();

      await addDoc(collection(db, 'rooms'), {
        buildingId: buildingRef.id,
        ownerId: currentUser.uid,
        roomNo: roomNoStr,
        rent: rentVal,
        tenantName: '',
        status: 'pending',
        connectionCode: generateRoomCode(),
        createdAt: new Date().toISOString()
      });
    }

    showToast(`🏢 ${name} created with ${roomCount} rooms!`, 'success');
    closeAddBuildingModal();
    btn.innerHTML = origHTML;
    btn.disabled = false;

    // Refresh dashboard
    await window.fetchRoomsFromCloud();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    btn.innerHTML = origHTML;
    btn.disabled = false;
  }
};

// ==========================================
// FEATURE D: TENANT UPI PAYMENT → pending_verification
// ==========================================

// Override openUpiApp: sets pending_verification in Firestore, then opens real UPI deep-link
window.openUpiApp = async function(appName) {
  if (!tenantRoomData || !currentUser) return;

  const balanceDue = tenantRoomData.balanceDue
    ?? ((tenantRoomData.rent || 0) + (tenantRoomData.electricityBill || 0));

  // 1. Persist pending_verification so owner sees it in real-time
  try {
    await updateDoc(doc(db, 'rooms', tenantRoomData.id), {
      status: 'pending_verification',
      paymentInitiatedAt: new Date().toISOString(),
      paymentInitiatedBy: currentUser.uid,
      paymentApp: appName,
      paymentAmount: balanceDue
    });

    // 2. Log to paymentHistory collection
    await addDoc(collection(db, 'paymentHistory'), {
      roomId: tenantRoomData.id,
      ownerId: tenantRoomData.ownerId,
      tenantUid: currentUser.uid,
      tenantName: tenantRoomData.tenantName,
      roomNo: tenantRoomData.roomNo,
      amount: balanceDue,
      status: 'pending_verification',
      paidDate: new Date().toISOString(),
      month: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    });
  } catch (err) {
    console.warn('Could not set pending_verification:', err);
  }

  // 3. Open the UPI deep-link with the real cached owner UPI ID
  const upiId = tenantRoomData.ownerUpiId || 'owner@upi';
  const pn     = encodeURIComponent('Rent Payment');
  const upiUrls = {
    gpay:    `tez://upi/pay?pa=${upiId}&pn=${pn}&am=${balanceDue}&cu=INR`,
    phonepe: `phonepe://pay?pa=${upiId}&pn=${pn}&am=${balanceDue}&cu=INR`,
    paytm:   `paytmmp://pay?pa=${upiId}&pn=${pn}&am=${balanceDue}&cu=INR`
  };

  closeUpiModal();
  window.location.href = upiUrls[appName] || upiUrls.gpay;
  setTimeout(() => { showToast('App not found. Please use QR code above.', 'error'); }, 1800);
};

// ==========================================
// FEATURE E: OWNER COMPLAINTS + VERIFICATION INBOX
// ==========================================

let ownerComplaintsUnsubscribe = null;
let ownerVerificationsUnsubscribe = null;

// State variables for notifications
let currentVerifications = [];
let currentComplaints = [];

window.subscribeToOwnerInbox = function() {
    if (!currentUser) return;

    // Listen to Complaints
    const complaintsQ = query(collection(db, 'complaints'), where('ownerId', '==', currentUser.uid), where('status', '==', 'open'));
    if (ownerComplaintsUnsubscribe) ownerComplaintsUnsubscribe();
    ownerComplaintsUnsubscribe = onSnapshot(complaintsQ, (snap) => {
        currentComplaints = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (typeof renderOwnerComplaints === 'function') renderOwnerComplaints(currentComplaints);
        if (typeof window.updateNotificationDropdown === 'function') window.updateNotificationDropdown();
    });

    // Listen to Payment Verifications
    const verifyQ = query(collection(db, 'rooms'), where('ownerId', '==', currentUser.uid), where('status', '==', 'pending_verification'));
    if (ownerVerificationsUnsubscribe) ownerVerificationsUnsubscribe();
    ownerVerificationsUnsubscribe = onSnapshot(verifyQ, (snap) => {
        currentVerifications = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (typeof renderOwnerVerifications === 'function') renderOwnerVerifications(currentVerifications);
        if (typeof window.updateNotificationDropdown === 'function') window.updateNotificationDropdown();
    });
};

function renderOwnerComplaints(complaints) {
  const section  = document.getElementById('owner-complaints-section');
  const list     = document.getElementById('owner-complaints-list');
  const badge    = document.getElementById('open-complaints-badge');
  if (!section || !list) return;

  if (complaints.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  if (badge) badge.textContent = `${complaints.length} open`;

  const priorityColors = {
    high: 'bg-red-50 border-red-200',
    medium: 'bg-amber-50 border-amber-200',
    low: 'bg-gray-50 border-gray-200'
  };
  const typeIcons = { plumbing:'🔧', electrical:'⚡', cleaning:'🧹', security:'🔒', noise:'🔊', other:'📋' };
  const priorityChipColors = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-gray-100 text-gray-700' };

  list.innerHTML = complaints.map(c => `
    <div class="rounded-2xl p-4 border-2 ${priorityColors[c.priority] || priorityColors.medium}">
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="text-xl">${typeIcons[c.type] || '📋'}</span>
          <div>
            <p class="font-black text-gray-900 text-sm capitalize">${c.type || 'Complaint'}</p>
            <p class="text-gray-500 text-xs">Room ${c.roomNo} · ${c.tenantName || 'Tenant'}</p>
          </div>
        </div>
        <span class="text-[10px] font-bold px-2 py-1 rounded-lg ${priorityChipColors[c.priority] || priorityChipColors.medium}">${(c.priority || 'medium').toUpperCase()}</span>
      </div>
      <p class="text-gray-600 text-xs mb-3 leading-relaxed">${c.description?.slice(0, 100)}${(c.description?.length > 100) ? '...' : ''}</p>
      <div class="flex gap-2">
        <button onclick="resolveComplaint('${c.id}')" class="flex-1 py-2 bg-green-100 text-green-700 font-bold text-xs rounded-xl hover:bg-green-200 active:scale-95 transition-all">
          ✓ Mark Resolved
        </button>
        <button onclick="replyComplaintWhatsApp('${c.id}')" class="py-2 px-3 bg-gray-100 text-gray-600 font-bold text-xs rounded-xl hover:bg-green-100 hover:text-green-700 active:scale-95 transition-all">
          <i class="fa-brands fa-whatsapp text-sm"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function renderOwnerVerifications(rooms) {
  const section = document.getElementById('owner-verifications-section');
  const list    = document.getElementById('owner-verifications-list');
  const badge   = document.getElementById('verifications-badge');
  if (!section || !list) return;

  if (rooms.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  if (badge) badge.textContent = `${rooms.length} pending`;

  list.innerHTML = rooms.map(room => {
    const amount = room.paymentAmount || room.rent || 0;
    const timeAgo = room.paymentInitiatedAt
      ? getTimeAgo(new Date(room.paymentInitiatedAt))
      : '';
    const appIcon = { gpay: '🅖', phonepe: '📱', paytm: '💳' }[room.paymentApp] || '💸';
    return `
      <div class="verification-banner text-white rounded-2xl p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">${appIcon}</div>
            <div>
              <p class="font-black text-sm">Room ${room.roomNo} · ${room.tenantName || 'Tenant'}</p>
              <p class="text-white/70 text-xs">${timeAgo} via ${room.paymentApp || 'UPI'}</p>
            </div>
          </div>
          <p class="text-xl font-black">₹${amount.toLocaleString('en-IN')}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="approvePaymentVerification('${room.id}', ${amount})" class="flex-1 py-2 bg-white text-amber-700 font-black text-xs rounded-xl hover:bg-white/90 active:scale-95 transition-all">
            ✓ Confirm Received
          </button>
          <button onclick="rejectPaymentVerification('${room.id}')" class="py-2 px-3 bg-white/20 text-white font-bold text-xs rounded-xl hover:bg-white/30 active:scale-95 transition-all">
            ✗ Reject
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.resolveComplaint = async function(complaintId) {
  try {
    await updateDoc(doc(db, 'complaints', complaintId), {
      status: 'resolved',
      resolvedAt: new Date().toISOString()
    });
    showToast('✓ Complaint marked as resolved', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.replyComplaintWhatsApp = async function(complaintId) {
  try {
    const snap = await getDoc(doc(db, 'complaints', complaintId));
    if (!snap.exists()) return;
    const c = snap.data();
    const phone = c.tenantPhone || '';
    const msg = `Hi ${c.tenantName || 'Tenant'} 👋\n\nRegarding your ${c.type} complaint in Room ${c.roomNo}:\n\n"${c.description?.slice(0,100)}"\n\nWe are looking into this and will get back to you shortly.\n\n_Room Khata Pro_`;
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.approvePaymentVerification = async function(roomId, amount) {
  try {
    const room = roomsData.find(r => r.id === roomId);
    const totalDue = (room?.rent || 0) + (room?.electricityBill || 0);
    const balance = Math.max(0, totalDue - amount);
    const newStatus = balance === 0 ? 'paid' : 'partial';

    await updateDoc(doc(db, 'rooms', roomId), {
      status: newStatus,
      amountPaid: amount,
      balanceDue: balance,
      paidDate: new Date().toISOString(),
      paymentInitiatedAt: null,
      paymentApp: null
    });

    showToast(`✓ Payment of ₹${amount.toLocaleString('en-IN')} confirmed!`, 'success');
    window.fetchRoomsFromCloud();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.rejectPaymentVerification = async function(roomId) {
  const ok = await showConfirm('Reject Payment?', 'The tenant will see their payment as still pending.', 'Yes, Reject', true);
  if (!ok) return;
  try {
    await updateDoc(doc(db, 'rooms', roomId), {
      status: 'pending',
      paymentInitiatedAt: null,
      paymentApp: null,
      paymentAmount: null
    });
    showToast('Payment request rejected', 'error');
    window.fetchRoomsFromCloud();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function getTimeAgo(date) {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

// ══════════════════════════════════════════
// HOOK: subscribe to inbox when owner views dashboard
// ══════════════════════════════════════════

// After fetchRoomsFromCloud, start listening for complaints & verifications
const _origFetchRooms = window.fetchRoomsFromCloud;
window.fetchRoomsFromCloud = async function() {
  if (_origFetchRooms) await _origFetchRooms();
  subscribeToOwnerInbox();
};

// Also init language on load
document.addEventListener('DOMContentLoaded', () => {
  applyLanguage(currentLanguage);
});

// Refresh settings avatar when ownerProfile loads
const _origLoadOwnerProfile = window.loadOwnerProfile;
// Note: loadOwnerProfile is not window-exposed, we patch auth state instead.
// The refreshSettingsHeader() is called in switchView, so it'll auto-update.

// ══════════════════════════════════════════
// ISSUE 2 + 3: Physical Back Button & Exit Modal
// ══════════════════════════════════════════

// Push an initial home state so the first popstate always has somewhere to land
window.history.replaceState({ view: 'view-owner' }, '', window.location.pathname);

window.addEventListener('popstate', function(e) {
    const state = e.state;

    // Back from a sub-page → always return to owner dashboard, never exit modal
    if (_currentViewId && _currentViewId !== 'view-owner' && _currentViewId !== 'view-login') {
        window.switchView('view-owner');
        return;
    }

    // If state carries a returnTo view, go there
    if (state && state.returnTo && state.returnTo !== 'view-login') {
        window.switchView(state.returnTo);
        return;
    }

    // Only show exit modal when already on the home/dashboard screen
    showExitModal();
    // Re-push home state so the stack isn't empty (prevents double-back bypassing modal)
    window.history.pushState({ view: 'view-owner' }, '', window.location.pathname);
});

// ── Exit Modal helpers ────────────────────────────────────────────────────────

window.showExitModal = function() {
    const modal = document.getElementById('exit-app-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    // Trigger CSS enter animation
    requestAnimationFrame(() => {
        modal.querySelector('#exit-modal-box')?.classList.remove('scale-90', 'opacity-0');
    });
};

window.hideExitModal = function() {
    const modal = document.getElementById('exit-app-modal');
    if (!modal) return;
    const box = modal.querySelector('#exit-modal-box');
    if (box) { box.classList.add('scale-90', 'opacity-0'); }
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        if (box) box.classList.remove('scale-90', 'opacity-0');
        // Re-push home state so back stack stays intact after "No"
        window.history.pushState({ view: 'view-owner' }, '', window.location.pathname);
    }, 250);
};

window.confirmExitApp = function() {
    // Try native close (works in PWA / Android WebView); fallback to history navigation
    try {
        window.close();
    } catch (e) { /* ignore */ }
    // Give window.close() a moment; if still open, navigate back to a "dead" state
    setTimeout(() => {
        window.history.go(-2);
    }, 150);
};

