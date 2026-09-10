import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {
  HouseholdId,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemMoneyFactId,
  type CommitPurchaseItemPricingBasisInput,
  type CommitPurchaseItemPricingExtensionInput,
  type CommitPurchaseItemSourceMoneyFactsInput,
} from '@fridge/application';
import type { AuthenticatedPrincipalResolver } from './auth.js';
import { registerProcurementPricingRoutes } from './procurement-pricing-routes.js';

const PRINCIPAL = PrincipalId('f0620001-0b06-4062-8062-000000000001');
const HOUSEHOLD = HouseholdId('f0620002-0b06-4062-8062-000000000002');
const PURCHASE = PurchaseId('f0620003-0b06-4062-8062-000000000003');
const ITEM = PurchaseItemId('f0620004-0b06-4062-8062-000000000004');
const MONEY_FACT = PurchaseItemMoneyFactId('f0620005-0b06-4062-8062-000000000005');

const authenticatedPrincipal: AuthenticatedPrincipalResolver = {
  async resolve() { return PRINCIPAL; },
};

test('BE-06 pricing HTTP preserves exact decimal strings and exact-rational basis transport', async () => {
  const server = Fastify();
  let sourceInput: CommitPurchaseItemSourceMoneyFactsInput | undefined;
  let basisInput: CommitPurchaseItemPricingBasisInput | undefined;
  let extensionInput: CommitPurchaseItemPricingExtensionInput | undefined;

  registerProcurementPricingRoutes(server, authenticatedPrincipal, {
    commitSourceMoneyFacts: {
      async execute(input) {
        sourceInput = input;
        return { purchaseItemMoneyFactIds: [MONEY_FACT] };
      },
    },
    commitPricingBasis: {
      async execute(input) {
        basisInput = input;
        return { purchaseItemMoneyFactId: MONEY_FACT };
      },
    },
    commitPricingExtension: {
      async execute(input) {
        extensionInput = input;
        return { purchaseItemMoneyFactId: MONEY_FACT, pricingDiscrepancyId: null };
      },
    },
  });

  try {
    const source = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/purchases/${PURCHASE}/items/${ITEM}/source-money-facts`,
      payload: {
        commandId: 'f0620010-0b06-4062-8062-000000000010',
        facts: [{ semanticRole: 'LINE_NET', amount: '12.3400', provenance: '  receipt lexical amount  ' }],
      },
    });
    assert.equal(source.statusCode, 201);
    assert.equal(sourceInput?.actorPrincipalId, PRINCIPAL);
    assert.equal(sourceInput?.facts[0]?.amount, '12.3400');
    assert.equal(sourceInput?.facts[0]?.semanticRole, 'LINE_NET');

    const basis = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/purchases/${PURCHASE}/items/${ITEM}/pricing-basis`,
      payload: {
        commandId: 'f0620011-0b06-4062-8062-000000000011',
        pricingBasisQuantity: { numerator: '3', denominator: '2' },
        pricingBasisUnitId: 'f0620012-0b06-4062-8062-000000000012',
        basisAmount: '4.500',
        provenance: 'basis proof',
      },
    });
    assert.equal(basis.statusCode, 201);
    assert.equal(basisInput?.pricingBasisQuantity.numerator, 3n);
    assert.equal(basisInput?.pricingBasisQuantity.denominator, 2n);
    assert.equal(basisInput?.basisAmount, '4.500');
    assert.equal(basisInput?.pricingConversionEvidenceId, undefined);

    assert.equal(extensionInput, undefined);
  } finally {
    await server.close();
  }
});
