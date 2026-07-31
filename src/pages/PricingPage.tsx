import { useEffect, useState } from 'react';
import { Check, Loader2, Smartphone, TrendingUp } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../api/client';
import type { DemandIndicator, Payment, Tier } from '../api/types';
import { Badge, Button, FormField, Input, Modal } from '../components/ui';
import { cn } from '../lib/cn';

const TIERS: {
  tier: Tier;
  label: string;
  price: string;
  amount: number;
  cap: string;
  period: string;
  desc: string;
  highlight?: boolean;
}[] = [
  { tier: 'agahozo', label: 'Agahozo', price: '500 RWF', amount: 500, cap: '10 claims', period: 'per day', desc: 'For part-time riders. Perfect for a busy evening.' },
  { tier: 'isonga', label: 'Isonga', price: '3,000 RWF', amount: 3000, cap: '80 claims', period: 'per week', desc: 'For full-time riders who work most days.' },
  { tier: 'impuruza', label: 'Impuruza', price: '10,000 RWF', amount: 10_000, cap: 'Unlimited claims', period: 'per month', desc: 'For top earners. Unlimited claims, fastest map updates.', highlight: true },
];

/** §5 — plans priced for mobile money (MTN MoMo + Airtel Money via PayPack). */
export default function PricingPage() {
  const auth = useAuthStore();
  const [demand, setDemand] = useState<DemandIndicator | null>(null);
  const [checkoutTier, setCheckoutTier] = useState<Tier | null>(null);
  const [momoPhone, setMomoPhone] = useState('');
  const [paying, setPaying] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'success' | 'failed'>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DemandIndicator>('/api/payments/demand').then(setDemand).catch(() => {});
  }, []);

  // Poll the payment until the payer approves on their phone.
  useEffect(() => {
    if (!paymentId) return;
    setPaymentStatus('pending');
    const t = setInterval(async () => {
      try {
        const p = await api<Payment>(`/api/payments/${paymentId}`);
        setPaymentStatus(p.status);
        if (p.status !== 'pending') clearInterval(t);
      } catch {
        clearInterval(t);
      }
    }, 2_000);
    return () => clearInterval(t);
  }, [paymentId]);

  const startPurchase = async () => {
    if (!checkoutTier) return;
    setError(null);
    setPaying(true);
    try {
      const res = await api<{ paymentId: string }>('/api/payments/subscriptions/purchase', {
        method: 'POST',
        body: { tier: checkoutTier, phone: momoPhone },
      });
      setPaymentId(res.paymentId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the payment.');
    } finally {
      setPaying(false);
    }
  };

  const tier = TIERS.find((t) => t.tier === checkoutTier);
  const isRider = auth.user?.role === 'rider';

  return (
    <div className="min-h-screen imigongo-bg pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-ink tracking-tight">Plans for riders</h1>
          <p className="text-sm text-ink/55 mt-2 max-w-md mx-auto">
            Pay with MTN MoMo or Airtel Money. A claim only counts after the passenger confirms you
            — expired claims are free.
          </p>
          {isRider && demand && (
            <p className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-full px-4 py-2">
              <TrendingUp size={16} />
              {demand.nearMe != null
                ? `${demand.nearMe} passengers requesting rides near you right now`
                : `${demand.visibleRequests} passengers requesting rides right now`}
            </p>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {TIERS.map((t) => (
            <div
              key={t.tier}
              className={cn(
                'imigongo-card rounded-3xl p-6 flex flex-col',
                t.highlight && 'ring-2 ring-amber-400'
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-extrabold text-ink text-lg">{t.label}</h2>
                {t.highlight && <Badge tone="amber">Most popular</Badge>}
              </div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold text-ink tracking-tight">{t.price}</span>
                <span className="text-sm font-semibold text-ink/45">{t.period}</span>
              </div>
              <p className="text-sm text-ink/55 mt-2 mb-4">{t.desc}</p>
              <ul className="space-y-2 text-sm text-ink/75 mb-6">
                <li className="flex items-center gap-2"><Check size={16} className="text-emerald-700 shrink-0" /> {t.cap}</li>
                <li className="flex items-center gap-2"><Check size={16} className="text-emerald-700 shrink-0" /> Anonymous radar view</li>
                <li className="flex items-center gap-2"><Check size={16} className="text-emerald-700 shrink-0" /> No fee if the passenger does not confirm</li>
              </ul>
              <div className="mt-auto">
                <Button fullWidth variant={t.highlight ? 'secondary' : 'primary'} onClick={() => { setCheckoutTier(t.tier); setMomoPhone(''); setPaymentId(null); }}>
                  Choose {t.label}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-ink/40 text-center mt-8 max-w-md mx-auto">
          Payments are collected by PayPack and sent to MTN MoMo or Airtel Money. You approve the
          payment on your phone. In development without PayPack credentials, purchases are
          simulated automatically.
        </p>

        <Modal open={!!checkoutTier} onClose={() => setCheckoutTier(null)} title={`Pay for ${tier?.label} — ${tier?.price}`}>
          {paymentId && paymentStatus === 'pending' ? (
            <div className="space-y-4 text-center py-4">
              <Loader2 size={32} className="animate-spin text-emerald-700 mx-auto" />
              <div>
                <p className="font-bold text-ink">Payment request sent</p>
                <p className="text-sm text-ink/55 mt-1">
                  Approve the {momoPhone.startsWith('078') || momoPhone.startsWith('079') ? 'MTN MoMo' : 'Airtel Money'} prompt on your phone.
                </p>
              </div>
              <p className="text-xs text-ink/45">Waiting for approval — this can take a minute.</p>
            </div>
          ) : paymentStatus === 'success' ? (
            <div className="space-y-4 text-center py-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                <Check size={28} />
              </div>
              <div>
                <p className="font-bold text-ink">Plan activated</p>
                <p className="text-sm text-ink/55 mt-1">Your {tier?.label} plan is live. Happy riding!</p>
              </div>
              <Button fullWidth onClick={() => { setCheckoutTier(null); setPaymentId(null); window.location.href = '/rider'; }}>
                Go to my radar
              </Button>
            </div>
          ) : paymentStatus === 'failed' ? (
            <div className="space-y-4 text-center py-4">
              <p className="font-bold text-ink">Payment did not go through</p>
              <p className="text-sm text-ink/55">The payment was not completed. Check the number and try again.</p>
              <Button fullWidth variant="outline" onClick={() => { setPaymentId(null); setPaymentStatus('pending'); }}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink/65">
                Enter the mobile money number to pay from. You will get a payment prompt on your phone.
              </p>
              <FormField label="Mobile money number" htmlFor="momo" hint="MTN MoMo or Airtel Money — you approve the payment on this phone.">
                <Input
                  id="momo"
                  inputMode="tel"
                  placeholder="0788 123 456"
                  value={momoPhone}
                  onChange={(e) => setMomoPhone(e.target.value)}
                />
              </FormField>
              {error && <p className="text-sm font-medium text-red-700">{error}</p>}
              <Button fullWidth loading={paying} disabled={momoPhone.trim().length < 9} onClick={startPurchase}>
                <Smartphone size={18} /> Pay {tier?.price} with mobile money
              </Button>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
