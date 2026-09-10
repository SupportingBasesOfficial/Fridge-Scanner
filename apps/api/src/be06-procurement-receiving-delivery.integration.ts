import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  AddHouseholdMemberUseCase,
  CreatePurchaseUseCase,
  CreateReceiptItemIntentUseCase,
  CreateReceiptUseCase,
  GetHouseholdPurchaseUseCase,
  HouseholdMembershipId,
  InventoryMovementId,
  ListHouseholdPurchasesUseCase,
  MaterializeOrdinaryReceiptItemUseCase,
  PrincipalId,
  PurchaseId,
  PurchaseItemId,
  PurchaseItemReceiptAllocationId,
  ReadAuthorizedHouseholdContext,
  ReadCurrentHouseholdMembersUseCase,
  ReceiptId,
  ReceiptItemId,
  ReceiptItemIntentId,
  ReceiptItemInventoryEffectId,
  StockItemId,
} from '@fridge/application';
import type { RuntimeConfig } from '@fridge/config';
import { PgDatabase, PgHouseholdProfileReader } from '@fridge/database';
import { PgHouseholdPurchaseWriter } from '@fridge/database/create-purchase';
import { PgHouseholdReceiptWriter } from '@fridge/database/create-receipt';
import { PgHouseholdReceiptItemIntentWriter } from '@fridge/database/create-receipt-item-intent';
import { PgHouseholdOrdinaryReceiptItemMaterializer } from '@fridge/database/materialize-ordinary-receipt-item';
import { PgCurrentHouseholdMembershipReader } from '@fridge/database/membership-read';
import { PgHouseholdProcurementAdministrationTransactionManager } from '@fridge/database/procurement-administration';
import { PgHouseholdPurchaseReader } from '@fridge/database/purchase-read';
import { BearerAuthenticatedPrincipalResolver, type PlatformPrincipalMapper } from './auth.js';
import { JwtJwksAuthenticationEvidenceVerifier } from './jwt-jwks-verifier.js';
import { buildApiServer } from './server.js';

const databaseUrl = process.env.BE00_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('BE00_TEST_DATABASE_URL is required for BE-06 delivery integration tests');

// Reuse the accepted ordinary-receiving fixture established by the database
// integration suite before API integration runs in BE-00.
const HOUSEHOLD = 'a7310001-0b06-4731-8731-000000000001';
const FOREIGN_CONTEXT = 'a731ffff-0b06-4731-8731-00000000ffff';
const ADMIN = PrincipalId('a7310002-0b06-4731-8731-000000000002');
const ORDINARY = PrincipalId('a7310003-0b06-4731-8731-000000000003');
const PRODUCT = 'a7310006-0b06-4731-8731-000000000006';
const UNIT = 'a7310008-0b06-4731-8731-000000000008';
const LOCATION = 'a7310012-0b06-4731-8731-000000000012';

const PURCHASE = PurchaseId('f0610010-0b06-4061-8061-000000000010');
const PURCHASE_ITEM = PurchaseItemId('f0610011-0b06-4061-8061-000000000011');
const RECEIPT = ReceiptId('f0610012-0b06-4061-8061-000000000012');
const INTENT = ReceiptItemIntentId('f0610013-0b06-4061-8061-000000000013');
const RECEIPT_ITEM = ReceiptItemId('f0610014-0b06-4061-8061-000000000014');
const ALLOCATION = PurchaseItemReceiptAllocationId('f0610015-0b06-4061-8061-000000000015');
const STOCK = StockItemId('f0610016-0b06-4061-8061-000000000016');
const MOVEMENT = InventoryMovementId('f0610017-0b06-4061-8061-000000000017');
const EFFECT = ReceiptItemInventoryEffectId('f0610018-0b06-4061-8061-000000000018');

const issuer = 'https://be06-issuer.example.test';
const audience = 'fridge-api';
const nowMs = Date.UTC(2026, 8, 10, 4, 0, 0);
const keyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = {
  ...keyPair.publicKey.export({ format: 'jwk' }),
  kid: 'be06-delivery-key',
  alg: 'ES256',
  use: 'sig',
  key_ops: ['verify'],
};
const ADMIN_SUBJECT = 'be06-procurement-admin-subject';
const ORDINARY_SUBJECT = 'be06-procurement-ordinary-subject';

