import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {
  InventoryMovementId,
  MeasurementUnitId,
  PrincipalId,
  PurchaseItemSubstitutionAllocationId,
  PurchaseReceivingExceptionId,
  PurchaseReceivingExceptionResolutionId,
  ReceiptItemId,
  ReceiptItemInventoryEffectId,
  StockItemId,
  exactRational,
  type AcceptOrdinaryOverReceiptInput,
  type AcceptSubstitutionOverReceiptInput,
  type MaterializeSubstitutionReceiptItemInput,
  type RegisterOverReceiptExceptionInput,
  type ResolveOverReceiptWithoutIngressInput,
} from '@fridge/application';
import type { AuthenticatedPrincipalResolver } from './auth.js';
import { registerProcurementReceivingExceptionRoutes } from './procurement-receiving-exception-routes.js';

const PRINCIPAL = PrincipalId('f0630001-0b06-4063-8063-000000000001');
const EXCEPTION = PurchaseReceivingExceptionId('f0630002-0b06-4063-8063-000000000002');
const RESOLUTION = PurchaseReceivingExceptionResolutionId('f0630003-0b06-4063-8063-000000000003');
const RECEIPT_ITEM = ReceiptItemId('f0630004-0b06-4063-8063-000000000004');
const SUB_ALLOCATION = PurchaseItemSubstitutionAllocationId('f0630005-0b06-4063-8063-000000000005');
const STOCK = StockItemId('f0630006-0b06-4063-8063-000000000006');
const MOVEMENT = InventoryMovementId('f0630007-0b06-4063-8063-000000000007');
const EFFECT = ReceiptItemInventoryEffectId('f0630008-0b06-4063-8063-000000000008');
const UNIT = MeasurementUnitId('f0630009-0b06-4063-8063-000000000009');

const authenticatedPrincipal: AuthenticatedPrincipalResolver = {
  async resolve() { return PRINCIPAL; },
};

