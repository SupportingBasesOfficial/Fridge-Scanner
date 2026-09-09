import type {
  CommandId,
  HouseholdId,
  Instant,
  PrincipalId,
  ProductId,
  StagedIdentifierClaimId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, TransactionHandle, TransactionManager, UseCase } from './index.js';

export interface ObserveProductIdentifierInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly candidateProductId: ProductId | null;
  readonly schemeCode: string;
  readonly issuerNamespace: string | null;
  readonly sourceValue: string;
  readonly observedAt: Instant;
}

export interface ObserveProductIdentifierOutput {
  readonly stagedIdentifierClaimId: StagedIdentifierClaimId;
}

export interface ObserveProductIdentifierPersistenceInput {
  readonly commandId: CommandId;
  readonly candidateStagedIdentifierClaimId: StagedIdentifierClaimId;
  readonly candidateProductId: ProductId | null;
  readonly schemeCode: string;
  readonly issuerNamespace: string | null;
  readonly sourceValue: string;
  readonly observedAt: Instant;
}

export interface ProductIdentifierObservationWriter {
  observeProductIdentifier(
    transaction: TransactionHandle,
    input: ObserveProductIdentifierPersistenceInput,
  ): Promise<StagedIdentifierClaimId>;
}

function requireExactNonblank(value: string, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new InvalidInputError(`${label} must be a nonblank exact value`);
  }
  return value;
}

function requireNonemptyExact(value: string, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidInputError(`${label} must be a nonempty exact value`);
  }
  return value;
}

export class ObserveProductIdentifierUseCase
  implements UseCase<ObserveProductIdentifierInput, ObserveProductIdentifierOutput>
{
  constructor(
    private readonly transactions: TransactionManager,
    private readonly observations: ProductIdentifierObservationWriter,
    private readonly identifiers: IdentifierGenerator<StagedIdentifierClaimId>,
  ) {}

  async execute(input: ObserveProductIdentifierInput): Promise<ObserveProductIdentifierOutput> {
    const schemeCode = requireExactNonblank(input.schemeCode, 'identifier scheme');
    const issuerNamespace =
      input.issuerNamespace === null
        ? null
        : requireExactNonblank(input.issuerNamespace, 'identifier issuer namespace');
    const sourceValue = requireNonemptyExact(input.sourceValue, 'identifier source value');
    const candidateStagedIdentifierClaimId = this.identifiers.generate();
    let stagedIdentifierClaimId: StagedIdentifierClaimId | undefined;

    await this.transactions.withAuthorizedHouseholdTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        stagedIdentifierClaimId = await this.observations.observeProductIdentifier(transaction, {
          commandId: input.commandId,
          candidateStagedIdentifierClaimId,
          candidateProductId: input.candidateProductId,
          schemeCode,
          issuerNamespace,
          sourceValue,
          observedAt: input.observedAt,
        });
      },
    );

    if (stagedIdentifierClaimId === undefined) {
      throw new TypeError('Product identifier observation writer did not return an identity');
    }

    return { stagedIdentifierClaimId };
  }
}