const config: RuntimeConfig = {
  nodeEnv: 'test',
  databaseUrl,
  databaseCapabilityRole: 'fridge_app',
  httpHost: '127.0.0.1',
  httpPort: 3000,
  logLevel: 'fatal',
  shutdownTimeoutMs: 1_000,
  authentication: Object.freeze({
    issuer,
    audience,
    jwksUrl: `${issuer}/.well-known/jwks.json`,
    algorithms: Object.freeze(['ES256'] as const),
  }),
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function issueToken(subject: string): string {
  const header = encodeJson({ alg: 'ES256', typ: 'JWT', kid: 'be06-delivery-key' });
  const payload = encodeJson({
    iss: issuer,
    sub: subject,
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 300,
    // Deliberately untrusted provider claims. They cannot create procurement
    // authority or override the Household requested by the HTTP route.
    role: 'provider-super-admin',
    household_id: FOREIGN_CONTEXT,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput, 'ascii'), {
    key: keyPair.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function buildIntegrationServer(database: PgDatabase) {
  const verifier = new JwtJwksAuthenticationEvidenceVerifier({
    trust: config.authentication!,
    now: () => nowMs,
    fetch: async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const principalMapper: PlatformPrincipalMapper = {
    async resolve(identity) {
      assert.equal(identity.authority, issuer);
      if (identity.subject === ADMIN_SUBJECT) return ADMIN;
      if (identity.subject === ORDINARY_SUBJECT) return ORDINARY;
      throw new Error('unexpected BE-06 integration identity subject');
    },
  };
  const authenticatedPrincipal = new BearerAuthenticatedPrincipalResolver(verifier, principalMapper);
  const procurement = new PgHouseholdProcurementAdministrationTransactionManager(database);
  const purchaseReader = new PgHouseholdPurchaseReader();

  return buildApiServer({
    config,
    readiness: database,
    authenticatedPrincipal,
    readAuthorizedHouseholdContext: new ReadAuthorizedHouseholdContext(database, new PgHouseholdProfileReader()),
    readCurrentHouseholdMembers: new ReadCurrentHouseholdMembersUseCase(database, new PgCurrentHouseholdMembershipReader()),
    addHouseholdMember: new AddHouseholdMemberUseCase(
      database,
      database,
      { generate: () => HouseholdMembershipId('f0610099-0b06-4061-8061-000000000099') },
    ),
    procurementReceiving: {
      listHouseholdPurchases: new ListHouseholdPurchasesUseCase(database, purchaseReader),
      getHouseholdPurchase: new GetHouseholdPurchaseUseCase(database, purchaseReader),
      createPurchase: new CreatePurchaseUseCase(
        procurement,
        new PgHouseholdPurchaseWriter(),
        { generate: () => PURCHASE },
        { generate: () => PURCHASE_ITEM },
      ),
      createReceipt: new CreateReceiptUseCase(
        procurement,
        new PgHouseholdReceiptWriter(),
        { generate: () => RECEIPT },
      ),
      createReceiptItemIntent: new CreateReceiptItemIntentUseCase(
        procurement,
        new PgHouseholdReceiptItemIntentWriter(),
        { generate: () => INTENT },
      ),
      materializeOrdinaryReceiptItem: new MaterializeOrdinaryReceiptItemUseCase(
        procurement,
        new PgHouseholdOrdinaryReceiptItemMaterializer(),
        { generate: () => RECEIPT_ITEM },
        { generate: () => ALLOCATION },
        { generate: () => STOCK },
        { generate: () => MOVEMENT },
        { generate: () => EFFECT },
      ),
    },
  });
}

test('B6-HTTP-EXIT signed identity reaches Purchase -> Receipt -> atomic ingress -> authenticated observation', async () => {
  const database = new PgDatabase({ connectionString: databaseUrl, capabilityRole: 'fridge_app', maxConnections: 4 });
  const server = buildIntegrationServer(database);
  const adminToken = issueToken(ADMIN_SUBJECT);
  const ordinaryToken = issueToken(ORDINARY_SUBJECT);
  const materializeCommandId = 'f0611005-0b06-4061-8061-000000001005';

  try {
    const denied = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/purchases`,
      headers: { authorization: `Bearer ${ordinaryToken}` },
      payload: {
        commandId: 'f0611001-0b06-4061-8061-000000001001',
        transactionCurrencyCode: 'RMI',
        items: [{ productId: PRODUCT, quantity: { numerator: '5', denominator: '1' }, measurementUnitId: UNIT }],
      },
    });
    assert.equal(denied.statusCode, 404);
    assert.equal(denied.json().error.code, 'NOT_FOUND');

    const purchase = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/purchases`,
      headers: {
        authorization: `Bearer ${adminToken}`,
        'x-principal-id': String(ORDINARY),
      },
      payload: {
        commandId: 'f0611002-0b06-4061-8061-000000001002',
        transactionCurrencyCode: 'RMI',
        items: [{ productId: PRODUCT, quantity: { numerator: '5', denominator: '1' }, measurementUnitId: UNIT }],
      },
    });
    assert.equal(purchase.statusCode, 201);
    assert.deepEqual(purchase.json(), { purchaseId: String(PURCHASE), purchaseItemIds: [String(PURCHASE_ITEM)] });

    const purchaseReplay = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/purchases`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: 'f0611002-0b06-4061-8061-000000001002',
        transactionCurrencyCode: 'RMI',
        items: [{ productId: PRODUCT, quantity: { numerator: '5', denominator: '1' }, measurementUnitId: UNIT }],
      },
    });
    assert.equal(purchaseReplay.statusCode, 201);
    assert.deepEqual(purchaseReplay.json(), purchase.json());

    const receipt = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/receipts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: 'f0611003-0b06-4061-8061-000000001003',
        purchaseId: String(PURCHASE),
        provenance: 'authenticated phase exit receipt',
      },
    });
    assert.equal(receipt.statusCode, 201);
    assert.deepEqual(receipt.json(), { receiptId: String(RECEIPT) });

    const intent = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/receipts/${RECEIPT}/item-intents`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: 'f0611004-0b06-4061-8061-000000001004',
        productId: PRODUCT,
        quantity: { numerator: '2', denominator: '1' },
        measurementUnitId: UNIT,
        provenance: 'authenticated phase exit intent',
      },
    });
    assert.equal(intent.statusCode, 201);
    assert.deepEqual(intent.json(), { receiptItemIntentId: String(INTENT) });

    const materialized = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/receipt-item-intents/${INTENT}/materialize-ordinary`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: materializeCommandId,
        purchaseItemId: String(PURCHASE_ITEM),
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'authenticated phase exit ingress',
      },
    });
    assert.equal(materialized.statusCode, 201);
    assert.deepEqual(materialized.json(), {
      receiptItemId: String(RECEIPT_ITEM),
      purchaseItemReceiptAllocationId: String(ALLOCATION),
      stockItemId: String(STOCK),
      inventoryMovementId: String(MOVEMENT),
      receiptItemInventoryEffectId: String(EFFECT),
    });

    // Lost-response retry proves the physical ingress result is durably bound to
    // the original CommandId and is not regenerated or restored.
    const materializedReplay = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/receipt-item-intents/${INTENT}/materialize-ordinary`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: materializeCommandId,
        purchaseItemId: String(PURCHASE_ITEM),
        placement: { kind: 'LOCATION', storageLocationId: LOCATION },
        provenance: 'authenticated phase exit ingress',
      },
    });
    assert.equal(materializedReplay.statusCode, 201);
    assert.deepEqual(materializedReplay.json(), materialized.json());

    const observed = await server.inject({
      method: 'GET',
      url: `/households/${HOUSEHOLD}/purchases/${PURCHASE}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(observed.statusCode, 200);
    assert.equal(observed.json().purchase.purchaseId, String(PURCHASE));
    assert.equal(observed.json().purchase.items[0].purchaseItemId, String(PURCHASE_ITEM));
    assert.deepEqual(observed.json().purchase.items[0].quantity, { numerator: '5', denominator: '1' });

    const foreign = await server.inject({
      method: 'GET',
      url: `/households/${FOREIGN_CONTEXT}/purchases/${PURCHASE}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(foreign.statusCode, 404);
    assert.equal(foreign.json().error.code, 'NOT_FOUND');
  } finally {
    await server.close();
    await database.close();
  }
});
