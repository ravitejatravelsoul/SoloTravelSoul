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

export class SubrequestBudget {
  used = 0;
  constructor(readonly limit = WORKERS_FREE_SUBREQUESTS) {}
  spend(n = 1): void {
    if (this.used + n > this.limit) throw new BudgetExceeded();
    this.used += n;
  }
  remaining(): number {
    return this.limit - this.used;
  }
  /** Throws SliceExhausted unless more than `reserve` + `need` calls remain. */
  ensureWork(need = 1, reserve = DEFAULT_RESERVE): void {
    if (this.remaining() - need < reserve) throw new SliceExhausted();
  }
}

/** A fetch that charges every call to the budget (hard cap). */
export function budgetedFetch(budget: SubrequestBudget, base: typeof fetch = fetch): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    budget.spend();
    return base(input, init);
  }) as typeof fetch;
}
