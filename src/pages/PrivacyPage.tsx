import { Link } from 'react-router-dom';

/** PRD §11 — privacy policy, written to be understandable, not legalese. */
export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-10 prose-sm">
        <h1 className="text-3xl font-extrabold text-ink tracking-tight mb-2">Privacy policy</h1>
        <p className="text-sm text-ink-subtle mb-8">Last updated: 31 July 2026</p>

        <Section title="1. What we collect">
          <p>Your phone number, name, and — only while you have an active ride — your location. Riders also provide a national ID number and plate number for verification.</p>
        </Section>

        <Section title="2. How location is used">
          <p>While you are requesting a ride, riders see only an approximate position (about 150–200 m) with a distance band and direction. Your exact pickup point is revealed only after you confirm a rider. Riders' live location is shared with their passenger until the ride ends.</p>
        </Section>

        <Section title="3. How long we keep things">
          <p>Location data is deleted after 90 days. Payment records are kept for accounting and dispute resolution. You can revoke location consent at any time in Settings, and nothing more is stored from that moment.</p>
        </Section>

        <Section title="4. Who we share with">
          <p>Only what is needed for a ride to happen: the two people in a matched ride see each other's name and relevant ride details. Payments are processed by PayPack and the mobile money operator you choose.</p>
        </Section>

        <Section title="5. Your rights">
          <p>You can ask us to export or delete your data at any time by contacting support through the MotoConnect page. Cancellation penalties and reliability scores are explained in the{' '}
            <Link to="/terms" className="text-emerald-800 underline">terms of service</Link>.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-bold text-ink mb-2">{title}</h2>
      <p className="text-sm text-ink/65 leading-relaxed">{children}</p>
    </section>
  );
}
