/**
 * Ops-console API surface (admin spec §3 information architecture).
 *
 * Role gating is applied per route from the data-driven matrix in §2.1:
 *   super_admin — everything, and the only role that manages admin accounts.
 *   support     — read-only on rides / users / disputes.
 *   finance_ops — payments, subscriptions, refunds; never verification or bans.
 *
 * Every mutating handler below delegates to a service that runs the state
 * change and its audit row in one transaction (see lib/audit.ts).
 */
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../lib/validation.js';
import { adminH, requireAdmin, requireAdminRole, type AdminRequest } from '../../lib/adminAuth.js';
import { adminAuthRouter } from './auth.js';
import {
  approveRider,
  getRiderDocumentFile,
  getRiderReview,
  listQueue,
  rejectRider,
  requestMoreInfo,
  revealNationalId,
  REJECTION_CODES,
  INFO_REQUEST_CODES,
} from '../../services/admin/verificationService.js';
import {
  getUserDetail,
  listUsers,
  MODERATION_REASON_CODES,
  overrideVerification,
  setAccountStatus,
  updateUserBasics,
  warnUser,
} from '../../services/admin/usersService.js';
import {
  getRideDetail,
  listDisputes,
  listLiveRides,
  overrideRideStatus,
  resolveDispute,
} from '../../services/admin/liveOpsService.js';
import {
  adjustQuota,
  issueRefund,
  listPayments,
  listRefunds,
  listSubscriptions,
  markRefundSettled,
  overQuotaRiders,
  providerRefundAvailable,
  reconcilePayment,
  reconciliationExceptions,
  REFUND_REASON_CODES,
  revenueSummary,
} from '../../services/admin/financeService.js';
import {
  auditFilterOptions,
  dashboardSummary,
  dashboardTrends,
  listAuditLog,
} from '../../services/admin/dashboardService.js';
import { listReports, runReport, toCsv } from '../../services/admin/reportsService.js';
import {
  ADMIN_ROLES,
  createAdmin,
  listAdmins,
  resendSetupLink,
  resetAdminMfa,
  setAdminStatus,
} from '../../services/admin/adminAccountService.js';

export const adminRouter = Router();

adminRouter.use('/auth', adminAuthRouter);

/** Everything past this point needs a live, second-factor-satisfied session. */
adminRouter.use(requireAdmin);

const anyRole = requireAdminRole('super_admin', 'support', 'finance_ops');
const financeRole = requireAdminRole('super_admin', 'finance_ops');
const opsRole = requireAdminRole('super_admin');

const reasonText = z.string().trim().min(5, 'Write a reason.').max(2000);
const noteText = z.string().trim().min(3, 'Write a note.').max(2000);

// ─── §10 dashboard ───────────────────────────────────────────────────────────
adminRouter.get('/dashboard', anyRole, adminH(async (_req, res) => {
  res.json(await dashboardSummary());
}));

adminRouter.get('/dashboard/trends', anyRole, adminH(async (req, res) => {
  res.json({ days: await dashboardTrends(Number(req.query.days) || 14) });
}));

// ─── §4 verification queue ───────────────────────────────────────────────────
adminRouter.get('/verification', anyRole, adminH(async (req, res) => {
  res.json(
    await listQueue({
      sort: req.query.sort as 'oldest' | 'newest' | 'name' | undefined,
      search: req.query.search as string | undefined,
      status: req.query.status as never,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 25,
    })
  );
}));

adminRouter.get('/verification/:riderId', anyRole, adminH(async (req: AdminRequest, res) => {
  res.json(await getRiderReview(req.admin!, req.params.riderId));
}));

adminRouter.post('/verification/:riderId/reveal-id', anyRole, adminH(async (req: AdminRequest, res) => {
  res.json(await revealNationalId(req.admin!, req.params.riderId));
}));

/**
 * §4.2 — the document image itself. The ONLY path to these bytes: no static
 * route serves the upload directory, so an admin session is the sole key.
 * Viewing one is a PII access event and is logged before the bytes are sent.
 */
adminRouter.get(
  '/verification/:riderId/documents/:docId/file',
  anyRole,
  adminH(async (req: AdminRequest, res) => {
    const doc = await getRiderDocumentFile(req.admin!, req.params.riderId, req.params.docId);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `inline; filename="${doc.kind}"`);
    res.send(doc.bytes);
  })
);

/**
 * §4.4 — there is no bulk-approve endpoint, and that is deliberate. Every rider
 * verification is a distinct liability decision; batching invites rubber-stamping.
 */
adminRouter.post('/verification/:riderId/approve', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(z.object({ note: z.string().trim().max(2000).optional() }), req.body, 'Check the approval');
  res.json(await approveRider(req.admin!, req.params.riderId, body.note));
}));

