// Workers Free allows 50 subrequests (fetches) per invocation. Every outbound
// call made on behalf of one request or cron run is charged to one budget:
// token/JWKS fetches, Firestore REST, Cloud Storage, Identity Toolkit.
//
// Two tiers:
//   - spend():     hard cap for the invocation (never exceeds `limit`).
//   - work stores: stop *voluntarily* while `reserve` calls are still left, so
//                  the slice can always record progress and release its lease.

export const WORKERS_FREE_SUBREQUESTS = 50;
/** D1 Free: 50 queries per Worker invocation, metered separately from fetches. */
export const D1_FREE_QUERIES = 50;
/** Kept back for cold-isolate auth (JWKS + service-account token), progress writes and conflict retries. */
export const DEFAULT_RESERVE = 10;

/** The invocation's hard cap was reached (a bug if it happens: work must stop at the reserve). */
export class BudgetExceeded extends Error {
  constructor() {
    super('Subrequest budget exceeded');
    this.name = 'BudgetExceeded';
  }
}

/** Voluntary stop: this slice used its work allowance; progress is saved and work resumes later. */
export class SliceExhausted extends Error {
  constructor() {
    super('Slice budget used; continuing later');
    this.name = 'SliceExhausted';
  }
}

/**
 * Workers Free also limits CPU to 10 ms per invocation. Measured on the deployed
 * staging Worker: each outbound call costs CPU (Firestore read/query ≈ 0.5 ms,
 * commit ≈ 1.25 ms, D1 query ≈ 0.4 ms), so plan steps are also limited by
 * work units (≈ 0.5 ms each: a read or query is 1, a commit 2). Bookkeeping
 * (token check, lease, progress) is outside the allowance and sized into it.
 */
export const SLICE_WORK_UNITS = 3;
export const CRON_WORK_UNITS = 10;

export class SubrequestBudget {
  used = 0;
  /** Work units spent by plan steps in this invocation. */
  workUsed = 0;
  /**
   * Set once this invocation made durable progress (a commit, an advanced page
   * cursor, a completed step). Until then the work allowance is not enforced, so
   * every slice completes at least one atomic unit and can never live-lock; the
   * overshoot is bounded by one atomic unit.
   */
  progressed = false;
  markProgress(): void {
    this.progressed = true;
  }
  constructor(readonly limit = WORKERS_FREE_SUBREQUESTS, readonly workUnits = Number.POSITIVE_INFINITY) {}
  spend(n = 1): void {
    if (this.used + n > this.limit) throw new BudgetExceeded();
    this.used += n;
  }
  remaining(): number {
    return this.limit - this.used;
  }
  workRemaining(): number {
    return this.workUnits - this.workUsed;
  }
  /**
   * Charges `need` work units, or throws SliceExhausted when they would exceed
   * the CPU allowance or leave fewer than `reserve` subrequests.
   */
  ensureWork(need = 1, reserve = DEFAULT_RESERVE): void {
    if (this.remaining() - need < reserve) throw new SliceExhausted();
    if (this.progressed && this.workUsed + need > this.workUnits) throw new SliceExhausted();
    this.workUsed += need;
  }
  /** Charges CPU-only work (D1, KV): throws SliceExhausted beyond the allowance; subrequests untouched. */
  useWork(units: number): void {
    if (this.progressed && this.workUsed + units > this.workUnits) throw new SliceExhausted();
    this.workUsed += units;
  }
}

/** A fetch that charges every call to the budget (hard cap). */
export function budgetedFetch(budget: SubrequestBudget, base: typeof fetch = fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    budget.spend();
    return base(input, init);
  }) as typeof fetch;
}
