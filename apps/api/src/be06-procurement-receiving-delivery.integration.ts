import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { Pool } from 'pg';
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
import {
  BearerAuthenticatedPrincipalResolver,
  type PlatformPrincipalMapper,
} from './auth.js';
import { JwtJwksAuthenticationEvidenceVerifier } from './jwt-jwks-verifier.js';
import { buildApiServer } from './server.js';

const databaseUrl = process.env.BE00_TEST_DATABASE_URL;
const adminDatabaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('BE00_TEST_DATABASE_URL is required for BE-06 delivery integration tests');
if (!adminDatabaseUrl) throw new Error('DATABASE_URL is required for BE-06 delivery integration tests');

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

const HOUSEHOLD = 'f0600001-0b06-4060-8060-000000000001';
const FOREIGN_CONTEXT = 'f0600002-0b06-4060-8060-000000000002';
const ADMIN = PrincipalId('f0600003-0b06-4060-8060-000000000003');
const ORDINARY = PrincipalId('f0600004-0b06-4060-8060-000000000004');
const ADMIN_MEMBERSHIP = 'f0600005-0b06-4060-8060-000000000005';
const ORDINARY_MEMBERSHIP = 'f0600006-0b06-4060-8060-000000000006';
const ADMIN_ROLE = 'BE06_HTTP_PROCUREMENT_ADMIN';
const ORDINARY_ROLE = 'BE06_HTTP_ORDINARY';
const PRODUCT = 'f0600007-0b06-4060-8060-000000000007';
const UNIT = 'f0600008-0b06-4060-8060-000000000008';
const LOCATION = 'f0600009-0b06-4060-8060-000000000009';
const PURCHASE = PurchaseId('f0600010-0b06-4060-8060-000000000010');
const PURCHASE_ITEM = PurchaseItemId('f0600011-0b06-4060-8060-000000000011');
const RECEIPT = ReceiptId('f0600012-0b06-4060-8060-000000000012');
const INTENT = ReceiptItemIntentId('f0600013-0b06-4060-8060-000000000013');
const RECEIPT_ITEM = ReceiptItemId('f0600014-0b06-4060-8060-000000000014');
const ALLOCATION = PurchaseItemReceiptAllocationId('f0600015-0b06-4060-8060-000000000015');
const STOCK = StockItemId('f0600016-0b06-4060-8060-000000000016');
const MOVEMENT = InventoryMovementId('f0600017-0b06-4060-8060-000000000017');
const EFFECT = ReceiptItemInventoryEffectId('f0600018-0b06-4060-8060-000000000018');
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

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE06 HTTP admin'), ($2::uuid, 'BE06 HTTP ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE06 HTTP household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ($1, 'BE06 HTTP procurement admin'), ($2, 'BE06 HTTP ordinary')`,
      [ADMIN_ROLE, ORDINARY_ROLE],
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ($1, 'HOUSEHOLD_PROCUREMENT_ADMINISTER')`,
      [ADMIN_ROLE],
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, $6, 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, $7, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY, ADMIN_ROLE, ORDINARY_ROLE],
    );
    await pool.query(
      `insert into fridge.measurement_dimension (dimension_code, display_name, lifecycle_status)
       values ('BE06_HTTP_COUNT', 'BE06 HTTP count', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.measurement_unit (
         measurement_unit_id, unit_code, dimension_code, display_name, lifecycle_status
       ) values ($1::uuid, 'BE06_HTTP_EACH', 'BE06_HTTP_COUNT', 'BE06 HTTP each', 'ACTIVE')`,
      [UNIT],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', 'BE06 HTTP product', 'ACTIVE')`,
      [PRODUCT],
    );
    await pool.query(
      `insert into fridge.currency (currency_code, display_name, lifecycle_status)
       values ('BHT', 'BE06 HTTP test currency', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ('BE06_HTTP_LOCATION', 'BE06 HTTP location', 'ACTIVE')`,
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name,
         lifecycle_status, created_at, retired_at
       ) values ($1::uuid, $2::uuid, 'BE06_HTTP_LOCATION', 'BE06 HTTP fridge',
                 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [LOCATION, HOUSEHOLD],
    );
  } finally {
    await pool.end();
  }
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
      { generate: () => HouseholdMembershipId('f0600099-0b06-4060-8060-000000000099') },
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