adminRouter.post('/verification/:riderId/reject', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({ reasonCode: z.enum(REJECTION_CODES), reasonFreetext: reasonText }),
    req.body,
    'Check the rejection'
  );
  res.json(await rejectRider(req.admin!, req.params.riderId, body));
}));

adminRouter.post('/verification/:riderId/request-info', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({ reasonCode: z.enum(INFO_REQUEST_CODES), note: reasonText }),
    req.body,
    'Check the request'
  );
  res.json(await requestMoreInfo(req.admin!, req.params.riderId, body));
}));

// ─── §5 live ops ─────────────────────────────────────────────────────────────
adminRouter.get('/live/rides', anyRole, adminH(async (_req, res) => {
  res.json({ rides: await listLiveRides(), at: new Date().toISOString() });
}));

adminRouter.get('/live/rides/:rideId', anyRole, adminH(async (req: AdminRequest, res) => {
  res.json(await getRideDetail(req.admin!, req.params.rideId));
}));

adminRouter.get('/disputes', anyRole, adminH(async (req, res) => {
  res.json({ disputes: await listDisputes({ includeResolved: req.query.includeResolved === 'true' }) });
}));

adminRouter.post('/disputes/:rideId/resolve', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      outcome: z.enum(['dismissed', 'warned', 'suspended', 'banned']),
      reasonCode: z.string().trim().max(60).optional(),
      note: noteText,
    }),
    req.body,
    'Check the resolution'
  );
  res.json(await resolveDispute(req.admin!, req.params.rideId, body));
}));

adminRouter.post('/live/rides/:rideId/override', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      status: z.enum(['COMPLETED', 'CANCELLED_BY_PASSENGER', 'CANCELLED_BY_RIDER', 'NO_SHOW', 'EXPIRED']),
      reasonFreetext: reasonText,
    }),
    req.body,
    'Check the override'
  );
  res.json(await overrideRideStatus(req.admin!, req.params.rideId, body));
}));

// ─── §6 users ────────────────────────────────────────────────────────────────
adminRouter.get('/users', anyRole, adminH(async (req, res) => {
  res.json(
    await listUsers({
      search: req.query.search as string | undefined,
      role: req.query.role as never,
      status: req.query.status as never,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 25,
    })
  );
}));

adminRouter.get('/users/:userId', anyRole, adminH(async (req: AdminRequest, res) => {
  res.json(await getUserDetail(req.admin!, req.params.userId));
}));

/** §6.3 direct-edit bucket — no confirmation step, still written to the audit log. */
adminRouter.patch('/users/:userId', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      name: z.string().trim().min(2).max(50).optional(),
      phone: z.string().trim().min(6).max(20).optional(),
      adminNotes: z.string().max(4000).optional(),
    }),
    req.body,
    'Check the details'
  );
  res.json(await updateUserBasics(req.admin!, req.params.userId, body));
}));

/** §6.3 gated bucket — confirm + reason + audit. Banning also needs the typed phone. */
adminRouter.post('/users/:userId/status', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      status: z.enum(['active', 'suspended', 'banned']),
      reasonCode: z.enum(MODERATION_REASON_CODES),
      reasonFreetext: reasonText,
      suspendDays: z.number().int().min(1).max(365).optional(),
      confirmPhone: z.string().trim().optional(),
    }),
    req.body,
    'Check the decision'
  );
  res.json(await setAccountStatus(req.admin!, req.params.userId, body));
}));

adminRouter.post('/users/:userId/warn', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      reasonCode: z.enum(MODERATION_REASON_CODES),
      reasonFreetext: reasonText,
      rideRequestId: z.string().uuid().optional(),
    }),
    req.body,
    'Check the warning'
  );
  res.json(await warnUser(req.admin!, req.params.userId, body));
}));

adminRouter.post('/users/:userId/verification', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      status: z.enum(['pending_verification', 'verified', 'rejected']),
      reasonFreetext: reasonText,
    }),
    req.body,
    'Check the override'
  );
  res.json(await overrideVerification(req.admin!, req.params.userId, body));
}));

// ─── §7 finance ──────────────────────────────────────────────────────────────
adminRouter.get('/finance/summary', financeRole, adminH(async (_req, res) => {
  res.json({ revenue: await revenueSummary(), providerRefundAvailable: providerRefundAvailable() });
}));

adminRouter.get('/finance/subscriptions', financeRole, adminH(async (req, res) => {
  res.json(
    await listSubscriptions({
      tier: req.query.tier as string | undefined,
      filter: req.query.filter as never,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 25,
    })
  );
}));

adminRouter.get('/finance/over-quota', financeRole, adminH(async (req, res) => {
  res.json({ riders: await overQuotaRiders(Number(req.query.days) || 30) });
}));

