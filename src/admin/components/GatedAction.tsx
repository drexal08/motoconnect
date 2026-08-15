/**
 * The gated-action dialog (admin spec §4.3, §6.3).
 *
 * One component implements the whole contract, so no screen can quietly ship a
 * cheaper version of it:
 *
 *   • an explicit confirmation step — never a single misclick-able button;
 *   • a reason code from a fixed enum, where the action defines one;
 *   • freetext, required wherever the spec says a reason is mandatory
 *     (rejections, every finance action, every moderation decision);
 *   • a typed confirmation for the highest-friction action of all — banning an
 *     account, where the operator must type the user's phone number.
 *
 * The server independently enforces every one of these. This dialog is the
 * ergonomics; it is not the control.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Field, Modal, Select, TextArea, TextInput } from './ui';
import { OpsApiError } from '../api';

export interface ReasonOption {
  value: string;
  label: string;
}

export interface GatedActionResult {
  reasonCode?: string;
  reasonFreetext: string;
}

export function GatedActionDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  reasonCodes,
  reasonLabel = 'Reason',
  freetextLabel = 'Details',
  freetextRequired = true,
  freetextHint,
  typedConfirmation,
  extraFields,
  summary,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'warn';
  reasonCodes?: ReasonOption[];
  reasonLabel?: string;
  freetextLabel?: string;
  freetextRequired?: boolean;
  freetextHint?: string;
  /** When set, the operator must type `value` exactly before the action unlocks. */
  typedConfirmation?: { label: string; value: string; hint?: string };
  /** Action-specific inputs (suspension length, refund amount, …). */
  extraFields?: ReactNode;
  /** A plain-language "this is what will happen" block. */
  summary?: ReactNode;
  onCancel: () => void;
  onConfirm: (result: GatedActionResult) => Promise<void>;
}) {
  const [reasonCode, setReasonCode] = useState('');
  const [freetext, setFreetext] = useState('');
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset on every open so a previous reason can never be reused by accident.
  useEffect(() => {
    if (open) {
      setReasonCode(reasonCodes?.length ? '' : '');
      setFreetext('');
      setTyped('');
      setError(null);
      setSubmitting(false);
    }
  }, [open, reasonCodes]);

  const needsReasonCode = !!reasonCodes?.length;
  const reasonCodeOk = !needsReasonCode || reasonCode !== '';
  const freetextOk = !freetextRequired || freetext.trim().length >= 5;
  const typedOk = !typedConfirmation || typed.trim() === typedConfirmation.value;
  const canSubmit = reasonCodeOk && freetextOk && typedOk && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({ reasonCode: needsReasonCode ? reasonCode : undefined, reasonFreetext: freetext.trim() });
    } catch (err) {
      setError(err instanceof OpsApiError ? err.message : 'That did not go through. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} title={title} onClose={submitting ? () => {} : onCancel}>
      <div className="space-y-3.5">
        <div className="text-[13px] text-slate-700">{description}</div>

        {summary ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[12px] text-slate-700">
            {summary}
          </div>
        ) : null}

        {extraFields}

        {needsReasonCode ? (
          <Field label={reasonLabel} required>
            <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="">Choose a reason…</option>
              {reasonCodes!.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          label={freetextLabel}
          required={freetextRequired}
          hint={freetextHint ?? (freetextRequired ? 'At least 5 characters. This is written to the audit log.' : undefined)}
        >
          <TextArea
            value={freetext}
            onChange={(e) => setFreetext(e.target.value)}
            placeholder="What happened, and why this decision?"
          />
        </Field>

        {typedConfirmation ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2 mb-2 text-[12px] text-red-800">
              <AlertTriangle size={15} className="mt-px shrink-0" />
              <span>This cannot be undone by a single click. Type the value below to confirm.</span>
            </div>
            <Field label={typedConfirmation.label} hint={typedConfirmation.hint} required>
              <TextInput
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={typedConfirmation.value}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button tone="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button tone={tone} onClick={submit} disabled={!canSubmit} loading={submitting}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
