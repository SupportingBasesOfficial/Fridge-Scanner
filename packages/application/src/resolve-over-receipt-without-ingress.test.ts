import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  PrincipalId,
  PurchaseReceivingExceptionId,
  PurchaseReceivingExceptionResolutionId,
} from '@fridge/domain';
import { InvalidInputError } from './errors.js';
import {
  ResolveOverReceiptWithoutIngressUseCase,
  type HouseholdOverReceiptNonphysicalResolver,
  type ResolveOverReceiptWithoutIngressPersistenceInput,
} from './resolve-over-receipt-without-ingress.js';
import type {
  HouseholdProcurementAdministrationTransaction,
  HouseholdProcurementAdministrationTransactionManager,
} from './household-procurement-administration.js';
import type { IdentifierGenerator } from './index.js';

const HOUSEHOLD = HouseholdId('ad800001-0b06-4800-8800-000000000001');
const ACTOR = PrincipalId('ad800002-0b06-4800-8800-000000000002');
const COMMAND = CommandId('ad800003-0b06-4800-8800-000000000003');
const EXCEPTION = PurchaseReceivingExceptionId('ad800004-0b06-4800-8800-000000000004');
const RESOLUTION = PurchaseReceivingExceptionResolutionId('ad800005-0b06-4800-8800-000000000005');

class OneId<T> implements IdentifierGenerator<T> {
  constructor(private readonly value: T) {}
  generate(): T { return this.value; }
}

class Transactions implements HouseholdProcurementAdministrationTransactionManager {
  calls = 0;
  async withHouseholdProcurementAdministrationTransaction<T>(
    principalId: PrincipalId,
    householdId: HouseholdId,
    operation: (transaction: HouseholdProcurementAdministrationTransaction) => Promise<T>,
  ): Promise<T> {
    this.calls += 1;
    assert.equal(principalId, ACTOR);
    assert.equal(householdId, HOUSEHOLD);
    return operation({
      kind: 'fridge-transaction',
      principalId,
      householdId,
      membershipId: 'ad800006-0b06-4800-8800-000000000006',
      householdRoleCode: 'ADMIN',
      procurementAdministrationCapability: 'HOUSEHOLD_PROCUREMENT_ADMINISTER',
    } as unknown as HouseholdProcurementAdministrationTransaction);
  }
}

class Resolver implements HouseholdOverReceiptNonphysicalResolver {
  seen: ResolveOverReceiptWithoutIngressPersistenceInput | undefined;
  async resolveOverReceiptWithoutIngress(
    _transaction: HouseholdProcurementAdministrationTransaction,
    input: ResolveOverReceiptWithoutIngressPersistenceInput,
  ) {
    this.seen = input;
    return {
      purchaseReceivingExceptionResolutionId: RESOLUTION,
      resolutionKind: input.resolutionKind,
    };
  }
}

test('canonicalizes nonphysical resolution reason/provenance and delegates one result identity', async () => {
  const transactions = new Transactions();
  const resolver = new Resolver();
  const useCase = new ResolveOverReceiptWithoutIngressUseCase(
    transactions,
    resolver,
    new OneId(RESOLUTION),
  );

  const result = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    purchaseReceivingExceptionId: EXCEPTION,
    resolutionKind: 'REJECTED_NO_INGRESS',
    reason: '  refused at receiving dock  ',
    provenance: '  receiving supervisor  ',
  });

  assert.equal(result.purchaseReceivingExceptionResolutionId, RESOLUTION);
  assert.equal(result.resolutionKind, 'REJECTED_NO_INGRESS');
  assert.deepEqual(resolver.seen, {
    commandId: COMMAND,
    purchaseReceivingExceptionId: EXCEPTION,
    resolutionKind: 'REJECTED_NO_INGRESS',
    reason: 'refused at receiving dock',
    provenance: 'receiving supervisor',
    candidatePurchaseReceivingExceptionResolutionId: RESOLUTION,
  });
});

test('blank reason is rejected before authority acquisition', async () => {
  const transactions = new Transactions();
  const useCase = new ResolveOverReceiptWithoutIngressUseCase(transactions, new Resolver(), new OneId(RESOLUTION));
  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      resolutionKind: 'SUPERSEDED_DETECTION',
      reason: ' ',
      provenance: 'station',
    }),
    InvalidInputError,
  );
  assert.equal(transactions.calls, 0);
});

test('blank provenance is rejected before authority acquisition', async () => {
  const transactions = new Transactions();
  const useCase = new ResolveOverReceiptWithoutIngressUseCase(transactions, new Resolver(), new OneId(RESOLUTION));
  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      purchaseReceivingExceptionId: EXCEPTION,
      resolutionKind: 'REJECTED_NO_INGRESS',
      reason: 'refused',
      provenance: ' ',
    }),
    InvalidInputError,
  );
  assert.equal(transactions.calls, 0);
});