adminRouter.get('/finance/payments', financeRole, adminH(async (req, res) => {
  res.json(
    await listPayments({
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 25,
    })
  );
}));

adminRouter.get('/finance/reconciliation', financeRole, adminH(async (_req, res) => {
  const ex = await reconciliationExceptions();
  res.json({
    orphanPayments: ex.orphanPayments,
    unpaidSubscriptions: ex.unpaidSubscriptions,
    stalePendingPayments: ex.stalePendingPayments,
    total: ex.total,
  });
}));

adminRouter.post('/finance/payments/:paymentId/reconcile', financeRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      action: z.enum(['link_subscription', 'mark_void', 'mark_resolved']),
      subscriptionId: z.string().uuid().optional(),
      note: noteText,
    }),
    req.body,
    'Check the reconciliation'
  );
  res.json(await reconcilePayment(req.admin!, req.params.paymentId, body));
}));

adminRouter.get('/finance/refunds', financeRole, adminH(async (_req, res) => {
  res.json({ refunds: await listRefunds(), providerRefundAvailable: providerRefundAvailable() });
}));

adminRouter.post('/finance/payments/:paymentId/refund', financeRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      amount: z.number().int().positive(),
      reasonCode: z.enum(REFUND_REASON_CODES),
      reasonFreetext: reasonText,
      rideRequestId: z.string().uuid().optional(),
    }),
    req.body,
    'Check the refund'
  );
  res.json(await issueRefund(req.admin!, req.params.paymentId, body));
}));

adminRouter.post('/finance/refunds/:refundId/settle', financeRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({ providerRef: z.string().trim().min(3).max(120), note: noteText }),
    req.body,
    'Check the payout'
  );
  res.json(await markRefundSettled(req.admin!, req.params.refundId, body));
}));

adminRouter.post('/finance/subscriptions/:subscriptionId/quota', financeRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      claimsCap: z.number().int().min(0).nullable().optional(),
      claimsUsed: z.number().int().min(0).optional(),
      extendDays: z.number().int().min(1).max(365).optional(),
      reasonFreetext: reasonText,
    }),
    req.body,
    'Check the adjustment'
  );
  res.json(await adjustQuota(req.admin!, req.params.subscriptionId, body));
}));

// ─── §9.2 audit log viewer (read-only by construction) ───────────────────────
adminRouter.get('/audit', anyRole, adminH(async (req, res) => {
  res.json(
    await listAuditLog({
      adminUserId: req.query.adminUserId as string | undefined,
      actionType: req.query.actionType as string | undefined,
      targetType: req.query.targetType as string | undefined,
      targetId: req.query.targetId as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 50,
    })
  );
}));

adminRouter.get('/audit/options', anyRole, adminH(async (_req, res) => {
  res.json(await auditFilterOptions());
}));

// ─── reports ─────────────────────────────────────────────────────────────────
adminRouter.get('/reports', anyRole, adminH(async (_req, res) => {
  res.json({ reports: listReports() });
}));

adminRouter.get('/reports/:key', anyRole, adminH(async (req, res) => {
  const out = await runReport(req.params.key, Number(req.query.days) || 30);
  if (req.query.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${out.key}-${out.days}d.csv"`);
    res.send(toCsv(out.rows));
    return;
  }
  res.json(out);
}));

// ─── §2.1 settings: admin account management (super_admin only) ──────────────
adminRouter.get('/admins', opsRole, adminH(async (_req, res) => {
  res.json({ admins: await listAdmins(), roles: ADMIN_ROLES });
}));

adminRouter.post('/admins', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({
      email: z.string().trim().email('Enter a valid email address.'),
      role: z.enum(['super_admin', 'support', 'finance_ops']),
      reasonFreetext: reasonText,
    }),
    req.body,
    'Check the new admin'
  );
  res.json(await createAdmin(req.admin!, body));
}));

adminRouter.post('/admins/:id/resend-setup', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(z.object({ reasonFreetext: reasonText }), req.body, 'Check the request');
  res.json(await resendSetupLink(req.admin!, req.params.id, body.reasonFreetext));
}));

adminRouter.post('/admins/:id/status', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(
    z.object({ status: z.enum(['active', 'suspended']), reasonFreetext: reasonText }),
    req.body,
    'Check the change'
  );
  res.json(await setAdminStatus(req.admin!, req.params.id, body.status, body.reasonFreetext));
}));

adminRouter.post('/admins/:id/reset-mfa', opsRole, adminH(async (req: AdminRequest, res) => {
  const body = validate(z.object({ reasonFreetext: reasonText }), req.body, 'Check the reset');
  res.json(await resetAdminMfa(req.admin!, req.params.id, body.reasonFreetext));
}));
