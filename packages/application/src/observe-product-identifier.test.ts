import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  ProductId,
  StagedIdentifierClaimId,
  instant,
} from '@fridge/domain';
import {
  InvalidInputError,
  ObserveProductIdentifierUseCase,
  type ObserveProductIdentifierPersistenceInput,
  type ProductIdentifierObservationWriter,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const COMMAND = CommandId('a0b00101-0b10-4d01-8b10-000000000001');
const ACTOR = PrincipalId('a0b00202-0b10-4d02-8b10-000000000002');
const HOUSEHOLD = HouseholdId('a0b00303-0b10-4d03-8b10-000000000003');
const MEMBERSHIP = HouseholdMembershipId('a0b00404-0b10-4d04-8b10-000000000004');
const PRODUCT = ProductId('a0b00505-0b10-4d05-8b10-000000000005');
const CLAIM = StagedIdentifierClaimId('a0b00606-0b10-4d06-8b10-000000000006');
const OBSERVED_AT = instant('2026-09-09T00:00:00Z');

function fakeTransaction(): TransactionHandle {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'BE05_MEMBER',
  } as unknown as TransactionHandle;
}

test('ObserveProductIdentifierUseCase stages exact raw evidence without normalization', async () => {
  let persisted: ObserveProductIdentifierPersistenceInput | undefined;
  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(actor, household, operation) {
      assert.equal(actor, ACTOR);
      assert.equal(household, HOUSEHOLD);
      return operation(fakeTransaction());
    },
  };
  const observations: ProductIdentifierObservationWriter = {
    async observeProductIdentifier(_transaction, input) {
      persisted = input;
      return CLAIM;
    },
  };
  const useCase = new ObserveProductIdentifierUseCase(transactions, observations, {
    generate: () => CLAIM,
  });

  const result = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    candidateProductId: PRODUCT,
    schemeCode: 'GTIN',
    issuerNamespace: null,
    sourceValue: ' 0012345678905 ',
    observedAt: OBSERVED_AT,
  });

  assert.equal(result.stagedIdentifierClaimId, CLAIM);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateStagedIdentifierClaimId: CLAIM,
    candidateProductId: PRODUCT,
    schemeCode: 'GTIN',
    issuerNamespace: null,
    sourceValue: ' 0012345678905 ',
    observedAt: OBSERVED_AT,
  });
});

test('ObserveProductIdentifierUseCase rejects malformed scheme/issuer/source before transaction', async () => {
  let requested = false;
  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction() {
      requested = true;
      throw new Error('must not run');
    },
  };
  const observations: ProductIdentifierObservationWriter = {
    async observeProductIdentifier() {
      throw new Error('must not run');
    },
  };
  const useCase = new ObserveProductIdentifierUseCase(transactions, observations, {
    generate: () => CLAIM,
  });

  const base = {
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    candidateProductId: null,
    schemeCode: 'GTIN',
    issuerNamespace: null as string | null,
    sourceValue: '0012345678905',
    observedAt: OBSERVED_AT,
  };

  await assert.rejects(useCase.execute({ ...base, schemeCode: ' GTIN ' }), InvalidInputError);
  await assert.rejects(
    useCase.execute({ ...base, issuerNamespace: ' GS1 ' }),
    InvalidInputError,
  );
  await assert.rejects(useCase.execute({ ...base, sourceValue: '' }), InvalidInputError);
  assert.equal(requested, false);
});
