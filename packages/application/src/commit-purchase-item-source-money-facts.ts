import type {
  CommandId,
  HouseholdId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import type { IdentifierGenerator, UseCase } from './index.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';

export type PurchaseItemSourceMoneySemanticRole =
  | 'LINE_GROSS'
  | 'LINE_DISCOUNT'
  | 'LINE_TAX'
  | 'LINE_CHARGE'
  | 'LINE_NET';

export interface CommitPurchaseItemSourceMoneyFactInput {
  readonly semanticRole: PurchaseItemSourceMoneySemanticRole;
  readonly amount: string;
  readonly provenance: string;
}

export interface CommitPurchaseItemSourceMoneyFactsInput {
  readonly commandId: CommandId;
  readonly actorPrincipalId: PrincipalId;
  readonly householdId: HouseholdId;
  readonly purchaseId: PurchaseId;
  readonly purchaseItemId: PurchaseItemId;
  readonly facts: readonly CommitPurchaseItemSourceMoneyFactInput[];
}

export interface CommitPurchaseItemSourceMoneyFactsOutput {
  readonly purchaseItemMoneyFactIds: readonly PurchaseItemMoneyFactId[];
}

export interface CommitPurchaseItemSourceMoneyFactPersistenceInput {
  readonly candidatePurchaseItemMoneyFactId: PurchaseItemMoneyFactId;
  readonly semanticRole: PurchaseItemSourceMoneySemanticRole;
  readonly amount: string;
  readonly provenance: string;
}

export interface CommitPurchaseItemSourceMoneyFactsPersistenceInput {
  readonly commandId: CommandId;
  readonly purchaseId: PurchaseId;
  readonly purchaseItemId: PurchaseItemId;
  readonly facts: readonly CommitPurchaseItemSourceMoneyFactPersistenceInput[];
}

export interface HouseholdPurchaseItemSourceMoneyWriter {
  commitSourceMoneyFacts(
    transaction: HouseholdProcurementAdministrationTransaction,
    input: CommitPurchaseItemSourceMoneyFactsPersistenceInput,
  ): Promise<CommitPurchaseItemSourceMoneyFactsOutput>;
}

const MONEY_AMOUNT_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SOURCE_ROLES = new Set<PurchaseItemSourceMoneySemanticRole>([
  'LINE_GROSS',
  'LINE_DISCOUNT',
  'LINE_TAX',
  'LINE_CHARGE',
  'LINE_NET',
]);

function canonicalMoneyAmount(value: string, index: number): string {
  if (typeof value !== 'string' || !MONEY_AMOUNT_PATTERN.test(value)) {
    throw new InvalidInputError(
      `purchase item money fact ${index + 1} amount must be a nonnegative exact decimal string`,
    );
  }

  const dotIndex = value.indexOf('.');
  const integerPart = dotIndex === -1 ? value : value.slice(0, dotIndex);
  const fractionalPart = dotIndex === -1 ? '' : value.slice(dotIndex + 1);
  const trimmedFraction = fractionalPart.replace(/0+$/, '');
  return trimmedFraction.length === 0 ? integerPart : `${integerPart}.${trimmedFraction}`;
}

function requireProvenance(value: string, index: number): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidInputError(`purchase item money fact ${index + 1} provenance is required`);
  }
  return value.trim();
}

export class CommitPurchaseItemSourceMoneyFactsUseCase
  implements UseCase<CommitPurchaseItemSourceMoneyFactsInput, CommitPurchaseItemSourceMoneyFactsOutput>
{
  constructor(
    private readonly transactions: HouseholdProcurementAdministrationTransactionManager,
    private readonly writer: HouseholdPurchaseItemSourceMoneyWriter,
    private readonly moneyFactIds: IdentifierGenerator<PurchaseItemMoneyFactId>,
  ) {}

  async execute(
    input: CommitPurchaseItemSourceMoneyFactsInput,
  ): Promise<CommitPurchaseItemSourceMoneyFactsOutput> {
    if (!Array.isArray(input.facts) || input.facts.length === 0 || input.facts.length > SOURCE_ROLES.size) {
      throw new InvalidInputError('purchase item source money facts must contain between one and five roles');
    }

    const seenRoles = new Set<PurchaseItemSourceMoneySemanticRole>();
    const facts = input.facts.map((fact, index) => {
      if (!SOURCE_ROLES.has(fact.semanticRole)) {
        throw new InvalidInputError(`purchase item money fact ${index + 1} semantic role is invalid`);
      }
      if (seenRoles.has(fact.semanticRole)) {
        throw new InvalidInputError('purchase item source money fact roles must be unique within one command');
      }
      seenRoles.add(fact.semanticRole);

      return {
        candidatePurchaseItemMoneyFactId: this.moneyFactIds.generate(),
        semanticRole: fact.semanticRole,
        amount: canonicalMoneyAmount(fact.amount, index),
        provenance: requireProvenance(fact.provenance, index),
      } satisfies CommitPurchaseItemSourceMoneyFactPersistenceInput;
    });

    let output: CommitPurchaseItemSourceMoneyFactsOutput | undefined;
    await this.transactions.withHouseholdProcurementAdministrationTransaction(
      input.actorPrincipalId,
      input.householdId,
      async (transaction) => {
        output = await this.writer.commitSourceMoneyFacts(transaction, {
          commandId: input.commandId,
          purchaseId: input.purchaseId,
          purchaseItemId: input.purchaseItemId,
          facts,
        });
      },
    );

    if (output === undefined) {
      throw new TypeError('Household PurchaseItem source money writer did not return an outcome');
    }
    if (output.purchaseItemMoneyFactIds.length !== facts.length) {
      throw new TypeError('Household PurchaseItem source money writer returned a different fact cardinality');
    }
    return output;
  }
}
