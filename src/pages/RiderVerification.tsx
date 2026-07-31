import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Clock3, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { api } from '../api/client';
import type { VerificationStatus } from '../api/types';
import { Button, EmptyState } from '../components/ui';
import { LogoFull } from '../components/Logo';

/**
 * §4.2 gate: a rider cannot see any passenger requests — anonymized or
 * otherwise — until a human verifies their National ID + licence.
 */
export default function RiderVerificationPage() {
  const auth = useAuthStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    api<{ status: { verificationStatus: VerificationStatus; rejectionReason: string | null } }>('/api/riders/status')
      .then((r) => {
        setStatus(r.status.verificationStatus);
        setReason(r.status.rejectionReason);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (status === 'verified') navigate('/rider', { replace: true });
  }, [status, navigate]);

  const statusView = auth.riderVerification ?? status;

  if (statusView === 'rejected') {
    return (
      <GateShell>
        <EmptyState
          icon={<ShieldAlert size={26} />}
          title="Your application was not approved"
          body={
            reason ??
            'The details you submitted could not be verified. Contact support to sort this out.'
          }
        />
      </GateShell>
    );
  }

  return (
    <GateShell>
      <EmptyState
        icon={statusView === 'pending_verification' ? <Clock3 size={26} /> : <BadgeCheck size={26} />}
        title={
          statusView === 'pending_verification'
            ? 'Your details are being checked'
            : 'Application received'
        }
        body={
          statusView === 'pending_verification'
            ? 'We verify every National ID and licence by hand. This usually takes one working day. You will not see any ride requests until this is done.'
            : 'We are reviewing your National ID and driver licence.'
        }
      />
      <p className="text-xs text-ink/45 text-center px-6 pb-6">
        This check keeps every passenger safe. If you think this is taking too long, sign out and
        contact support with your phone number.
      </p>
    </GateShell>
  );
}

function GateShell({ children }: { children: React.ReactNode }) {
  const auth = useAuthStore();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen imigongo-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="imigongo-card rounded-3xl overflow-hidden">
          <div className="flex justify-center pt-8 pb-2">
            <LogoFull />
          </div>
          <div className="pt-4">{children}</div>
          <div className="px-6 pb-6">
            <Button
              variant="outline"
              fullWidth
              onClick={() => {
                auth.logout();
                navigate('/');
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
