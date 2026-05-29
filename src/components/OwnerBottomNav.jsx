import { BarChart3, Home, Settings, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const items = [
  { label: 'Home', icon: Home, hash: '' },
  { label: 'Tenants', icon: Users, hash: 'tenants' },
  { label: 'Analytics', icon: BarChart3, hash: 'analytics' },
  { label: 'Settings', icon: Settings, hash: 'settings' }
];

export default function OwnerBottomNav() {
  const navigate = useNavigate();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] px-4 pb-[calc(12px+env(safe-area-inset-bottom))]">
      <div className="glass grid grid-cols-4 rounded-3xl p-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className="flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold text-white/72"
              onClick={() => navigate(item.hash ? `/owner-home#${item.hash}` : '/owner-home')}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
