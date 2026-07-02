import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  IconMapPin,
  IconLocation,
  IconPhone,
  IconArrowRight,
  IconClock,
  IconShield,
  IconMotorcycle,
  IconWallet,
  IconCheck,
  IconUser,
  IconUsers,
} from '@/components/Icons';
import { LogoFull } from '@/components/Logo';
import { ImigongoBackground, ImigongoDivider, ImigongoBar, ImigongoMotif } from '@/components/Imigongo';
import MapComponent from '@/components/MapComponent';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const howItWorksPassenger = [
    { icon: <IconUser size={22} />, title: 'Sign up', desc: 'Create a passenger account in seconds' },
    { icon: <IconLocation size={22} />, title: 'Share location', desc: 'Enable GPS to share your pickup location' },
    { icon: <IconMotorcycle size={22} />, title: 'Get a ride', desc: 'Nearby motorcyclists see you and come pick you up' },
    { icon: <IconCheck size={22} />, title: 'Pay & ride', desc: 'Pay cash or mobile money when you arrive' },
  ];

  const howItWorksRider = [
    { icon: <IconUser size={22} />, title: 'Sign up as rider', desc: 'Register as a motorcyclist' },
    { icon: <IconWallet size={22} />, title: 'Choose a plan', desc: 'Pick a subscription tier that fits your needs' },
    { icon: <IconMapPin size={22} />, title: 'Find passengers', desc: 'See passengers near you on the live map' },
    { icon: <IconPhone size={22} />, title: 'Pick up & earn', desc: 'Call passengers, pick them up, and get paid' },
  ];

  return (
    <div className="min-h-screen bg-surface-secondary">
      <section className="relative overflow-hidden bg-white">
        <ImigongoBackground opacity={0.025} />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-primary-100/40" />
          <div className="absolute -bottom-48 -left-32 w-[380px] h-[380px] rounded-full bg-primary-50/50" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-20 sm:pb-28">
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2.5 bg-primary-50/80 backdrop-blur-sm border border-primary-100 rounded-full px-4 py-1.5 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse-dot" />
              <span className="text-[11px] font-bold text-primary-700 tracking-wide uppercase">Rwanda's Ride-Sharing Platform</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold text-gray-900 leading-[1.08] tracking-tight mb-5">
              Get a ride anywhere<br />
              <span className="text-primary-700">in Rwanda</span>
            </h1>
            <p className="text-gray-500 text-[15px] sm:text-base max-w-lg mx-auto leading-relaxed mb-8">
              Share your location, find nearby motorcyclists, and get where you need to go safely and quickly.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/signup')}
                className="w-full sm:w-auto bg-primary-700 hover:bg-primary-800 text-white font-bold px-8 py-3.5 rounded-xl transition-all hover:shadow-lg hover:shadow-primary-200 active:scale-[0.99] flex items-center justify-center gap-2 text-[14px]"
              >
                <IconUser size={18} /> Get Started as Passenger
              </button>
              <button
                onClick={() => navigate('/signup?role=rider')}
                className="w-full sm:w-auto bg-white hover:bg-surface-secondary text-primary-700 font-bold px-8 py-3.5 rounded-xl transition-all border-2 border-primary-200 hover:border-primary-300 active:scale-[0.99] flex items-center justify-center gap-2 text-[14px]"
              >
                <IconMotorcycle size={18} /> Sign Up as Rider
              </button>
            </div>
          </div>
          <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden border border-[#e3e6ed] shadow-card">
            <MapComponent height="400px" interactive={false} defaultZoom={12} />
          </div>
        </div>
        <ImigongoDivider color="#1c3f94" opacity={0.06} />
      </section>

      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-3">
              <ImigongoMotif size={20} className="text-primary-600" />
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">For Passengers</h2>
              <ImigongoMotif size={20} className="text-primary-600" />
            </div>
            <p className="text-gray-400 mt-1 text-sm">Request a ride in 4 simple steps</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {howItWorksPassenger.map((step, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#e3e6ed] p-5 sm:p-6 relative group hover:border-primary-200 hover:shadow-sm transition-all">
                <div className="absolute top-4 right-4 text-[11px] font-extrabold text-gray-200/80">{String(i + 1).padStart(2, '0')}</div>
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center mb-4">{step.icon}</div>
                <h3 className="font-bold text-gray-900 text-[13px] mb-1">{step.title}</h3>
                <p className="text-gray-400 text-xs leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-3">
              <ImigongoMotif size={20} className="text-primary-600" />
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">For Motorcyclists</h2>
              <ImigongoMotif size={20} className="text-primary-600" />
            </div>
            <p className="text-gray-400 mt-1 text-sm">Earn more with MotoConnect</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {howItWorksRider.map((step, i) => (
              <div key={i} className="bg-surface-secondary rounded-2xl border border-[#e3e6ed] p-5 sm:p-6 relative group hover:border-primary-200 hover:shadow-sm transition-all">
                <div className="absolute top-4 right-4 text-[11px] font-extrabold text-gray-200/80">{String(i + 1).padStart(2, '0')}</div>
                <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center mb-4">{step.icon}</div>
                <h3 className="font-bold text-gray-900 text-[13px] mb-1">{step.title}</h3>
                <p className="text-gray-400 text-xs leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-14 bg-primary-800 overflow-hidden">
        <ImigongoBackground color="#ffffff" opacity={0.015} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {[
              { value: '1,200+', label: 'Daily rides' },
              { value: '500+', label: 'Active riders' },
              { value: '15,000+', label: 'Passengers' },
              { value: '98%', label: 'Satisfaction' },
            ].map((s, i) => (
              <div key={i}>
                <div className="text-2xl sm:text-3xl font-extrabold text-white">{s.value}</div>
                <div className="text-primary-300 text-xs font-medium mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-3">Rider Pricing Plans</h2>
            <p className="text-gray-400 text-sm max-w-md mx-auto">Choose a plan that fits your needs. Upgrade anytime to see more passengers.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: 'Free', price: '0', views: '3', duration: '7 days', color: 'bg-gray-50' },
              { name: 'Basic', price: '500', views: '10', duration: '2 hours', color: 'bg-primary-50' },
              { name: 'Pro', price: '1,000', views: '25', duration: '6 hours', color: 'bg-primary-50', popular: true },
              { name: 'Max', price: '3,500', views: 'Unlimited', duration: '24 hours', color: 'bg-amber-50' },
            ].map((plan, i) => (
              <div key={i} className={`relative bg-white rounded-2xl border border-[#e3e6ed] p-5 hover:shadow-sm transition-all ${plan.popular ? 'ring-1 ring-primary-200' : ''}`}>
                {plan.popular && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary-600 text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                    Popular
                  </span>
                )}
                <h3 className="font-bold text-gray-900 text-sm mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-extrabold text-gray-900">{plan.price}</span>
                  <span className="text-xs text-gray-400">RWF</span>
                </div>
                <div className="space-y-1 mb-4">
                  <div className="text-xs text-gray-600"><strong className="text-gray-900">{plan.views}</strong> passengers</div>
                  <div className="text-xs text-gray-600"><strong className="text-gray-900">{plan.duration}</strong> access</div>
                </div>
                <button
                  onClick={() => navigate('/pricing')}
                  className="w-full text-xs font-bold py-2 rounded-lg transition-all bg-surface-secondary hover:bg-[#eef0f4] text-gray-700 border border-[#e3e6ed]"
                >
                  Learn more
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Why MotoConnect?</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: <IconShield size={22} />, title: 'Safe & Secure', desc: 'Verified riders, GPS tracking, and secure payments ensure every ride is safe.' },
              { icon: <IconMapPin size={22} />, title: 'Real-time GPS', desc: 'See exactly where your rider or passenger is with live location sharing.' },
              { icon: <IconClock size={22} />, title: 'Quick pickups', desc: 'With hundreds of riders across Kigali, get picked up in minutes.' },
            ].map((f, i) => (
              <div key={i} className="text-center p-6">
                <div className="w-12 h-12 rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center mx-auto mb-4">{f.icon}</div>
                <h3 className="font-bold text-gray-900 text-sm mb-2">{f.title}</h3>
                <p className="text-gray-400 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 bg-primary-50 overflow-hidden">
        <ImigongoBackground color="#1c3f94" opacity={0.03} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mb-4">Ready to get started?</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto mb-8">Join thousands of passengers and riders already using MotoConnect across Rwanda.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/signup')}
              className="w-full sm:w-auto bg-primary-700 hover:bg-primary-800 text-white font-bold px-8 py-3 rounded-xl transition-all hover:shadow-lg active:scale-[0.99] flex items-center justify-center gap-2 text-sm"
            >
              <IconUser size={18} /> Sign Up Now
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto bg-white hover:bg-surface-secondary text-primary-700 font-bold px-8 py-3 rounded-xl transition-all border border-primary-200 active:scale-[0.99] flex items-center justify-center gap-2 text-sm"
            >
              <IconArrowRight size={18} /> Log In
            </button>
          </div>
        </div>
      </section>

      <ImigongoBar className="bg-gray-900" color="#ffffff" height={5} />
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            <div>
              <div className="mb-4"><LogoFull size="sm" variant="white" /></div>
              <p className="text-xs leading-relaxed text-gray-500">Rwanda's leading motorcycle ride-sharing platform. Connecting passengers with trusted riders.</p>
            </div>
            <div>
              <h4 className="text-white text-[11px] font-bold uppercase tracking-wider mb-3">Quick Links</h4>
              <div className="flex flex-col gap-2 text-xs">
                <Link to="/signup" className="hover:text-white transition-colors">Sign Up</Link>
                <Link to="/login" className="hover:text-white transition-colors">Login</Link>
                <Link to="/pricing" className="hover:text-white transition-colors">Rider Pricing</Link>
              </div>
            </div>
            <div>
              <h4 className="text-white text-[11px] font-bold uppercase tracking-wider mb-3">Contact</h4>
              <div className="flex flex-col gap-2 text-xs">
                <span className="flex items-center gap-2"><IconMapPin size={13} /> Kigali, Rwanda</span>
                <span className="flex items-center gap-2"><IconPhone size={13} /> +250 788 000 001</span>
                <span className="flex items-center gap-2"><IconUsers size={13} /> info@motoconnect.rw</span>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-center text-[11px] text-gray-600">
            &copy; {new Date().getFullYear()} MotoConnect Rwanda. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
