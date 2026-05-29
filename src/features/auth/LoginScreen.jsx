import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, KeyRound, Phone } from 'lucide-react';
import MobileFrame from '../../components/MobileFrame.jsx';
import ActionButton from '../../components/ActionButton.jsx';
import { Field, SelectField } from '../../components/FormFields.jsx';
import { createPhoneVerifier, ensureUserProfile, sendPhoneOtp } from '../../services/authService.js';

export default function LoginScreen({ user, booting = false }) {
  const navigate = useNavigate();
  const verifierRef = useRef(null);
  const [step, setStep] = useState('phone');
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState({ phone: '', otp: '', role: 'owner', name: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || booting) return;
    navigate(user.role === 'owner' ? '/owner-home' : '/tenant-home', { replace: true });
  }, [booting, navigate, user]);

  async function sendOtp(event) {
    event.preventDefault();
    setError('');
    try {
      verifierRef.current ||= createPhoneVerifier('recaptcha-container');
      const result = await sendPhoneOtp(form.phone, verifierRef.current);
      setConfirmation(result);
      setStep('otp');
    } catch (err) {
      setError(err.message);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    setError('');
    try {
      const credential = await confirmation.confirm(form.otp);
      const profile = await ensureUserProfile({
        uid: credential.user.uid,
        role: form.role,
        name: form.name || 'RoomKhata User',
        phone: credential.user.phoneNumber || form.phone
      });
      navigate(profile.role === 'owner' ? '/owner-home' : '/tenant-home', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <MobileFrame>
      <section className="flex min-h-[calc(100svh-40px)] flex-col justify-center py-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold text-royal">
            <Building2 size={24} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white/62">Welcome to</p>
            <h1 className="text-2xl font-bold text-white">RoomKhata Pro</h1>
          </div>
        </div>

        <div className="glass rounded-[32px] p-6">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-royal">
            {step === 'phone' ? <Phone size={24} /> : <KeyRound size={24} />}
          </div>
          <h2 className="text-3xl font-extrabold text-white">{booting ? 'Checking session' : 'Phone login'}</h2>
          <p className="mt-3 text-sm leading-6 text-white/62">Sign in with OTP. Your role decides the next screen automatically.</p>

          <form className="mt-6 space-y-4" onSubmit={step === 'phone' ? sendOtp : verifyOtp}>
            {step === 'phone' ? (
              <>
                <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Field label="Phone Number" placeholder="+91XXXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                <SelectField label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="owner">Owner</option>
                  <option value="tenant">Tenant</option>
                </SelectField>
              </>
            ) : (
              <Field label="OTP" inputMode="numeric" value={form.otp} onChange={(e) => setForm({ ...form, otp: e.target.value })} />
            )}
            {error && <p className="text-sm text-coral">{error}</p>}
            <ActionButton className="w-full" type="submit" disabled={booting}>
              {step === 'phone' ? 'Send OTP' : 'Verify OTP'}
            </ActionButton>
          </form>
          <div id="recaptcha-container" />
        </div>
      </section>
    </MobileFrame>
  );
}
