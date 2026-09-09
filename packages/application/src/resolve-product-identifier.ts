import type {
  HouseholdId,
  PrincipalId,
  ProductId,
  ProductIdentifierId,
  ProductIdentifierNormalizationRuleId,
} from '@fridge/domain';
import type { TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface ResolveProductIdentifierInput {
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly schemeCode: string;
  readonly issuerNamespace: string | null;
  readonly normalizationRuleId: ProductIdentifierNormalizationRuleId;
  readonly normalizedValue: string;
}

export interface ResolvedProductIdentifier {
  readonly productIdentifierId: ProductIdentifierId;
  readonly productId: ProductId;
}

export interface ProductIdentifierResolutionKey {
  readonly schemeCode: string;
  readonly issuerNamespace: string | null;
  readonly normalizationRuleId: ProductIdentifierNormalizationRuleId;
  readonly normalizedValue: string;
}

export interface ProductIdentifierResolver {
  resolveProductIdentifier(
    transaction: TransactionHandle,
    key: ProductIdentifierResolutionKey,
  ): Promise<ResolvedProductIdentifier | null>;
}

function requireExactNonblank(value: string, field: string): string {
  if (value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${field} must be exact nonblank text`);
  }
  return value;
}

function requireOptionalExactNonblank(value: string | null, field: string): string | null {
  if (value === null) return null;
  return requireExactNonblank(value, field);
}

function requireNonempty(value: string, field: string): string {
  if (value.length === 0) {
    throw new TypeError(`${field} must be nonempty text`);
  }
  return value;
}

export class ResolveProductIdentifierUseCase
  implements UseCase<ResolveProductIdentifierInput, { readonly resolution: ResolvedProductIdentifier | null }>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly identifiers: ProductIdentifierResolver,
  ) {}

  async execute(
    input: ResolveProductIdentifierInput,
  ): Promise<{ readonly resolution: ResolvedProductIdentifier | null }> {
    const key: ProductIdentifierResolutionKey = {
      schemeCode: requireExactNonblank(input.schemeCode, 'schemeCode'),
      issuerNamespace: requireOptionalExactNonblank(input.issuerNamespace, 'issuerNamespace'),
      normalizationRuleId: input.normalizationRuleId,
      normalizedValue: requireNonempty(input.normalizedValue, 'normalizedValue'),
    };

    let resolution: ResolvedProductIdentifier | null | undefined;
    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        resolution = await this.identifiers.resolveProductIdentifier(transaction, key);
      },
    );

    if (resolution === undefined) {
      throw new TypeError('ProductIdentifier resolver did not return a result');
    }

    return { resolution };
  }
}
