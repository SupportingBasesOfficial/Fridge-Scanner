import {
  PurchaseId,
  instant,
  type ExactRational,
  type HouseholdId,
  type Instant,
  type MeasurementUnitId,
  type PrincipalId,
  type ProductId,
  type PurchaseItemId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface HouseholdPurchaseSummary {
  readonly purchaseId: PurchaseId;
  readonly transactionCurrencyCode: string;
  readonly occurredAt: Instant;
  readonly recordedAt: Instant;
  readonly itemCount: number;
}

export interface HouseholdPurchaseItemObservation {
  readonly purchaseItemId: PurchaseItemId;
  readonly productId: ProductId;
  readonly quantity: ExactRational;
  readonly measurementUnitId: MeasurementUnitId;
  readonly recordedAt: Instant;
}

export interface HouseholdPurchaseObservation extends HouseholdPurchaseSummary {
  readonly items: readonly HouseholdPurchaseItemObservation[];
}

export interface HouseholdPurchasePageCursor {
  readonly occurredAt: Instant;
  readonly purchaseId: PurchaseId;
}

export interface ListHouseholdPurchasesInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly pageSize?: number;
  readonly cursor?: HouseholdPurchasePageCursor | null;
}

export interface ListHouseholdPurchasesOutput {
  readonly purchases: readonly HouseholdPurchaseSummary[];
  readonly nextCursor: HouseholdPurchasePageCursor | null;
}

export interface GetHouseholdPurchaseInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseId: PurchaseId;
}

export interface HouseholdPurchaseReader {
  listHouseholdPurchases(
    transaction: TransactionHandle,
    input: { readonly limit: number; readonly cursor: HouseholdPurchasePageCursor | null },
  ): Promise<readonly HouseholdPurchaseSummary[]>;

  getHouseholdPurchase(
    transaction: TransactionHandle,
    purchaseId: PurchaseId,
  ): Promise<HouseholdPurchaseObservation>;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function requirePageSize(value: number | undefined): number {
  const resolved = value ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > MAX_PAGE_SIZE) {
    throw new InvalidInputError(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  return resolved;
}

function requireCursor(value: HouseholdPurchasePageCursor | null | undefined): HouseholdPurchasePageCursor | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== 'object' ||
    typeof (value as { readonly occurredAt?: unknown }).occurredAt !== 'string' ||
    typeof (value as { readonly purchaseId?: unknown }).purchaseId !== 'string'
  ) {
    throw new InvalidInputError('Purchase page cursor is invalid');
  }
  try {
    return {
      occurredAt: instant(value.occurredAt),
      purchaseId: PurchaseId(value.purchaseId),
    };
  } catch {
    throw new InvalidInputError('Purchase page cursor is invalid');
  }
}

export class ListHouseholdPurchasesUseCase
  implements UseCase<ListHouseholdPurchasesInput, ListHouseholdPurchasesOutput>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly purchases: HouseholdPurchaseReader,
  ) {}

  async execute(input: ListHouseholdPurchasesInput): Promise<ListHouseholdPurchasesOutput> {
    const pageSize = requirePageSize(input.pageSize);
    const cursor = requireCursor(input.cursor);
    let rows: readonly HouseholdPurchaseSummary[] | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        rows = await this.purchases.listHouseholdPurchases(transaction, {
          limit: pageSize + 1,
          cursor,
        });
      },
    );
    if (rows === undefined) {
      throw new TypeError('Household Purchase reader did not return a result');
    }

    const hasMore = rows.length > pageSize;
    const purchases = hasMore ? rows.slice(0, pageSize) : rows;
    const last = hasMore ? purchases[purchases.length - 1] : undefined;
    return {
      purchases,
      nextCursor:
        last === undefined
          ? null
          : { occurredAt: last.occurredAt, purchaseId: last.purchaseId },
    };
  }
}

export class GetHouseholdPurchaseUseCase
  implements UseCase<GetHouseholdPurchaseInput, { readonly purchase: HouseholdPurchaseObservation }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly purchases: HouseholdPurchaseReader,
  ) {}

  async execute(
    input: GetHouseholdPurchaseInput,
  ): Promise<{ readonly purchase: HouseholdPurchaseObservation }> {
    let purchase: HouseholdPurchaseObservation | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        purchase = await this.purchases.getHouseholdPurchase(transaction, input.purchaseId);
      },
    );
    if (purchase === undefined) {
      throw new TypeError('Household Purchase reader did not return a result');
    }
    return { purchase };
  }
}