await seedFixture();

test('B6-HTTP-EXIT signed identity reaches exact Purchase -> Receipt -> atomic inventory ingress -> authenticated observation', async () => {
  const database = new PgDatabase({ connectionString: databaseUrl, capabilityRole: 'fridge_app', maxConnections: 4 });
  const adminPool = new Pool({ connectionString: adminDatabaseUrl, max: 1 });
  const server = buildIntegrationServer(database);
  const adminToken = issueToken(ADMIN_SUBJECT);
  const ordinaryToken = issueToken(ORDINARY_SUBJECT);

  try {
    const denied = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/purchases`,
      headers: { authorization: `Bearer ${ordinaryToken}` },
      payload: {
        commandId: 'f0601001-0b06-4060-8060-000000001001',
        transactionCurrencyCode: 'BHT',
        items: [{
          productId: PRODUCT,
          quantity: { numerator: '5', denominator: '1' },
          measurementUnitId: UNIT,
        }],
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
        commandId: 'f0601002-0b06-4060-8060-000000001002',
        transactionCurrencyCode: 'BHT',
        items: [{
          productId: PRODUCT,
          quantity: { numerator: '5', denominator: '1' },
          measurementUnitId: UNIT,
        }],
      },
    });
    assert.equal(purchase.statusCode, 201);
    assert.deepEqual(purchase.json(), {
      purchaseId: String(PURCHASE),
      purchaseItemIds: [String(PURCHASE_ITEM)],
    });

    const replay = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/purchases`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: 'f0601002-0b06-4060-8060-000000001002',
        transactionCurrencyCode: 'BHT',
        items: [{
          productId: PRODUCT,
          quantity: { numerator: '5', denominator: '1' },
          measurementUnitId: UNIT,
        }],
      },
    });
    assert.equal(replay.statusCode, 201);
    assert.deepEqual(replay.json(), purchase.json());

    const receipt = await server.inject({
      method: 'POST',
      url: `/households/${HOUSEHOLD}/receipts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        commandId: 'f0601003-0b06-4060-8060-000000001003',
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
        commandId: 'f0601004-0b06-4060-8060-000000001004',
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
        commandId: 'f0601005-0b06-4060-8060-000000001005',
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

    const physical = await adminPool.query<{
      received_quantity_num: string;
      received_quantity_den: string;
      allocated_quantity_num: string;
      allocated_quantity_den: string;
      movement_quantity_num: string;
      movement_quantity_den: string;
      movement_kind: string;
      effect_quantity_num: string;
      effect_quantity_den: string;
      storage_location_id: string | null;
    }>(
      `select ri.received_quantity_num::text,
              ri.received_quantity_den::text,
              a.allocated_quantity_num::text,
              a.allocated_quantity_den::text,
              im.quantity_num::text as movement_quantity_num,
              im.quantity_den::text as movement_quantity_den,
              im.movement_kind,
              rie.effect_quantity_num::text,
              rie.effect_quantity_den::text,
              si.storage_location_id::text
         from fridge.receipt_item ri
         join fridge.purchase_item_receipt_allocation a on a.receipt_item_id = ri.receipt_item_id
         join fridge.receipt_item_inventory_effect rie on rie.receipt_item_id = ri.receipt_item_id
         join fridge.inventory_movement im on im.inventory_movement_id = rie.inventory_movement_id
         join fridge.stock_item si on si.stock_item_id = im.stock_item_id
        where ri.receipt_item_id = $1::uuid`,
      [RECEIPT_ITEM],
    );
    assert.deepEqual(physical.rows, [{
      received_quantity_num: '2',
      received_quantity_den: '1',
      allocated_quantity_num: '2',
      allocated_quantity_den: '1',
      movement_quantity_num: '2',
      movement_quantity_den: '1',
      movement_kind: 'RECEIPT_INGRESS',
      effect_quantity_num: '2',
      effect_quantity_den: '1',
      storage_location_id: LOCATION,
    }]);

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
    await adminPool.end();
  }
});
