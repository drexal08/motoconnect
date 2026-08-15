import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, CheckCircle2, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { Button, Spinner } from '../components/ui';
import { LogoFull } from '../components/Logo';
import { ImigongoDivider } from '../components/Imigongo';

/**
 * Rider document capture (main PRD §4.2).
 *
 * Why this screen exists: verification used to receive typed numbers and
 * nothing else, so an admin could only ever approve on trust — sixteen
 * plausible digits are free to invent. Now the reviewer compares the number to
 * the document and the photo on the document to the person.
 *
 * Two constraints shape it: riders are outdoors on a phone, paying for their
 * own mobile data. So the camera opens directly (no file browser detour) and
 * every photo is downscaled in the browser before it is sent — a 4 MB camera
 * shot becomes roughly 200 kB, which is the difference between an upload that
 * completes on a weak connection and one that does not.
 */

type Kind = 'national_id' | 'license' | 'plate' | 'selfie';

interface DocSlot {
  kind: Kind;
  title: string;
  help: string;
  required: boolean;
}

const SLOTS: DocSlot[] = [
  {
    kind: 'national_id',
    title: 'Your National ID card',
    help: 'Lay it flat in good light. All four corners must be in the picture, and the numbers must be readable.',
    required: true,
  },
  {
    kind: 'license',
    title: 'Your driving licence',
    help: 'The side with your photo and licence number.',
    required: true,
  },
  {
    kind: 'plate',
    title: 'Your motorcycle plate',
    help: 'Stand close enough that the plate letters and numbers are sharp.',
    required: true,
  },
  {
    kind: 'selfie',
    title: 'A photo of you (optional)',
    help: 'Helps us match your face to your ID card. You can skip this.',
    required: false,
  },
];

/** Longest edge after downscaling — plenty to read an ID number, small to send. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Downscales and re-encodes in the browser. Also strips EXIF as a side effect
 * of going through a canvas, which removes the GPS coordinates most phones
 * stamp into a photo — we are asking for an ID card, not for where they live.
 */
async function shrinkToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process that photo.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

interface DocStatus {
  required: { kind: Kind; label: string; uploaded: boolean }[];
  complete: boolean;
  documents: { kind: Kind; uploadedAt: string }[];
}

export default function RiderDocumentsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<DocStatus | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<Kind, string>>>({});
  const [busyKind, setBusyKind] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setStatus(await api<DocStatus>('/api/riders/documents'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your documents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (kind: Kind, file: File) => {
    setError(null);
    setBusyKind(kind);
    try {
      const image = await shrinkToDataUrl(file);
      // Show it immediately — the rider should see what we received, not a spinner.
      setPreviews((p) => ({ ...p, [kind]: image }));
      const res = await api<DocStatus>('/api/riders/documents', {
        method: 'POST',
        body: { kind, image },
      });
      setStatus(res);
    } catch (e) {
      setPreviews((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
      setError(e instanceof Error ? e.message : 'That photo did not upload. Try again.');
    } finally {
      setBusyKind(null);
    }
  };

  const remove = async (kind: Kind) => {
    setBusyKind(kind);
    try {
      const res = await api<DocStatus>(`/api/riders/documents/${kind}`, { method: 'DELETE' });
      setStatus(res);
      setPreviews((p) => {
        const next = { ...p };
        delete next[kind];
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that photo.');
    } finally {
      setBusyKind(null);
    }
  };

  const uploadedKinds = new Set(status?.documents.map((d) => d.kind) ?? []);
  const complete = status?.complete ?? false;

  return (
    <div className="min-h-screen imigongo-bg px-4 py-10">
      <div className="w-full max-w-md mx-auto">
        <div className="imigongo-card rounded-3xl p-6 sm:p-8">
          <div className="flex justify-center mb-5">
            <LogoFull />
          </div>

          <h1 className="text-xl font-bold text-ink text-center mb-1">Photograph your documents</h1>
          <p className="text-sm text-ink-muted text-center mb-5">
            We check these by hand before you can take rides. Clear photos are approved faster.
          </p>

          <div className="flex items-start gap-2.5 rounded-2xl bg-emerald-50 border border-emerald-100 p-3.5 mb-5">
            <ShieldCheck size={18} className="text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900 leading-relaxed">
              Only our verification team sees these photos. They are never shown to passengers, and we
              delete them once your application has been decided.
            </p>
          </div>

          {loading ? (
            <Spinner label="Loading…" />
          ) : (
            <div className="space-y-4">
              {SLOTS.map((slot) => (
                <DocumentSlot
                  key={slot.kind}
                  slot={slot}
                  uploaded={uploadedKinds.has(slot.kind)}
                  preview={previews[slot.kind]}
                  busy={busyKind === slot.kind}
                  onPick={(file) => upload(slot.kind, file)}
                  onRemove={() => remove(slot.kind)}
                />
              ))}

              {error && <p className="text-sm font-medium text-red-700">{error}</p>}

              <Button fullWidth disabled={!complete} onClick={() => navigate('/rider/verification')}>
                {complete ? 'Send for checking' : 'Add the three required photos'}
              </Button>

              {!complete && (
                <p className="text-xs text-ink-subtle text-center">
                  Your National ID, licence and plate are required. You can come back and finish later —
                  your details are already saved.
                </p>
              )}
            </div>
          )}

          <ImigongoDivider className="my-6" />
          <button
            onClick={() => navigate('/rider/verification')}
            className="w-full text-sm font-semibold text-emerald-800 hover:underline"
          >
            I will do this later
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentSlot({
  slot,
  uploaded,
  preview,
  busy,
  onPick,
  onRemove,
}: {
  slot: DocSlot;
  uploaded: boolean;
  preview?: string;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const done = uploaded || !!preview;

  return (
    <div className={`rounded-2xl border p-3.5 ${done ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-white'}`}>
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            done ? 'bg-emerald-100 text-emerald-700' : 'bg-surface text-ink-subtle'
          }`}
        >
          {done ? <CheckCircle2 size={20} /> : <Camera size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">{slot.title}</h2>
            {slot.required && !done && <span className="text-[11px] font-semibold text-amber-700">Required</span>}
          </div>
          <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{slot.help}</p>
        </div>
      </div>

      {preview && (
        <img
          src={preview}
          alt={`${slot.title} — the photo you sent`}
          className="mt-3 w-full h-36 object-cover rounded-xl border border-border"
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // `capture` opens the camera straight away on a phone, which is where
        // riders are — hunting through a file browser outdoors is the slow path.
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = '';
        }}
      />

      <div className="flex items-center gap-2 mt-3">
        <Button
          variant={done ? 'outline' : 'primary'}
          fullWidth
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          {done ? (
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw size={14} /> Retake
            </span>
          ) : (
            'Take photo'
          )}
        </Button>
        {done && !busy && (
          <button
            onClick={onRemove}
            aria-label={`Remove the ${slot.title} photo`}
            className="w-11 h-11 shrink-0 rounded-xl border border-border text-ink-subtle hover:text-red-700 hover:border-red-200 flex items-center justify-center"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
