import type {
  CommandId,
  HouseholdId,
  PrincipalId,
  PurchaseReceivingExceptionId,
  PurchaseReceivingExceptionResolutionId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export type NonphysicalOverReceiptResolutionKind =
  | 'REJECTED_NO_INGRESS'
  | 'SUPERSEDED_DETECTION';

export interface ResolveOverReceiptWithoutIngressInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseReceivingExceptionId: PurchaseReceivingExceptionId;
  readonly resolutionKind: NonphysicalOverReceiptResolutionKind;
  readonly reason: string;
  readonly provenance: string;
}

export interface ResolveOverReceiptWithoutIngressOutput {
  readonly purchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId;
  readonly resolutionKind: NonphysicalOverReceiptResolutionKind;
}

export interface ResolveOverReceiptWithoutIngressPersistenceInput {
  readonly commandId: CommandId;
  readonly purchaseReceivingExceptionId: PurchaseReceivingExceptionId;
  readonly resolutionKind: NonphysicalOverReceiptResolutionKind;
  readonly reason: string;
  readonly provenance: string;
  readonly candidatePurchaseReceivingExceptionResolutionId: PurchaseReceivingExceptionResolutionId;
}

export interface HouseholdOverReceiptNonphysicalResolver {
  resolveOverReceiptWithoutIngress(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: ResolveOverReceiptWithoutIngressPersistenceInput,
  ): Promise<ResolveOverReceiptWithoutIngressOutput>;
}

function canonicalText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError(`${label} is required`);
  }
  return value.trim();
}

function canonicalResolutionKind(value: NonphysicalOverReceiptResolutionKind): NonphysicalOverReceiptResolutionKind {
  if (value !== 'REJECTED_NO_INGRESS' && value !== 'SUPERSEDED_DETECTION') {
    throw new InvalidInputError('nonphysical over-receipt resolution kind is invalid');
  }
  return value;
}

export class ResolveOverReceiptWithoutIngressUseCase
  implements UseCase<ResolveOverReceiptWithoutIngressInput, ResolveOverReceiptWithoutIngressOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly resolver: HouseholdOverReceiptNonphysicalResolver,
    private readonly resolutionIds: IdentifierGenerator<PurchaseReceivingExceptionResolutionId>,
  ) {}

  async execute(input: ResolveOverReceiptWithoutIngressInput): Promise<ResolveOverReceiptWithoutIngressOutput> {
    const resolutionKind = canonicalResolutionKind(input.resolutionKind);
    const reason = canonicalText(input.reason, 'over-receipt resolution reason');
    const provenance = canonicalText(input.provenance, 'over-receipt resolution provenance');
    const candidatePurchaseReceivingExceptionResolutionId = this.resolutionIds.generate();

    let output: ResolveOverReceiptWithoutIngressOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.resolver.resolveOverReceiptWithoutIngress(transaction, {
          commandId: input.commandId,
          purchaseReceivingExceptionId: input.purchaseReceivingExceptionId,
          resolutionKind,
          reason,
          provenance,
          candidatePurchaseReceivingExceptionResolutionId,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('nonphysical over-receipt resolver did not return an outcome');
    }
    return output;
  }
}
