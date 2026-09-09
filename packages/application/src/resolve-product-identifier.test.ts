import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HouseholdId,
  PrincipalId,
  ProductId,
  ProductIdentifierId,
  ProductIdentifierNormalizationRuleId,
} from './index.js';
import type { TransactionHandle, TransactionManager } from './index.js';
import {
  ResolveProductIdentifierUseCase,
  type ProductIdentifierResolver,
  type ProductIdentifierResolutionKey,
} from './resolve-product-identifier.js';

const ACTOR = PrincipalId('b1c10101-0b11-4d01-8b11-000000000001');
const HOUSEHOLD = HouseholdId('b1c10202-0b11-4d02-8b11-000000000002');
const RULE = ProductIdentifierNormalizationRuleId('b1c10303-0b11-4d03-8b11-000000000003');
const IDENTIFIER = ProductIdentifierId('b1c10404-0b11-4d04-8b11-000000000004');
const PRODUCT = ProductId('b1c10505-0b11-4d05-8b11-000000000005');

function harness(result: { readonly productIdentifierId: ProductIdentifierId; readonly productId: ProductId } | null) {
  let capturedKey: ProductIdentifierResolutionKey | undefined;
  const transaction = {
    kind: 'fridge-transaction',
    principalId: ACTOR,
    householdId: HOUSEHOLD,
    membershipId: 'b1c10606-0b11-4d06-8b11-000000000006',
    householdRoleCode: 'MEMBER',
  } as unknown as TransactionHandle;
  const transactions: TransactionManager = {
    async withAuthorizedHouseholdTransaction(principalId, householdId, operation) {
      assert.equal(principalId, ACTOR);
      assert.equal(householdId, HOUSEHOLD);
      return operation(transaction);
    },
  };
  const identifiers: ProductIdentifierResolver = {
    async resolveProductIdentifier(_transaction, key) {
      assert.equal(_transaction, transaction);
      capturedKey = key;
      return result;
    },
  };
  return { useCase: new ResolveProductIdentifierUseCase(transactions, identifiers), getKey: () => capturedKey };
}

test('delegates one exact governed normalized key and returns the visible canonical binding', async () => {
  const { useCase, getKey } = harness({ productIdentifierId: IDENTIFIER, productId: PRODUCT });
  const output = await useCase.execute({
    actorPrincipalId: ACTOR,
    householdId: HOUSEHOLD,
    schemeCode: 'GTIN',
    issuerNamespace: null,
    normalizationRuleId: RULE,
    normalizedValue: ' 000123 ',
  });

  assert.deepEqual(output, { resolution: { productIdentifierId: IDENTIFIER, productId: PRODUCT } });
  assert.deepEqual(getKey(), {
    schemeCode: 'GTIN',
    issuerNamespace: null,
    normalizationRuleId: RULE,
    normalizedValue: ' 000123 ',
  });
});

test('returns null when no visible current canonical binding exists', async () => {
  const { useCase } = harness(null);
  assert.deepEqual(
    await useCase.execute({
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      schemeCode: 'INTERNAL_SKU',
      issuerNamespace: 'retailer.example',
      normalizationRuleId: RULE,
      normalizedValue: 'SKU-42',
    }),
    { resolution: null },
  );
});

test('rejects malformed scheme/issuer and empty normalized values before repository access', async () => {
  const { useCase, getKey } = harness(null);
  await assert.rejects(
    useCase.execute({
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      schemeCode: ' GTIN',
      issuerNamespace: null,
      normalizationRuleId: RULE,
      normalizedValue: '000123',
    }),
    TypeError,
  );
  await assert.rejects(
    useCase.execute({
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      schemeCode: 'GTIN',
      issuerNamespace: 'issuer ',
      normalizationRuleId: RULE,
      normalizedValue: '000123',
    }),
    TypeError,
  );
  await assert.rejects(
    useCase.execute({
      actorPrincipalId: ACTOR,
      householdId: HOUSEHOLD,
      schemeCode: 'GTIN',
      issuerNamespace: null,
      normalizationRuleId: RULE,
      normalizedValue: '',
    }),
    TypeError,
  );
  assert.equal(getKey(), undefined);
});
