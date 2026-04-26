window.renderRooms = function() {
    const listHome = document.getElementById('room-list-home');
    const listAll = document.getElementById('room-list-all');
    const listLedger = document.getElementById('room-list-ledger');

    if(listHome) listHome.innerHTML = ''; if(listAll) listAll.innerHTML = ''; if(listLedger) listLedger.innerHTML = '';

    let totalRev = 0, pendingRev = 0, collectedRev = 0;

    if (roomsData.length === 0) {
        const emptyMsg = '<p class="text-center text-gray-500 text-sm py-8 bg-white rounded-2xl border border-gray-100">No rooms found. Add a room!</p>';
        if(listHome) listHome.innerHTML = emptyMsg; if(listAll) listAll.innerHTML = emptyMsg; if(listLedger) listLedger.innerHTML = emptyMsg;
    } else {
        roomsData.forEach((room, index) => { // 'index' add kiya hai taaki dynamic delay de saken agar zaroorat pade
            const rent = Number(room.rent) || 0;
            const tenantName = room.tenantName && room.tenantName.trim() !== '' ? room.tenantName : 'Vacant (Khali Hai)';
            const status = room.status || 'pending'; 
            
            if (tenantName !== 'Vacant (Khali Hai)') {
                totalRev += rent;
                if(status === 'pending') pendingRev += rent; else collectedRev += rent;
            }

            const badgeHtml = tenantName === 'Vacant (Khali Hai)' 
                ? '<span class="px-3 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold rounded-full">VACANT</span>'
                : (status === 'pending' ? '<span class="px-3 py-1 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full shadow-inner">PENDING</span>' : '<span class="px-3 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-full shadow-inner">PAID</span>');

            const quickAssignBtnHtml = tenantName === 'Vacant (Khali Hai)' ? `<button onclick="quickAssignTenant('${room.id}', '${room.roomNo}')" class="text-green-500 hover:text-green-700 active:scale-75 p-1 mr-1 transition-transform"><i class="fa-solid fa-user-plus"></i></button>` : '';
            const toggleBtnHtml = tenantName !== 'Vacant (Khali Hai)' ? `<button onclick="togglePaymentStatus('${room.id}', '${status}')" class="text-xl p-1 transition-colors duration-150 active:scale-75 ${status === 'pending' ? 'text-gray-300' : 'text-green-500'}"><i class="fa-solid fa-circle-check"></i></button>` : '';
            const vacateBtnHtml = tenantName !== 'Vacant (Khali Hai)' ? `<button onclick="vacateRoom('${room.id}')" class="text-gray-400 hover:text-orange-500 active:scale-75 p-1 ml-1 transition-transform"><i class="fa-solid fa-person-walking-arrow-right"></i></button>` : '';

            const isVacant = tenantName === 'Vacant (Khali Hai)';
            const cardBgColor = isVacant ? 'bg-red-50/50' : 'bg-green-50/50';
            const roomNoBgColor = isVacant ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600';

            // ADDED: 'room-card-animate' class aur interactivity hover par
            const cardHtml = `
            <div class="${cardBgColor} p-4 rounded-2xl border ${isVacant?'border-red-200':'border-green-200'} flex items-center justify-between mb-3 shadow-sm hover:shadow-md hover:border-gray-300 active:scale-[0.98] transition-all duration-200 room-card-animate">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 ${roomNoBgColor} rounded-xl flex items-center justify-center font-bold shadow-inner">${room.roomNo}</div>
                    <div><h4 class="font-semibold text-gray-800">${tenantName}</h4><p class="text-xs text-gray-500">Rent: ₹${rent}/mo</p></div>
                </div>
                <div class="flex items-center gap-3">${badgeHtml}${quickAssignBtnHtml}${toggleBtnHtml}${vacateBtnHtml}<button onclick="deleteRoom('${room.id}')" class="text-gray-400 hover:text-red-500 active:scale-75 p-1 transition"><i class="fa-solid fa-trash"></i></button></div>
            </div>`;
            if(listHome) listHome.innerHTML += cardHtml; if(listAll) listAll.innerHTML += cardHtml; if(listLedger) listLedger.innerHTML += cardHtml;
        });
    }

    if(document.getElementById('total-revenue')) document.getElementById('total-revenue').innerText = '₹' + totalRev.toLocaleString('en-IN');
    if(document.getElementById('total-pending')) document.getElementById('total-pending').innerText = '₹' + pendingRev.toLocaleString('en-IN');
    if(document.getElementById('ledger-total-due')) document.getElementById('ledger-total-due').innerText = '₹' + pendingRev.toLocaleString('en-IN');
    if(document.getElementById('ledger-collected')) document.getElementById('ledger-collected').innerText = '₹' + collectedRev.toLocaleString('en-IN');
}
