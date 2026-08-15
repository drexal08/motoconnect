/**
 * Transactional email — Postmark (admin spec §12, open question #3, answered).
 *
 * One authenticated POST, no SDK. Two Postmark-specific traps are handled here
 * rather than being discovered in production:
 *
 *  1. A rejected send can still come back as HTTP 200 with a non-zero
 *     `ErrorCode` in the body, so the status code alone is not proof of
 *     delivery — both are checked.
 *  2. `From` must be a verified Sender Signature or sit on a verified domain.
 *     ErrorCode 400 is exactly that, and it is reported in plain language
 *     because it is the single most likely reason a setup link never arrives.
 *
 * Without POSTMARK_SERVER_TOKEN the message is written to the server console
 * instead of being silently dropped, and the result always says which happened.
 * A setup token that went nowhere must never be reported as sent.
 */
import { config } from '../config.js';

export interface SendResult {
  delivered: boolean;
  channel: 'postmark' | 'console';
  detail?: string;
}

/** Postmark error codes worth translating instead of surfacing as a number. */
const KNOWN_ERRORS: Record<number, string> = {
  10: 'Postmark rejected the API token. Check POSTMARK_SERVER_TOKEN — it must be a Server token, not an Account token.',
  300: 'Postmark rejected the recipient address as invalid.',
  400: `Postmark has not verified the sender address (${'EMAIL_FROM'}). Add it as a Sender Signature, or verify the domain, in the Postmark dashboard.`,
  405: 'This Postmark server is not activated for sending.',
  406: 'The recipient is on this Postmark server\'s inactive list (a previous message hard-bounced or was marked spam).',
  412: 'This Postmark account is still in trial mode and can only send to verified addresses.',
};

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!config.email.serverToken) {
    console.log(
      `\n──────── EMAIL (not sent — POSTMARK_SERVER_TOKEN is unset) ────────\n` +
        `To:      ${to}\nSubject: ${subject}\n\n${text}\n` +
        `──────────────────────────────────────────────────────────────────\n`
    );
    return { delivered: false, channel: 'console', detail: 'POSTMARK_SERVER_TOKEN is not configured.' };
  }

  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Postmark-Server-Token': config.email.serverToken,
      },
      body: JSON.stringify({
        From: config.email.from,
        To: to,
        Subject: subject,
        TextBody: text,
        // Setup links are transactional, never broadcast — the stream matters
        // for Postmark's own deliverability reporting.
        MessageStream: config.email.messageStream,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { ErrorCode?: number; Message?: string };

    // Postmark signals failure through ErrorCode, which can accompany a 200.
    if (!res.ok || (typeof body.ErrorCode === 'number' && body.ErrorCode !== 0)) {
      const code = body.ErrorCode ?? 0;
      const detail = KNOWN_ERRORS[code] ?? body.Message ?? `Postmark returned HTTP ${res.status}.`;
      console.error(`[email] Postmark did not send (ErrorCode ${code}): ${detail}`);
      return { delivered: false, channel: 'postmark', detail };
    }

    return { delivered: true, channel: 'postmark' };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error('[email] Postmark request failed:', detail);
    return { delivered: false, channel: 'postmark', detail };
  }
}
