import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, updateDoc, setDoc, query, where, getDoc, onSnapshot, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

window.downloadReceipt = function() {
    const element = document.getElementById('receipt-content');
    const opt = {
        margin: 10,
        filename: `receipt-room-${receiptState.roomNo}.pdf`,
        image: { type: 'image/png', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    
    // For now, show toast (html2pdf library would be needed for full implementation)
    showToast('📄 Receipt can be printed using Ctrl+P or Cmd+P', 'success');
}

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
    // Generate printable HTML
    const receiptHTML = `
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: white; }
            .receipt { max-width: 400px; margin: 0 auto; border: 2px solid #10b981; border-radius: 12px; padding: 30px; }
            .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 20px; }
            .header h2 { margin: 0; color: #059669; }
            .detail-row { display: flex; justify-content: space-between; margin: 12px 0; }
            .detail-row span:first-child { color: #666; font-weight: bold; }
            .detail-row span:last-child { text-align: right; font-weight: bold; }
            .amount-box { background: #dcfce7; border: 2px solid #10b981; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
            .amount-box .label { color: #666; font-size: 12px; }
            .amount-box .value { font-size: 32px; color: #059669; font-weight: bold; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; }
            .print-hint { text-align: center; color: #999; font-size: 10px; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="receipt">
            <div class="header">
                <h2>✓ PAYMENT RECEIPT</h2>
                <p style="color: #999; margin: 5px 0;">Khata Pro Digital Receipt</p>
            </div>
            
            <div class="detail-row">
                <span>Building</span>
                <span>${receiptState.buildingName}</span>
            </div>
            <div class="detail-row">
                <span>Room No.</span>
                <span>${receiptState.roomNo}</span>
            </div>
            <div class="detail-row">
                <span>Tenant</span>
                <span>${receiptState.tenantName}</span>
            </div>
            <div class="detail-row">
                <span>Period</span>
                <span>${receiptState.monthYear}</span>
            </div>
            <div class="detail-row">
                <span>Date</span>
                <span>${receiptState.date.toLocaleDateString('en-IN')}</span>
            </div>
            <div class="detail-row">
                <span>Receipt No.</span>
                <span>${receiptState.receiptNo}</span>
            </div>
            
            <div class="amount-box">
                <div class="label">AMOUNT PAID</div>
                <div class="value">₹${receiptState.rent.toLocaleString('en-IN')}</div>
            </div>
            
            <div class="footer">
                <p>Thank you for the payment! 🙏</p>
                <p style="margin-top: 10px;">Generated by Khata Pro</p>
            </div>
            <div class="print-hint">Print this receipt for your records</div>
        </div>
    </body>
    </html>`;

    const printWindow = window.open('', '', 'width=600,height=800');
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.print();
    showToast('Opening print preview...', 'success');
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
        setTimeout(() => modal.classList.remove('opacity-0'), 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden'); resolve(val); }, 300);
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
        setTimeout(() => { modal.classList.remove('opacity-0'); input.focus(); }, 10);

        const closeAndResolve = (val) => {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden'); resolve(val); }, 300);
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
    modal.classList.add('opacity-0');
    sheet.classList.add('translate-y-full');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

window.shareViaWhatsAppAction = function() {
    const msg = `🏠 Join my Room Khata app! Click here to register:\n${currentShareLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    closeShareModal();
}

window.copyShareLinkAction = async function() {
    try { 
        await navigator.clipboard.writeText(currentShareLink); 
        closeShareModal(); 
        showToast("✨ Magic Link Copied!", "success"); 
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
let ownerProfile = { name: '', address: '' };

async function loadOwnerProfile(uid) {
    try {
        const q = query(collection(db, "ownerProfiles"), where("uid", "==", uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = snap.docs[0].data();
            ownerProfile = { name: data.name || '', address: data.address || '' };
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

    // Render each building group
    Object.entries(groupedByBuilding).forEach(([buildingId, rooms]) => {
        const bName = getBuildingName(buildingId);
        const buildingHTML = `
        <div class="building-card">
            <!-- Building Header with Edit/Delete -->
            <div class="bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-3xl p-4 mb-4 shadow-lg">
                <div class="flex justify-between items-center">
                    <div class="flex-1">
                        <p class="text-indigo-100 text-xs font-bold uppercase">Building</p>
                        <h3 class="text-2xl font-black mt-1">${bName}</h3>
                    </div>
                    <div class="flex items-center gap-2">
                        <!-- Feature 4: Edit Building -->
                        ${buildingId !== 'no-building' ? `
                        <button onclick="openEditBuilding('${buildingId}','${bName}')" class="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-xl flex items-center justify-center transition-all active:scale-90" title="Rename Building">
                            <i class="fa-solid fa-pencil text-xs"></i>
                        </button>
                        <button onclick="deleteBuilding('${buildingId}')" class="w-8 h-8 bg-white/20 hover:bg-red-400/60 rounded-xl flex items-center justify-center transition-all active:scale-90" title="Delete Building">
                            <i class="fa-solid fa-trash text-xs"></i>
                        </button>
                        ` : ''}
                        <div class="text-right ml-2">
                            <p class="text-indigo-100 text-xs font-bold">Rooms</p>
                            <p class="text-2xl font-black mt-1">${rooms.length}</p>
                        </div>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-indigo-400 flex justify-between">
                    <div>
                        <p class="text-indigo-100 text-xs">Occupied</p>
                        <p class="font-bold">${rooms.filter(r => r.tenantName?.trim()).length}</p>
                    </div>
                    <div>
                        <p class="text-indigo-100 text-xs">Vacant</p>
                        <p class="font-bold">${rooms.filter(r => !r.tenantName?.trim()).length}</p>
                    </div>
                </div>
            </div>

            <!-- Rooms Grid -->
            <div class="room-grid">
                ${rooms.map((room) => {
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
                    
                    let statusBadge = '';
                    if (isVacant) {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg">Vacant</span>';
                    } else if (status === 'paid') {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg">✓ Paid</span>';
                    } else if (isPartial) {
                        statusBadge = `<span class="inline-block px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-lg">⟳ Partial</span>`;
                    } else {
                        statusBadge = '<span class="inline-block px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-lg">⏳ Pending</span>';
                    }

                    return `
                    <div class="room-card-grid bg-white rounded-2xl border-2 ${isVacant ? 'border-gray-200' : (status === 'paid' ? 'border-green-200' : (isPartial ? 'border-blue-200' : 'border-orange-200'))} p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-1 relative">
                        <!-- Feature 4: Edit/Delete Room icons -->
                        <div class="absolute top-2 right-2 flex gap-1 z-10">
                            <button onclick="event.stopPropagation(); openEditRoom('${room.id}', '${room.roomNo}', ${rent})" class="w-6 h-6 bg-blue-100 hover:bg-blue-200 rounded-lg flex items-center justify-center transition-all active:scale-90" title="Edit Room">
                                <i class="fa-solid fa-pencil text-blue-600 text-[10px]"></i>
                            </button>
                            ${isVacant ? `<button onclick="event.stopPropagation(); deleteRoom('${room.id}', true)" class="w-6 h-6 bg-red-100 hover:bg-red-200 rounded-lg flex items-center justify-center transition-all active:scale-90" title="Delete Room">
                                <i class="fa-solid fa-trash text-red-600 text-[10px]"></i>
                            </button>` : ''}
                        </div>

                        <!-- Room Avatar -->
                        <div class="w-full mb-2">
                            <div class="w-full aspect-square ${isVacant ? 'bg-gradient-to-br from-gray-200 to-gray-300' : 'bg-gradient-to-br from-blue-500 to-indigo-600'} rounded-xl flex items-center justify-center text-white font-black text-xl shadow-md">
                                ${isVacant ? '<i class="fa-solid fa-door-open text-2xl opacity-50"></i>' : initials}
                            </div>
                        </div>
                        
                        <!-- Room Info -->
                        <div class="text-center mb-1">
                            <p class="text-sm font-black text-gray-900">Room ${room.roomNo}</p>
                            <p class="text-[11px] font-semibold text-gray-500 truncate">${tenantName}</p>
                        </div>

                        <!-- Security Deposit (Feature 2) -->
                        ${securityDeposit > 0 ? `<div class="text-center mb-1">
                            <span class="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md">🔒 Dep: ₹${securityDeposit.toLocaleString('en-IN')}</span>
                        </div>` : ''}

                        <!-- Electricity Bill Badge (Feature 3) -->
                        ${electricityBill > 0 ? `<div class="text-center mb-1">
                            <span class="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-md">⚡ +₹${electricityBill.toLocaleString('en-IN')}</span>
                        </div>` : ''}
                        
                        <!-- Rent Info -->
                        <div class="text-center pb-1 border-b border-gray-100 mb-1">
                            <p class="text-[11px] text-gray-500">Rent ${electricityBill > 0 ? '+ Elec' : ''}</p>
                            <p class="text-sm font-bold text-gray-900">₹${totalDue.toLocaleString('en-IN')}</p>
                        </div>

                        <!-- Balance Due (Feature 1) -->
                        ${(isPartial && balanceDue > 0) ? `<div class="text-center mb-1">
                            <span class="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md">Due: ₹${balanceDue.toLocaleString('en-IN')}</span>
                        </div>` : ''}
                        
                        <!-- Status Badge -->
                        <div class="text-center mb-2">${statusBadge}</div>
                        
                        <!-- Action Buttons -->
                        ${!isVacant ? `
                        <div class="flex flex-col gap-1">
                            <!-- Feature 1: Payment toggle (opens partial payment modal) -->
                            <button onclick="togglePaymentStatus('${room.id}','${status}')" class="w-full py-1.5 ${status === 'paid' ? 'bg-orange-100 text-orange-700 hover:bg-orange-200' : 'bg-green-100 text-green-700 hover:bg-green-200'} text-[11px] font-bold rounded-lg transition-all active:scale-95">
                                ${status === 'paid' ? '⏳ Undo' : '₹ Receive'}
                            </button>
                            <!-- Feature 3: Electricity Bill -->
                            <button onclick="openElectricityModal('${room.id}', '${room.roomNo}')" class="w-full py-1.5 bg-yellow-100 text-yellow-700 hover:bg-yellow-200 text-[11px] font-bold rounded-lg transition-all active:scale-95">
                                ⚡ Bill
                            </button>
                        </div>
                        ` : `
                        <button onclick="quickAssign('${room.id}', '${room.roomNo}')" class="w-full py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 text-[11px] font-bold rounded-lg transition-all active:scale-95">
                            + Assign
                        </button>
                        `}
                    </div>
                    `;
                }).join('')}
            </div>
        </div>
        `;
        
        container.innerHTML += buildingHTML;
    });

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
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const revenueData = months.map((_, i) => {
        const occupied = roomsData.filter(r => r.tenantName && r.tenantName.trim() !== '').length;
        return occupied * (roomsData[0]?.rent || 5000) + Math.random() * 10000;
    });
    
    const occupied = roomsData.filter(r => r.tenantName && r.tenantName.trim() !== '').length;
    const vacant = roomsData.length - occupied;

    // Revenue Chart
    if (chartInstances.revenueChart) chartInstances.revenueChart.destroy();
    chartInstances.revenueChart = new Chart(canvas1, {
        type: 'line',
        data: {
            labels: months,
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
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });

    // Occupancy Chart
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
                }
            }
        }
    });
}

// ==========================================
// ACTIONS
// ==========================================

window.switchView = function(viewId) {
    document.querySelectorAll('.view-section').forEach(v => v.classList.remove('view-active'));
    setTimeout(() => {
        const view = document.getElementById(viewId);
        if (view) view.classList.add('view-active');
        
        if(viewId === 'view-owner') window.fetchRoomsFromCloud();
        if(viewId === 'view-analytics') setTimeout(updateAnalytics, 300);
        
        // Update navbar
        document.querySelectorAll('.navbar-item').forEach(item => item.classList.remove('active'));
        if(viewId === 'view-owner') document.querySelectorAll('.navbar-item')[0].classList.add('active');
        if(viewId === 'view-tenants') document.querySelectorAll('.navbar-item')[1].classList.add('active');
        if(viewId === 'view-payments') document.querySelectorAll('.navbar-item')[2].classList.add('active');
        if(viewId === 'view-settings') document.querySelectorAll('.navbar-item')[3].classList.add('active');
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
    document.getElementById('kyc-modal').classList.remove('hidden');
}

window.closeKycModal = function() {
    document.getElementById('kyc-modal').classList.add('hidden');
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
        await updateDoc(doc(db, "rooms", kycRoomId), {
            tenantName: name,
            tenantPhone: phone,
            moveInDate: movein,
            securityDeposit: deposit,
            idProof: idproof,
            status: "pending"
        });
        showToast("👤 Tenant assigned with KYC!", "success");
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
    document.getElementById('partial-payment-modal').classList.remove('hidden');
}

window.closePartialPaymentModal = function() {
    document.getElementById('partial-payment-modal').classList.add('hidden');
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
            const { signInAnonymously } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
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

window.addExpense = async function() {
    const category = await showPrompt("Add Expense", "Category (Maintenance, Repair, etc.)");
    if(!category) return;
    
    const amount = await showPrompt("Expense Amount", "Amount (₹)");
    if(!amount) return;
    
    expenses.push({
        id: Date.now(),
        category,
        amount: Number(amount),
        date: new Date().toLocaleDateString('en-IN')
    });
    
    showToast("💰 Expense added!", "success");
    renderExpenses();
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

window.deleteExpense = function(id) {
    expenses = expenses.filter(e => e.id !== id);
    showToast("Expense deleted", "success");
    renderExpenses();
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

window.toggleNotifications = function() {
    showToast("🔔 You have 2 pending payments", "success");
}

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
    
    // Apply payment filter — treat 'partial' as pending for filter purposes
    if (filterState.paymentFilter !== 'all') {
        if (filterState.paymentFilter === 'pending') {
            filtered = filtered.filter(r => r.status === 'pending' || r.status === 'partial');
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
    document.getElementById('electricity-modal').classList.remove('hidden');

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
    document.getElementById('electricity-modal').classList.add('hidden');
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
    document.getElementById('edit-room-modal').classList.remove('hidden');
}

window.closeEditRoomModal = function() {
    document.getElementById('edit-room-modal').classList.add('hidden');
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
    document.getElementById('edit-building-modal').classList.remove('hidden');
}

window.closeEditBuildingModal = function() {
    document.getElementById('edit-building-modal').classList.add('hidden');
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

window.openUpiModal = function() {
    if (!tenantRoomData) return;
    const balanceDue = tenantRoomData.balanceDue ?? ((tenantRoomData.rent || 0) + (tenantRoomData.electricityBill || 0));
    const upiAmtEl = document.getElementById('upi-amount-display');
    if (upiAmtEl) upiAmtEl.textContent = `₹${balanceDue.toLocaleString('en-IN')}`;

    // Show owner UPI (stored in building or ownerProfile — use placeholder)
    const upiIdEl = document.getElementById('upi-id-display');
    if (upiIdEl) upiIdEl.textContent = 'owner@upi'; // Owner can configure this

    document.getElementById('upi-modal').classList.remove('hidden');
    document.getElementById('upi-modal').classList.add('flex');
}

window.closeUpiModal = function() {
    document.getElementById('upi-modal').classList.add('hidden');
    document.getElementById('upi-modal').classList.remove('flex');
}

window.openUpiApp = function(app) {
    if (!tenantRoomData) return;
    const balanceDue = tenantRoomData.balanceDue ?? ((tenantRoomData.rent || 0) + (tenantRoomData.electricityBill || 0));
    const upiId = 'owner@upi'; // Replace with actual owner UPI from Firestore
    const name = encodeURIComponent('Rent Payment');
    const amount = balanceDue;

    const upiUrls = {
        gpay: `tez://upi/pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`,
        phonepe: `phonepe://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`,
        paytm: `paytmmp://pay?pa=${upiId}&pn=${name}&am=${amount}&cu=INR`
    };

    const url = upiUrls[app];
    if (url) {
        window.location.href = url;
        // Fallback after 1.5s if app not installed
        setTimeout(() => {
            showToast('App not found. Please use QR code above.', 'error');
        }, 1500);
    }
    closeUpiModal();
}

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

    document.getElementById('complaint-modal').classList.remove('hidden');
    document.getElementById('complaint-modal').classList.add('flex');

    // Live char count
    const desc = document.getElementById('complaint-desc');
    desc.oninput = () => {
        const len = desc.value.length;
        document.getElementById('complaint-char-count').textContent = `${len} / 300`;
        if (len > 300) desc.value = desc.value.slice(0, 300);
    };
}

window.closeComplaintModal = function() {
    document.getElementById('complaint-modal').classList.add('hidden');
    document.getElementById('complaint-modal').classList.remove('flex');
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
