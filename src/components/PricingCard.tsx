import React from 'react';
import { IconCheck, IconBolt } from './Icons';

export interface PricingTier {
  id: string;
  name: string;
  price: number;
  views: number;
  duration: string;
  description: string;
  features: string[];
  popular?: boolean;
  color: string;
  badgeColor: string;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    id: 'agahozo',
    name: 'Agahozo',
    price: 500,
    views: 10,
    duration: 'Daily',
    description: 'Daily plan. Perfect for part-time riders.',
    features: [
      'Up to 10 passenger requests',
      'Daily access',
      'Real-time GPS tracking',
      'Quick map updates',
    ],
    color: 'border-emerald-200',
    badgeColor: 'bg-emerald-50 text-emerald-700',
  },
  {
    id: 'isonga',
    name: 'Isonga',
    price: 3000,
    views: 80,
    duration: 'Weekly',
    description: 'Weekly plan. Built for standard full-time riders.',
    features: [
      'Up to 80 passenger requests',
      'Weekly access',
      'Real-time GPS tracking',
      'Fast alerts',
      'Priority matching',
    ],
    popular: true,
    color: 'border-amber-200',
    badgeColor: 'bg-amber-50 text-amber-700',
  },
  {
    id: 'impuruza',
    name: 'Impuruza',
    price: 10000,
    views: -1,
    duration: 'Monthly',
    description: 'Monthly plan. Unlimited pings + fastest updates.',
    features: [
      'Unlimited passenger requests',
      'Monthly access',
      'Real-time GPS tracking',
      'Fastest map updates',
      'VIP matching',
      'Analytics dashboard',
    ],
    color: 'border-emerald-300',
    badgeColor: 'bg-amber-400 text-emerald-950',
  },
];

interface PricingCardProps {
  tier: PricingTier;
  onSelect: (tier: PricingTier) => void;
  currentTier?: string;
}

const PricingCard: React.FC<PricingCardProps> = ({ tier, onSelect, currentTier }) => {
  const isCurrent = currentTier === tier.id;
  const isUnlimited = tier.views === -1;

  return (
    <div
      className={`relative bg-white rounded-2xl border-2 ${tier.popular ? tier.color : 'border-[#e3e6ed]'} 
        p-5 sm:p-6 transition-all hover:shadow-card flex flex-col
        ${tier.popular ? 'ring-1 ring-primary-100' : ''}
        ${isCurrent ? 'ring-2 ring-primary-500' : ''}
      `}
    >
      {tier.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 bg-primary-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
            <IconBolt size={10} /> Most Popular
          </span>
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 right-4">
          <span className="inline-flex items-center bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
            Active
          </span>
        </div>
      )}
      <div className="mb-4">
        <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tier.badgeColor} mb-2`}>
          {tier.name}
        </span>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-extrabold text-gray-900">
            {tier.price === 0 ? 'Free' : `${tier.price.toLocaleString()}`}
          </span>
          {tier.price > 0 && <span className="text-sm text-gray-400 font-medium">RWF</span>}
        </div>
        <p className="text-xs text-gray-400 mt-1">{tier.description}</p>
      </div>
      <div className="flex gap-4 mb-4 py-3 border-y border-[#eceef3]">
        <div>
          <div className="text-lg font-extrabold text-gray-900">
            {isUnlimited ? 'Unlimited' : tier.views}
          </div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {isUnlimited ? 'Views' : 'Passengers'}
          </div>
        </div>
        <div className="w-px bg-[#eceef3]" />
        <div>
          <div className="text-lg font-extrabold text-gray-900">{tier.duration}</div>
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Access</div>
        </div>
      </div>
      <ul className="space-y-2.5 mb-6 flex-1">
        {tier.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
            <IconCheck size={14} className="text-primary-500 mt-0.5 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => onSelect(tier)}
        disabled={isCurrent}
        className={`w-full font-bold py-2.5 rounded-xl transition-all text-sm active:scale-[0.99]
          ${isCurrent
            ? 'bg-emerald-50 text-emerald-700 cursor-default'
            : tier.popular
              ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm hover:shadow'
              : 'bg-surface-secondary hover:bg-[#eef0f4] text-gray-800 border border-[#e3e6ed]'
          }
        `}
      >
        {isCurrent ? 'Current Plan' : tier.price === 0 ? 'Get Started Free' : `Pay ${tier.price.toLocaleString()} RWF`}
      </button>
    </div>
  );
};

export default PricingCard;
