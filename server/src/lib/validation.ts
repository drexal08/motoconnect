import { z } from 'zod';
import { errors } from './errors.js';
import { normalizePhone } from './phone.js';

export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown, ctx: string): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const msg = first ? `${ctx}: ${first.message}` : 'Check the information you entered.';
    throw errors.badRequest(msg);
  }
  return parsed.data as z.infer<T>;
}

export const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const norm = normalizePhone(v);
    if (!norm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid Rwandan phone number starting with 07, +2507, 072, 073, 078 or 079.',
      });
      return z.NEVER;
    }
    return norm;
  });

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Your name needs at least 2 characters.')
  .max(50, 'Your name can be at most 50 characters.');

export const latSchema = z.number().min(-90).max(90);
export const lngSchema = z.number().min(-180).max(180);

export const OTP_CODE = z
  .string()
  .regex(/^\d{6}$/, 'Enter the 6-digit code we sent you.');

export const booleanSchema = z.boolean();

export const TIERS = z.enum(['agahozo', 'isonga', 'impuruza']);

export const ID_TOKEN = z.object({
  Authorization: z.string().startsWith('Bearer '),
});
