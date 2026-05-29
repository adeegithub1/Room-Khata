export function buildUpiUrl({ pa, pn = 'RoomKhata Pro', am, tn, tr }) {
  const params = new URLSearchParams({
    pa,
    pn,
    am: Number(am || 0).toFixed(2),
    cu: 'INR',
    tn,
    tr
  });
  return `upi://pay?${params.toString()}`;
}

export function openUpiPayment(payload) {
  window.location.href = buildUpiUrl(payload);
}
