/**
 * Finance (admin spec §7).
 *
 * Four tabs, matching the four things the spec actually asks for:
 *   Subscriptions   §7.1 — plans, claim usage, cap-hit upsell signal
 *   Payments        §7.2 — the raw ledger
 *   Reconciliation  §7.2 — the exceptions view, including the "should never
 *                   happen" case, because that is exactly the class of bug that
 *                   needs a monitoring surface
 *   Refunds         §7.3 — issued refunds and whether the money actually moved
 *
 * §7.4 is respected: no VAT, no statements, no bookkeeping. This is operational
 * reconciliation only.
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, Banknote, Receipt, Scale, TrendingUp } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  InfoNote,
  Pagination,
  SectionTitle,
  Select,
  Spinner,
  TextInput,
  useToast,
} from '../components/ui';
import { GatedActionDialog } from '../components/GatedAction';
import { useDebounced, useQuery } from '../hooks';
import { fmtDate, fmtDateTime, fmtNumber, fmtRwf, humanize } from '../format';
import { opsApi, qs } from '../api';
import type {
  Paged,
  PaymentRow,
  ReconciliationExceptions,
  RefundRow,
  SubscriptionRow,
} from '../types';

type Tab = 'subscriptions' | 'payments' | 'reconciliation' | 'refunds';

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'subscriptions';
  const setTab = (t: Tab) => setParams(t === 'subscriptions' ? {} : { tab: t });

  const summary = useQuery<{
    revenue: {
      todayRwf: number; todayCount: number; weekRwf: number; monthRwf: number;
      allTimeRwf: number; refundedTodayRwf: number; refundedMonthRwf: number;
    };
    providerRefundAvailable: boolean;
  }>('/finance/summary');

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'subscriptions', label: 'Subscriptions', icon: <TrendingUp size={13} /> },
    { key: 'payments', label: 'Payments', icon: <Banknote size={13} /> },
    { key: 'reconciliation', label: 'Reconciliation', icon: <Scale size={13} /> },
    { key: 'refunds', label: 'Refunds', icon: <Receipt size={13} /> },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-[17px] font-bold text-slate-900">Finance</h1>
        <p className="text-[12px] text-slate-500 mt-0.5">
          Operational reconciliation — did the money land, does a refund need issuing. Not bookkeeping.
        </p>
      </header>

      {summary.data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Today" value={fmtRwf(summary.data.revenue.todayRwf)} sub={`${summary.data.revenue.todayCount} payment(s)`} />
          <MiniStat label="This week" value={fmtRwf(summary.data.revenue.weekRwf)} />
          <MiniStat label="Last 30 days" value={fmtRwf(summary.data.revenue.monthRwf)} />
          <MiniStat
            label="Refunded (30d)"
            value={fmtRwf(summary.data.revenue.refundedMonthRwf)}
            sub={summary.data.revenue.refundedMonthRwf > 0 ? 'see Refunds tab' : undefined}
          />
        </div>
      ) : null}

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
              tab === t.key ? 'bg-[#0b6e4f] text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'subscriptions' ? <SubscriptionsTab /> : null}
      {tab === 'payments' ? <PaymentsTab /> : null}
      {tab === 'reconciliation' ? <ReconciliationTab /> : null}
      {tab === 'refunds' ? <RefundsTab providerRefundAvailable={summary.data?.providerRefundAvailable ?? false} /> : null}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">{label}</div>
      <div className="ops-num text-[19px] font-bold text-slate-900 mt-1">{value}</div>
      {sub ? <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div> : null}
    </Card>
  );
}

// ─── §7.1 subscriptions ──────────────────────────────────────────────────────

function SubscriptionsTab() {
  const [filter, setFilter] = useState('active');
  const [tier, setTier] = useState('all');
  const [page, setPage] = useState(1);

  const query = useQuery<Paged<SubscriptionRow>>(`/finance/subscriptions${qs({ filter, tier, page, pageSize: 25 })}`);
  const overQuota = useQuery<{ riders: { riderId: string; name: string; phone: string; blocks: number; currentTier: string | null; suggestedTier: string | null }[] }>(
    '/finance/over-quota?days=30'
  );

  return (
    <div className="space-y-3">
      <Card pad={false}>
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200">
          <h2 className="text-[13px] font-semibold text-slate-900">Subscriptions</h2>
          <div className="flex gap-2">
            <Select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} className="w-[150px]" aria-label="Filter by tier">
              <option value="all">All tiers</option>
              <option value="agahozo">Agahozo</option>
              <option value="isonga">Isonga</option>
              <option value="impuruza">Impuruza</option>
            </Select>
            <Select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} className="w-[170px]" aria-label="Filter">
              <option value="active">Active</option>
              <option value="expiring_soon">Expiring within 3 days</option>
              <option value="over_quota">At their claim cap</option>
              <option value="expired">Expired or cancelled</option>
              <option value="all">All</option>
            </Select>
          </div>
        </div>

        {query.error ? (
          <div className="p-3"><ErrorNote message={query.error} onRetry={query.reload} /></div>
        ) : query.initialLoading ? (
          <Spinner />
        ) : (query.data?.rows.length ?? 0) === 0 ? (
          <EmptyState title="No subscriptions match" body="Try a different filter." />
        ) : (
          <>
            <div className="ops-table-wrap ops-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Rider</th>
                    <th>Phone</th>
                    <th>Tier</th>
                    <th>Claims used</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th title="Times this rider hit their cap in the last 30 days">Cap hits (30d)</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data!.rows.map((s) => {
                    const pct = s.claimsCap ? Math.min(100, (s.claimsUsed / s.claimsCap) * 100) : 0;
                    return (
                      <tr key={s.id}>
                        <td className="font-medium text-slate-900">{s.rider.name}</td>
                        <td className="ops-mono text-slate-600">{s.rider.phone}</td>
                        <td><Badge tone="green">{s.tierLabel}</Badge></td>
                        <td>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <span className="ops-num text-slate-700">
                              {s.claimsUsed}
                              {s.claimsCap === null ? ' / ∞' : ` / ${s.claimsCap}`}
                            </span>
                            {s.claimsCap !== null ? (
                              <span className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                <span
                                  className={`block h-full ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-[#0b6e4f]'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td><Badge tone={s.status === 'active' ? 'green' : 'neutral'}>{s.status}</Badge></td>
                        <td className="text-slate-600 whitespace-nowrap">{fmtDateTime(s.expiresAt)}</td>
                        <td className="ops-num">
                          {s.quotaBlocks30d > 0 ? (
                            <Badge tone="amber">{s.quotaBlocks30d}</Badge>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={query.data!.page} pageSize={query.data!.pageSize} total={query.data!.total} onPage={setPage} />
          </>
        )}
      </Card>

      {/* §7.1 — surfaced as a signal, never acted on automatically. */}
      {overQuota.data?.riders.length ? (
        <Card>
          <SectionTitle hint="Riders who hit their claim cap in the last 30 days. A signal to talk to them, not an action to take.">
            <span className="inline-flex items-center gap-1.5">
              <ArrowUpRight size={13} /> Upsell candidates
            </span>
          </SectionTitle>
          <div className="ops-table-wrap ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Times blocked</th>
                  <th>Current tier</th>
                  <th>Suggested</th>
                </tr>
              </thead>
              <tbody>
                {overQuota.data.riders.map((r) => (
                  <tr key={r.riderId}>
                    <td className="font-medium text-slate-900">{r.name}</td>
                    <td className="ops-mono text-slate-600">{r.phone}</td>
                    <td className="ops-num font-semibold">{r.blocks}</td>
                    <td className="capitalize text-slate-600">{r.currentTier ?? '—'}</td>
                    <td>{r.suggestedTier ? <Badge tone="blue">{r.suggestedTier}</Badge> : <span className="text-slate-400">top tier</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

// ─── §7.2 payments ───────────────────────────────────────────────────────────

function PaymentsTab() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);

  const debounced = useDebounced(search, 300);
  const query = useQuery<Paged<PaymentRow>>(`/finance/payments${qs({ status, search: debounced, page, pageSize: 25 })}`);

  return (
    <>
      <Card pad={false}>
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200">
          <h2 className="text-[13px] font-semibold text-slate-900">Payments</h2>
          <div className="flex gap-2">
            <TextInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Name, phone or provider ref"
              className="w-[240px]"
              aria-label="Search payments"
            />
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-[140px]" aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="success">Success</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </Select>
          </div>
        </div>

        {query.error ? (
          <div className="p-3"><ErrorNote message={query.error} onRetry={query.reload} /></div>
        ) : query.initialLoading ? (
          <Spinner />
        ) : (query.data?.rows.length ?? 0) === 0 ? (
          <EmptyState title="No payments" body="Subscription purchases appear here as they are made." />
        ) : (
          <>
            <div className="ops-table-wrap ops-scroll">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>User</th>
                    <th>Amount</th>
                    <th>Tier</th>
                    <th>Provider</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Subscription</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {query.data!.rows.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap text-slate-600">{fmtDateTime(p.completedAt ?? p.createdAt)}</td>
                      <td>
                        <div className="font-medium text-slate-900">{p.user.name}</div>
                        <div className="ops-mono text-[11px] text-slate-500">{p.user.phone}</div>
                      </td>
                      <td className="ops-num font-semibold">
                        {fmtRwf(p.amount)}
                        {p.refunded > 0 ? (
                          <div className="text-[11px] font-normal text-red-700">−{fmtRwf(p.refunded)} refunded</div>
                        ) : null}
                      </td>
                      <td className="capitalize text-slate-600">{p.tier ?? '—'}</td>
                      <td className="text-slate-600">{p.provider}</td>
                      <td className="ops-mono text-[11px] text-slate-500 max-w-[140px] truncate" title={p.providerRef ?? ''}>
                        {p.providerRef ?? '—'}
                      </td>
                      <td>
                        <Badge tone={p.status === 'success' ? 'green' : p.status === 'pending' ? 'amber' : 'red'}>
                          {p.status}
                        </Badge>
                      </td>
                      <td>
                        {p.subscriptionId ? (
                          <Badge tone="green">linked</Badge>
                        ) : p.status === 'success' ? (
                          <Badge tone="red" title="Paid but no subscription was activated">orphan</Badge>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        {p.status === 'success' && p.refunded < p.amount ? (
                          <Button size="sm" tone="neutral" onClick={() => setRefunding(p)}>
                            Refund
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={query.data!.page} pageSize={query.data!.pageSize} total={query.data!.total} onPage={setPage} />
          </>
        )}
      </Card>

      {refunding ? (
        <RefundDialog
          payment={refunding}
          onCancel={() => setRefunding(null)}
          onDone={() => {
            setRefunding(null);
            query.reload();
          }}
        />
      ) : null}
    </>
  );
}

// ─── §7.2 reconciliation ─────────────────────────────────────────────────────

function ReconciliationTab() {
  const toast = useToast();
  const query = useQuery<ReconciliationExceptions>('/finance/reconciliation', { pollMs: 60_000 });
  const [acting, setActing] = useState<{ paymentId: string; label: string } | null>(null);

  if (query.initialLoading) return <Spinner />;
  if (query.error) return <ErrorNote message={query.error} onRetry={query.reload} />;
  const d = query.data!;

  return (
    <div className="space-y-3">
      {d.total === 0 ? (
        <Card>
          <EmptyState
            title="Everything reconciles"
            body="Every successful payment has a subscription behind it, and every active subscription has a payment. This is the number you want to see."
          />
        </Card>
      ) : (
        <InfoNote tone="amber">
          <strong>{d.total} exception(s).</strong> Each one means the payment ledger and the subscription state
          disagree. Resolve them from here — every action needs a written note.
        </InfoNote>
      )}

      <Card pad={false}>
        <div className="px-4 pt-4">
          <SectionTitle hint="Provider confirmed the payment, but no subscription was activated — the webhook-failure case.">
            <span className="inline-flex items-center gap-1.5 text-red-800">
              <AlertTriangle size={13} /> Paid but not activated ({d.orphanPayments.length})
            </span>
          </SectionTitle>
        </div>
        {d.orphanPayments.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-slate-500">None.</p>
        ) : (
          <div className="ops-table-wrap ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Paid</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Tier</th>
                  <th>Reference</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.orphanPayments.map((p) => (
                  <tr key={p.paymentId}>
                    <td className="whitespace-nowrap text-slate-600">{fmtDateTime(p.completedAt ?? p.createdAt)}</td>
                    <td>
                      <div className="font-medium text-slate-900">{p.user.name}</div>
                      <div className="ops-mono text-[11px] text-slate-500">{p.user.phone}</div>
                    </td>
                    <td className="ops-num font-semibold">{fmtRwf(p.amount)}</td>
                    <td className="capitalize text-slate-600">{p.tier ?? '—'}</td>
                    <td className="ops-mono text-[11px] text-slate-500 max-w-[140px] truncate">{p.providerRef ?? '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <Button
                        size="sm"
                        tone="neutral"
                        onClick={() => setActing({ paymentId: p.paymentId, label: `${p.user.name} · ${fmtRwf(p.amount)}` })}
                      >
                        Resolve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-4 pt-4">
          <SectionTitle hint="Should never happen if payment idempotency is correct — which is exactly why it is monitored.">
            Active without a confirmed payment ({d.unpaidSubscriptions.length})
          </SectionTitle>
        </div>
        {d.unpaidSubscriptions.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-slate-500">None — as expected.</p>
        ) : (
          <div className="ops-table-wrap ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Rider</th>
                  <th>Tier</th>
                  <th>Claims used</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {d.unpaidSubscriptions.map((s) => (
                  <tr key={s.subscriptionId}>
                    <td className="whitespace-nowrap text-slate-600">{fmtDateTime(s.startsAt)}</td>
                    <td>
                      <div className="font-medium text-slate-900">{s.rider.name}</div>
                      <div className="ops-mono text-[11px] text-slate-500">{s.rider.phone}</div>
                    </td>
                    <td className="capitalize">{s.tier}</td>
                    <td className="ops-num">
                      {s.claimsUsed}
                      {s.claimsCap === null ? ' / ∞' : ` / ${s.claimsCap}`}
                    </td>
                    <td className="text-slate-600 whitespace-nowrap">{fmtDateTime(s.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-4 pt-4">
          <SectionTitle hint="Started more than an hour ago and never resolved either way.">
            Stuck pending payments ({d.stalePendingPayments.length})
          </SectionTitle>
        </div>
        {d.stalePendingPayments.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-slate-500">None.</p>
        ) : (
          <div className="ops-table-wrap ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Tier</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.stalePendingPayments.map((p) => (
                  <tr key={p.paymentId}>
                    <td className="whitespace-nowrap text-slate-600">{fmtDateTime(p.createdAt)}</td>
                    <td>
                      <div className="font-medium text-slate-900">{p.user.name}</div>
                      <div className="ops-mono text-[11px] text-slate-500">{p.user.phone}</div>
                    </td>
                    <td className="ops-num">{fmtRwf(p.amount)}</td>
                    <td className="capitalize text-slate-600">{p.tier ?? '—'}</td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        tone="neutral"
                        onClick={() => setActing({ paymentId: p.paymentId, label: `${p.user.name} · ${fmtRwf(p.amount)}` })}
                      >
                        Resolve
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {acting ? (
        <GatedActionDialog
          open
          title="Reconcile payment"
          tone="warn"
          confirmLabel="Record action"
          description="Choose what actually happened with this payment. This is money — the note is mandatory, and both the action and the note go into the audit log."
          summary={acting.label}
          reasonCodes={[
            { value: 'mark_resolved', label: 'Resolved — handled outside the system' },
            { value: 'mark_void', label: 'Void — the payment should never have counted' },
          ]}
          reasonLabel="Action"
          freetextLabel="What happened, and what did you do?"
          onCancel={() => setActing(null)}
          onConfirm={async ({ reasonCode, reasonFreetext }) => {
            await opsApi(`/finance/payments/${acting.paymentId}/reconcile`, {
              method: 'POST',
              body: { action: reasonCode, note: reasonFreetext },
            });
            toast.push('success', 'Reconciliation recorded.');
            setActing(null);
            query.reload();
          }}
        />
      ) : null}
    </div>
  );
}

// ─── §7.3 refunds ────────────────────────────────────────────────────────────

function RefundsTab({ providerRefundAvailable }: { providerRefundAvailable: boolean }) {
  const toast = useToast();
  const query = useQuery<{ refunds: RefundRow[] }>('/finance/refunds');
  const [settling, setSettling] = useState<RefundRow | null>(null);
  const [providerRef, setProviderRef] = useState('');

  return (
    <div className="space-y-3">
      {/*
        §12 open question #2, answered honestly on the screen where it matters.
        Nobody should be able to look at this list and assume the payer has been
        paid when nothing has left the account.
      */}
      {!providerRefundAvailable ? (
        <InfoNote tone="amber">
          <strong>Refunds here are records, not payouts.</strong> MotoConnect collects through PayPack, whose
          API exposes cash-in and cash-out but no reversal of a specific transaction. Upstream, MTN MoMo puts
          refunds under its separate Disbursement product and Airtel's collection refund is not reachable from
          behind the aggregator. So a refund is a fresh outbound payment: issue it, send the money by mobile
          money, then mark it paid out here with the transaction reference.
        </InfoNote>
      ) : null}

      <Card pad={false}>
        <div className="px-4 pt-4">
          <SectionTitle hint="Every refund ever issued, who issued it and why.">Refunds</SectionTitle>
        </div>
        {query.error ? (
          <div className="p-3"><ErrorNote message={query.error} onRetry={query.reload} /></div>
        ) : query.initialLoading ? (
          <Spinner />
        ) : (query.data?.refunds.length ?? 0) === 0 ? (
          <EmptyState title="No refunds issued" body="Refunds are started from a payment row on the Payments tab." />
        ) : (
          <div className="ops-table-wrap ops-scroll">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Issued</th>
                  <th>User</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Money moved?</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data!.refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap text-slate-600">{fmtDateTime(r.createdAt)}</td>
                    <td>
                      <div className="font-medium text-slate-900">{r.user.name}</div>
                      <div className="ops-mono text-[11px] text-slate-500">{r.user.phone}</div>
                    </td>
                    <td className="ops-num font-semibold">
                      {fmtRwf(r.amount)}
                      <div className="text-[11px] font-normal text-slate-500">of {fmtRwf(r.paymentAmount)}</div>
                    </td>
                    <td>
                      <Badge tone="neutral">{humanize(r.reasonCode)}</Badge>
                      <div className="text-[11px] text-slate-600 mt-0.5 max-w-[240px]">{r.reasonFreetext}</div>
                    </td>
                    <td>
                      {r.settledAt ? (
                        <Badge tone="green" title={r.providerRef ?? undefined}>
                          paid {fmtDate(r.settledAt)}
                        </Badge>
                      ) : (
                        <Badge tone="amber">not yet paid out</Badge>
                      )}
                    </td>
                    <td className="text-[11px] text-slate-500">{r.adminEmail ?? '—'}</td>
                    <td className="text-right">
                      {!r.settledAt ? (
                        <Button size="sm" tone="neutral" onClick={() => { setSettling(r); setProviderRef(''); }}>
                          Mark paid out
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {settling ? (
        <GatedActionDialog
          open
          title="Mark refund as paid out"
          tone="primary"
          confirmLabel="Record payout"
          description="Only do this once the money has actually left the account and reached the payer."
          summary={
            <>
              {fmtRwf(settling.amount)} to <strong>{settling.user.name}</strong> ({settling.user.phone})
            </>
          }
          freetextLabel="How was it paid out?"
          extraFields={
            <Field label="Mobile money transaction reference" required>
              <TextInput
                value={providerRef}
                onChange={(e) => setProviderRef(e.target.value)}
                placeholder="e.g. MoMo transaction ID"
                className="ops-mono"
              />
            </Field>
          }
          onCancel={() => setSettling(null)}
          onConfirm={async ({ reasonFreetext }) => {
            await opsApi(`/finance/refunds/${settling.id}/settle`, {
              method: 'POST',
              body: { providerRef, note: reasonFreetext },
            });
            toast.push('success', 'Payout recorded.');
            setSettling(null);
            query.reload();
          }}
        />
      ) : null}
    </div>
  );
}

const REFUND_REASONS = [
  { value: 'duplicate_charge', label: 'Duplicate charge' },
  { value: 'service_not_delivered', label: 'Service not delivered' },
  { value: 'accidental_purchase', label: 'Accidental purchase' },
  { value: 'billing_error', label: 'Billing error' },
  { value: 'goodwill', label: 'Goodwill' },
  { value: 'other', label: 'Other (explain below)' },
];

function RefundDialog({
  payment,
  onCancel,
  onDone,
}: {
  payment: PaymentRow;
  onCancel: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const remaining = payment.amount - payment.refunded;
  const [amount, setAmount] = useState(String(remaining));

  return (
    <GatedActionDialog
      open
      title={`Refund ${payment.user.name}`}
      tone="danger"
      confirmLabel="Issue refund"
      description="Refunds are financial actions: confirmed, reasoned and permanently logged against your account."
      summary={
        <>
          Payment of <strong>{fmtRwf(payment.amount)}</strong> ({payment.tier ?? 'subscription'}) on{' '}
          {fmtDateTime(payment.completedAt ?? payment.createdAt)}.
          {payment.refunded > 0 ? ` ${fmtRwf(payment.refunded)} already refunded — ${fmtRwf(remaining)} remaining.` : ''}
        </>
      }
      reasonCodes={REFUND_REASONS}
      reasonLabel="Refund reason"
      freetextLabel="Details"
      freetextHint="Mandatory for every refund. This is money."
      extraFields={
        <Field label="Amount to refund (RWF)" required hint={`At most ${fmtNumber(remaining)}.`}>
          <TextInput
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="ops-num"
          />
        </Field>
      }
      onCancel={onCancel}
      onConfirm={async ({ reasonCode, reasonFreetext }) => {
        const res = await opsApi<{ moneyMoved: boolean }>(`/finance/payments/${payment.id}/refund`, {
          method: 'POST',
          body: { amount: Number(amount), reasonCode, reasonFreetext },
        });
        toast.push(
          'success',
          res.moneyMoved
            ? 'Refund issued through the provider.'
            : 'Refund recorded. Send the money by mobile money, then mark it paid out on the Refunds tab.'
        );
        onDone();
      }}
    />
  );
}
