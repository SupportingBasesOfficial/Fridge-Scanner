import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommandId,
  CompatibilityEvidenceId,
  CompatibilityMappingId,
  HouseholdId,
  HouseholdMembershipId,
  PrincipalId,
  instant,
} from '@fridge/domain';
import {
  CommitCompatibilityDecisionEvidenceUseCase,
  type CommitCompatibilityDecisionEvidencePersistenceInput,
  type CompatibilityDecisionEvidenceWriter,
  type TransactionHandle,
  type TransactionManager,
} from './index.js';

const COMMAND = CommandId('d8e40101-0b13-4d01-8b13-000000000001');
const ACTOR = PrincipalId('d8e40202-0b13-4d02-8b13-000000000002');
const HOUSEHOLD = HouseholdId('d8e40303-0b13-4d03-8b13-000000000003');
const MEMBERSHIP = HouseholdMembershipId('d8e40404-0b13-4d04-8b13-000000000004');
const MAPPING = CompatibilityMappingId('d8e40505-0b13-4d05-8b13-000000000005');
const CANDIDATE_EVIDENCE = CompatibilityEvidenceId('d8e40606-0b13-4d06-8b13-000000000006');
const PERSISTED_EVIDENCE = CompatibilityEvidenceId('d8e40707-0b13-4d07-8b13-000000000007');
const ANCHOR = instant('2026-09-09T04:10:00.000Z');

function fakeTransaction(): TransactionHandle {
  return {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: MEMBERSHIP,
    householdRoleCode: 'MEMBER',
  } as unknown as TransactionHandle;
}

test('CommitCompatibilityDecisionEvidenceUseCase binds current Household context and exact provenance', async () => {
  let requestedActor: unknown;
  let requestedHousehold: unknown;
  let persisted: CommitCompatibilityDecisionEvidencePersistenceInput | undefined;

  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(principalId, householdId, operation) {
      requestedActor = principalId;
      requestedHousehold = householdId;
      return operation(fakeTransaction());
    },
  };
  const evidence: CompatibilityDecisionEvidenceWriter = {
    async commitCompatibilityDecisionEvidence(_transaction, input) {
      persisted = input;
      return {
        compatibilityEvidenceId: PERSISTED_EVIDENCE,
        evaluationAnchor: ANCHOR,
      };
    },
  };

  const useCase = new CommitCompatibilityDecisionEvidenceUseCase(
    transactions,
    evidence,
    { generate: () => CANDIDATE_EVIDENCE },
  );

  const output = await useCase.execute({
    commandId: COMMAND,
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    compatibilityMappingId: MAPPING,
    provenance: ' scanner:decision-v1 ',
  });

  assert.equal(requestedActor, ACTOR);
  assert.equal(requestedHousehold, HOUSEHOLD);
  assert.deepEqual(persisted, {
    commandId: COMMAND,
    candidateCompatibilityEvidenceId: CANDIDATE_EVIDENCE,
    compatibilityMappingId: MAPPING,
    provenance: ' scanner:decision-v1 ',
  });
  assert.deepEqual(output, {
    compatibilityEvidenceId: PERSISTED_EVIDENCE,
    evaluationAnchor: ANCHOR,
  });
});

test('CommitCompatibilityDecisionEvidenceUseCase rejects blank provenance before persistence', async () => {
  let called = false;
  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(_principalId, _householdId, operation) {
      return operation(fakeTransaction());
    },
  };
  const evidence: CompatibilityDecisionEvidenceWriter = {
    async commitCompatibilityDecisionEvidence() {
      called = true;
      return { compatibilityEvidenceId: PERSISTED_EVIDENCE, evaluationAnchor: ANCHOR };
    },
  };
  const useCase = new CommitCompatibilityDecisionEvidenceUseCase(
    transactions,
    evidence,
    { generate: () => CANDIDATE_EVIDENCE },
  );

  await assert.rejects(
    useCase.execute({
      commandId: COMMAND,
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      compatibilityMappingId: MAPPING,
      provenance: '   ',
    }),
    TypeError,
  );
  assert.equal(called, false);
});