test('BE-06 exception HTTP preserves explicit substitution, detection and nonphysical resolution semantics', async () => {
  const server = Fastify();
  let substitution: MaterializeSubstitutionReceiptItemInput | undefined;
  let detection: RegisterOverReceiptExceptionInput | undefined;
  let nonphysical: ResolveOverReceiptWithoutIngressInput | undefined;
  let ordinaryAcceptance: AcceptOrdinaryOverReceiptInput | undefined;
  let substitutionAcceptance: AcceptSubstitutionOverReceiptInput | undefined;

  registerProcurementReceivingExceptionRoutes(server, authenticatedPrincipal, {
    materializeSubstitutionReceiptItem: {
      async execute(input) {
        substitution = input;
        return {
          receiptItemId: RECEIPT_ITEM,
          purchaseItemSubstitutionAllocationId: SUB_ALLOCATION,
          stockItemId: STOCK,
          inventoryMovementId: MOVEMENT,
          receiptItemInventoryEffectId: EFFECT,
        };
      },
    },
    registerOverReceiptException: {
      async execute(input) {
        detection = input;
        return {
          purchaseReceivingExceptionId: EXCEPTION,
          discrepantQuantity: exactRational(3n, 2n),
          discrepantUnitId: UNIT,
        };
      },
    },
    acceptOrdinaryOverReceipt: {
      async execute(input) {
        ordinaryAcceptance = input;
        throw new Error('ordinary acceptance not expected in this contract test');
      },
    },
    acceptSubstitutionOverReceipt: {
      async execute(input) {
        substitutionAcceptance = input;
        throw new Error('substitution acceptance not expected in this contract test');
      },
    },
    resolveOverReceiptWithoutIngress: {
      async execute(input) {
        nonphysical = input;
        return {
          purchaseReceivingExceptionResolutionId: RESOLUTION,
          resolutionKind: input.resolutionKind,
        };
      },
    },
  });

  try {
    const materialized = await server.inject({
      method: 'POST',
      url: '/households/f0630010-0b06-4063-8063-000000000010/receipt-item-intents/f0630011-0b06-4063-8063-000000000011/materialize-substitution',
      payload: {
        commandId: 'f0630012-0b06-4063-8063-000000000012',
        purchaseItemId: 'f0630013-0b06-4063-8063-000000000013',
        reason: '  supplier substitute  ',
        placement: { kind: 'LOCATION', storageLocationId: 'f0630014-0b06-4063-8063-000000000014' },
        provenance: '  receipt evidence  ',
      },
    });
    assert.equal(materialized.statusCode, 201);
    assert.equal(substitution?.actorPrincipalId, PRINCIPAL);
    assert.equal(substitution?.reason, '  supplier substitute  ');
    assert.equal(substitution?.allocationConversionEvidenceId, undefined);
    assert.equal(materialized.json().purchaseItemSubstitutionAllocationId, String(SUB_ALLOCATION));

    const detected = await server.inject({
      method: 'POST',
      url: '/households/f0630010-0b06-4063-8063-000000000010/receipt-item-intents/f0630011-0b06-4063-8063-000000000011/over-receipt-exceptions',
      payload: {
        commandId: 'f0630015-0b06-4063-8063-000000000015',
        purchaseItemId: 'f0630013-0b06-4063-8063-000000000013',
        reason: 'presented excess',
        provenance: 'delivery evidence',
      },
    });
    assert.equal(detected.statusCode, 201);
    assert.equal(detection?.actorPrincipalId, PRINCIPAL);
    assert.deepEqual(detected.json().discrepantQuantity, { numerator: '3', denominator: '2' });

    const resolved = await server.inject({
      method: 'POST',
      url: `/households/f0630010-0b06-4063-8063-000000000010/over-receipt-exceptions/${EXCEPTION}/resolve-without-ingress`,
      payload: {
        commandId: 'f0630016-0b06-4063-8063-000000000016',
        resolutionKind: 'REJECTED_NO_INGRESS',
        reason: 'returned to supplier',
        provenance: 'receiving desk decision',
      },
    });
    assert.equal(resolved.statusCode, 201);
    assert.equal(nonphysical?.resolutionKind, 'REJECTED_NO_INGRESS');
    assert.deepEqual(resolved.json(), {
      purchaseReceivingExceptionResolutionId: String(RESOLUTION),
      resolutionKind: 'REJECTED_NO_INGRESS',
    });

    assert.equal(ordinaryAcceptance, undefined);
    assert.equal(substitutionAcceptance, undefined);
  } finally {
    await server.close();
  }
});

test('BE-06 nonphysical resolution HTTP rejects an invented resolution kind before use-case execution', async () => {
  const server = Fastify();
  let called = false;
  registerProcurementReceivingExceptionRoutes(server, authenticatedPrincipal, {
    materializeSubstitutionReceiptItem: { async execute() { throw new Error('not expected'); } },
    registerOverReceiptException: { async execute() { throw new Error('not expected'); } },
    acceptOrdinaryOverReceipt: { async execute() { throw new Error('not expected'); } },
    acceptSubstitutionOverReceipt: { async execute() { throw new Error('not expected'); } },
    resolveOverReceiptWithoutIngress: {
      async execute() {
        called = true;
        return { purchaseReceivingExceptionResolutionId: RESOLUTION, resolutionKind: 'REJECTED_NO_INGRESS' };
      },
    },
  });

  try {
    const response = await server.inject({
      method: 'POST',
      url: `/households/f0630010-0b06-4063-8063-000000000010/over-receipt-exceptions/${EXCEPTION}/resolve-without-ingress`,
      payload: {
        commandId: 'f0630017-0b06-4063-8063-000000000017',
        resolutionKind: 'MAGIC_OVERRIDE',
        reason: 'invalid',
        provenance: 'invalid',
      },
    });
    assert.equal(response.statusCode, 500);
    assert.equal(called, false);
  } finally {
    await server.close();
  }
});
