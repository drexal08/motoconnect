import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import PricingCard, { PRICING_TIERS } from '@/components/PricingCard';
import type { PricingTier } from '@/components/PricingCard';
import {
  IconCheck,
  IconMTN,
  IconArrowLeft,
  IconBuy,
  IconPhone,
} from '@/components/Icons';
import { ImigongoBackground, ImigongoMotif } from '@/components/Imigongo';

type PaymentStep = 'select' | 'payment' | 'success';

const PricingPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<PaymentStep>('select');
  const [selectedTier, setSelectedTier] = useState<PricingTier | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'card'>('momo');
  const [phoneNumber, setPhoneNumber] = useState(user?.phone || '+250 ');
  const [processing, setProcessing] = useState(false);

  const currentTier = user?.subscription?.tier;

  const handleSelectTier = (tier: PricingTier) => {
    if (tier.id === 'free') {
      updateUser({
        subscription: {
          tier: 'free',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          viewsRemaining: 3,
        },
      });
      setSelectedTier(tier);
      setStep('success');
    } else {
      setSelectedTier(tier);
      setStep('payment');
    }
  };

  const handlePayment = async () => {
    setProcessing(true);
    await new Promise(r => setTimeout(r, 2000));
    if (selectedTier) {
      const durationMs = selectedTier.id === 'basic' ? 2 * 60 * 60 * 1000 :
        selectedTier.id === 'pro' ? 6 * 60 * 60 * 1000 :
        24 * 60 * 60 * 1000;
      updateUser({
        subscription: {
          tier: selectedTier.id as 'free' | 'basic' | 'pro' | 'max',
          expiresAt: new Date(Date.now() + durationMs).toISOString(),
          viewsRemaining: selectedTier.views,
        },
      });
    }
    setProcessing(false);
    setStep('success');
  };

  if (step === 'success' && selectedTier) {
    return (
      <div className="min-h-[calc(100vh-60px)] bg-surface-secondary flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-[400px] text-center slide-up">
          <div className="bg-white rounded-2xl border border-[#e3e6ed] shadow-sm p-8">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <IconCheck size={32} className="text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
            <p className="text-sm text-gray-500 mb-2">
              Your <strong className="text-gray-900">{selectedTier.name}</strong> plan is now active.
            </p>
            <div className="bg-surface-secondary rounded-xl p-4 mb-6 text-left">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">Plan</span>
                <span className="font-semibold text-gray-900">{selectedTier.name}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">Views</span>
                <span className="font-semibold text-gray-900">{selectedTier.views === -1 ? 'Unlimited' : selectedTier.views}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Duration</span>
                <span className="font-semibold text-gray-900">{selectedTier.duration}</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/rider')}
              className="w-full bg-primary-700 hover:bg-primary-800 text-white font-bold py-3 rounded-xl transition-all hover:shadow-lg active:scale-[0.99] text-sm"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'payment' && selectedTier) {
    return (
      <div className="min-h-[calc(100vh-60px)] bg-surface-secondary flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-[400px] slide-up">
          <button
            onClick={() => setStep('select')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <IconArrowLeft size={16} /> Back to plans
          </button>
          <div className="bg-white rounded-2xl border border-[#e3e6ed] shadow-sm p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                selectedTier.id === 'max' ? 'bg-amber-50 text-amber-600' : 'bg-primary-50 text-primary-600'
              }`}>
                <IconBuy size={20} />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Complete Payment</h2>
                <p className="text-xs text-gray-400">{selectedTier.name} Plan - {selectedTier.price.toLocaleString()} RWF</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('momo')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                    paymentMethod === 'momo'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-[#e3e6ed] bg-white text-gray-600 hover:border-primary-200'
                  }`}
                >
                  <IconMTN size={20} /> MTN MoMo
                </button>
                <button
                  onClick={() => setPaymentMethod('card')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                    paymentMethod === 'card'
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-[#e3e6ed] bg-white text-gray-600 hover:border-primary-200'
                  }`}
                >
                  <IconBuy size={18} /> Card
                </button>
              </div>
            </div>
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 block">Phone Number</label>
              <div className="relative">
                <IconPhone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  className="w-full bg-surface-secondary border border-[#eceef3] rounded-xl pl-10 pr-4 py-3 text-[13px] text-gray-800 font-medium focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all"
                  placeholder="+250 788 000 001"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                You will receive a prompt on your phone to confirm payment.
              </p>
            </div>
            <div className="bg-surface-secondary rounded-xl p-4 mb-4">
              <h4 className="text-xs font-bold text-gray-700 mb-2">Order Summary</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{selectedTier.name} Plan</span>
                  <span className="font-semibold text-gray-900">{selectedTier.price.toLocaleString()} RWF</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Passenger Views</span>
                  <span className="font-semibold text-gray-900">{selectedTier.views === -1 ? 'Unlimited' : selectedTier.views}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Access Duration</span>
                  <span className="font-semibold text-gray-900">{selectedTier.duration}</span>
                </div>
                <div className="border-t border-[#e3e6ed] pt-2 mt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-gray-900">Total</span>
                    <span className="text-primary-700">{selectedTier.price.toLocaleString()} RWF</span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={handlePayment}
              disabled={processing || phoneNumber.length < 10}
              className="w-full bg-primary-700 hover:bg-primary-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-3 rounded-xl transition-all hover:shadow-lg active:scale-[0.99] text-[13px] flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>Pay {selectedTier.price.toLocaleString()} RWF</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-60px)] bg-surface-secondary">
      <section className="relative overflow-hidden bg-white py-12 sm:py-16">
        <ImigongoBackground opacity={0.02} />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[400px] h-[400px] rounded-full bg-primary-100/30" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-primary-50 border border-primary-100 rounded-full px-3 py-1 mb-4">
            <ImigongoMotif size={14} className="text-primary-600" />
            <span className="text-[11px] font-bold text-primary-700 tracking-wide uppercase">Rider Plans</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-3">
            Choose Your Plan
          </h1>
          <p className="text-gray-500 text-sm max-w-md mx-auto">
            Select a plan that fits your needs. Upgrade anytime to see more passengers and earn more.
          </p>
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {PRICING_TIERS.map(tier => (
              <PricingCard
                key={tier.id}
                tier={tier}
                onSelect={handleSelectTier}
                currentTier={currentTier}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-14 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight text-center mb-8">Compare Plans</h2>
          <div className="bg-white rounded-2xl border border-[#e3e6ed] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary border-b border-[#e3e6ed]">
                    <th className="text-left px-5 py-3 font-bold text-gray-700 text-xs uppercase tracking-wider">Feature</th>
                    <th className="text-center px-4 py-3 font-bold text-gray-700 text-xs">Free</th>
                    <th className="text-center px-4 py-3 font-bold text-primary-700 text-xs bg-primary-50/50">Basic</th>
                    <th className="text-center px-4 py-3 font-bold text-primary-700 text-xs bg-primary-50">Pro</th>
                    <th className="text-center px-4 py-3 font-bold text-amber-700 text-xs bg-amber-50/50">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eceef3]">
                  {[
                    { feature: 'Passenger Views', free: '3', basic: '10', pro: '25', max: 'Unlimited' },
                    { feature: 'Access Duration', free: '7 days', basic: '2 hours', pro: '6 hours', max: '24 hours' },
                    { feature: 'GPS Tracking', free: true, basic: true, pro: true, max: true },
                    { feature: 'Phone Access', free: true, basic: true, pro: true, max: true },
                    { feature: 'Priority Access', free: false, basic: true, pro: true, max: true },
                    { feature: 'Instant Notifications', free: false, basic: true, pro: true, max: true },
                    { feature: 'Passenger History', free: false, basic: false, pro: true, max: true },
                    { feature: 'Route Optimization', free: false, basic: false, pro: true, max: true },
                    { feature: 'VIP Support', free: false, basic: false, pro: false, max: true },
                    { feature: 'Analytics Dashboard', free: false, basic: false, pro: false, max: true },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-surface-secondary/50 transition-colors">
                      <td className="px-5 py-3 text-gray-700 text-xs font-medium">{row.feature}</td>
                      <td className="text-center px-4 py-3">
                        {typeof row.free === 'boolean'
                          ? row.free ? <IconCheck size={14} className="text-emerald-500 mx-auto" /> : <span className="text-gray-300">-</span>
                          : <span className="text-xs text-gray-600">{row.free}</span>
                        }
                      </td>
                      <td className="text-center px-4 py-3 bg-primary-50/30">
                        {typeof row.basic === 'boolean'
                          ? row.basic ? <IconCheck size={14} className="text-emerald-500 mx-auto" /> : <span className="text-gray-300">-</span>
                          : <span className="text-xs text-gray-600">{row.basic}</span>
                        }
                      </td>
                      <td className="text-center px-4 py-3 bg-primary-50/50">
                        {typeof row.pro === 'boolean'
                          ? row.pro ? <IconCheck size={14} className="text-emerald-500 mx-auto" /> : <span className="text-gray-300">-</span>
                          : <span className="text-xs text-gray-600">{row.pro}</span>
                        }
                      </td>
                      <td className="text-center px-4 py-3 bg-amber-50/30">
                        {typeof row.max === 'boolean'
                          ? row.max ? <IconCheck size={14} className="text-emerald-500 mx-auto" /> : <span className="text-gray-300">-</span>
                          : <span className="text-xs text-gray-600 font-semibold">{row.max}</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section className="py-10 sm:py-14">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-3">
            {[
              { q: 'How do views work?', a: 'Each time you click on a passenger marker to see their full details, it counts as one view. Free users get 3 views, Basic gets 10, Pro gets 25, and Max gets unlimited views.' },
              { q: 'What happens when my plan expires?', a: 'When your plan expires, you automatically revert to the Free tier with 3 views for the next 7 days. You can upgrade again at any time.' },
              { q: 'Can I switch plans?', a: 'Yes! You can upgrade or downgrade your plan at any time. When you upgrade, the new plan takes effect immediately.' },
              { q: 'Is payment secure?', a: 'Yes, all payments are processed securely through MTN Mobile Money. We never store your payment details.' },
              { q: 'What if I need a refund?', a: 'Contact our support team within 24 hours of purchase if you are not satisfied. We offer a full refund for unused time.' },
            ].map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-[#e3e6ed] p-4">
                <h3 className="font-bold text-gray-900 text-sm mb-1">{faq.q}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default PricingPage;
