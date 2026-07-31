import { Link } from 'react-router-dom';

/** PRD §11 — terms of service, focused on the rules that shape the app. */
export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-10">
        <h1 className="text-3xl font-extrabold text-ink tracking-tight mb-2">Terms of service</h1>
        <p className="text-sm text-ink/50 mb-8">Last updated: 31 July 2026</p>

        <Section title="1. The service">
          <p>MotoConnect matches passengers with moto-taxi riders in Rwanda. Plans, claims, and cancellations are governed by the rules below.</p>
        </Section>

        <Section title="2. Rider plans">
          <p>Riders purchase a plan (Agahozo, Isonga, or Impuruza) with mobile money. A claim only counts against your quota after the passenger confirms you — if a request expires before confirmation, the claim is free.</p>
        </Section>

        <Section title="3. Cancellations">
          <p>Passengers who cancel twice within a rolling 7-day window receive a warning; further cancellations pause their ability to request rides for 24 hours. Riders who cancel three confirmed rides within 7 days have claims paused for 24 hours. No-shows work the same way and do not count against you.</p>
        </Section>

        <Section title="4. Privacy and location">
          <p>Your exact location is never shown to unconfirmed parties. See the{' '}
            <Link to="/privacy" className="text-emerald-800 underline">privacy policy</Link>.</p>
        </Section>

        <Section title="5. Acceptable use">
          <p>Do not abuse the matching system, cancel repeatedly to harm others, or use the app for anything other than licensed moto-taxi service in Rwanda. Verified rider status is personal and cannot be transferred.</p>
        </Section>

        <Section title="6. Changes">
          <p>We may update these terms; continued use after changes means acceptance. Questions? Contact support through the MotoConnect page.</p>
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
