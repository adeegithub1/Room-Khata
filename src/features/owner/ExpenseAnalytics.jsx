import { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { currency } from '../../lib/format.js';

export default function ExpenseAnalytics({ rooms, expenses }) {
  const data = useMemo(() => {
    const months = new Map();
    const now = new Date();

    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = date.toLocaleString('en-IN', { month: 'short' });
      months.set(key, { month: key, income: 0, expenses: 0 });
    }

    rooms.forEach((room) => {
      const key = new Date().toLocaleString('en-IN', { month: 'short' });
      months.get(key).income += Number(room.amountPaid || 0);
    });

    expenses.forEach((expense) => {
      const key = new Date(expense.date).toLocaleString('en-IN', { month: 'short' });
      if (months.has(key)) months.get(key).expenses += Number(expense.amount || 0);
    });

    return Array.from(months.values());
  }, [rooms, expenses]);

  return (
    <section className="glass mt-7 rounded-[28px] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Income vs Expenses</h2>
          <p className="text-xs text-white/50">Last six months</p>
        </div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.58)', fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.06)' }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="rounded-2xl border border-white/12 bg-[#12092f] p-3 text-xs text-white shadow-glass">
                    {payload.map((item) => (
                      <p key={item.dataKey}>
                        {item.name}: <span className="money">{currency(item.value)}</span>
                      </p>
                    ))}
                  </div>
                ) : null
              }
            />
            <Bar name="Income" dataKey="income" fill="#62E6AC" radius={[8, 8, 0, 0]} />
            <Bar name="Expenses" dataKey="expenses" fill="#FF7A8A" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
