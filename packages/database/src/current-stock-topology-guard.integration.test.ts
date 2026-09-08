import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompartmentId,
  ConflictError,
  HouseholdId,
  PrincipalId,
  RetireCompartmentUseCase,
  StorageLocationId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgCompartmentRetirer } from './retire-compartment.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required for stock topology guard tests');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required for stock topology guard tests');

const HOUSEHOLD = HouseholdId('f1a80101-0b04-4f01-8b04-000000000001');
const ADMIN = PrincipalId('f1a80202-0b04-4f02-8b04-000000000002');
const MEMBERSHIP = 'f1a80303-0b04-4f03-8b04-000000000003';
const STORAGE_KIND = 'BE04_STG_STORAGE';
const PRODUCT = 'f1a80404-0b04-4f04-8b04-000000000004';

async function seedBase(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Stock Topology Guard Admin')`,
      [ADMIN],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Stock Topology Guard Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_STG_ADMIN', 'BE04 stock topology guard admin')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_STG_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code, lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, 'BE04_STG_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBERSHIP, HOUSEHOLD, ADMIN],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 stock topology guard storage', 'ACTIVE')`,
      [STORAGE_KIND],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', null, 'BE04 stock topology guard fixture', 'ACTIVE')`,
      [PRODUCT],
    );
  } finally {
    await pool.end();
  }
}

await seedBase();

async function seedTopology(pool: Pool, location: StorageLocationId, compartment: CompartmentId): Promise<void> {
  await pool.query(
    `insert into fridge.storage_location (
       storage_location_id, household_id, kind_code, display_name, lifecycle_status, created_at, retired_at
     ) values ($1::uuid, $2::uuid, $3, 'Guard location', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
    [location, HOUSEHOLD, STORAGE_KIND],
  );
  await pool.query(
    `insert into fridge.compartment (
       compartment_id, household_id, storage_location_id, display_name, lifecycle_status, created_at, retired_at
     ) values ($1::uuid, $2::uuid, $3::uuid, 'Guard compartment', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
    [compartment, HOUSEHOLD, location],
  );
}

function retireUseCase(database: PgDatabase): RetireCompartmentUseCase {
  return new RetireCompartmentUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgCompartmentRetirer(),
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('placement-first serialization makes RetireCompartment observe the newly committed current stock', async () => {
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 2 });
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app', maxConnections: 1 });
  const location = StorageLocationId('f1a81111-0b04-4f11-8b04-000000000011');
  const compartment = CompartmentId('f1a81212-0b04-4f12-8b04-000000000012');
  const client = await admin.connect();
  try {
    await seedTopology(admin, location, compartment);
    await client.query('begin');
    await client.query(
      `insert into fridge.stock_item (
         stock_item_id, household_id, product_id, lifecycle_status,
         placement_anchor_kind, storage_location_id, compartment_id
       ) values (
         'f1a81313-0b04-4f13-8b04-000000000013'::uuid,
         $1::uuid, $2::uuid, 'ACTIVE', 'COMPARTMENT', null, $3::uuid
       )`,
      [HOUSEHOLD, PRODUCT, compartment],
    );

    let settled = false;
    const retirement = retireUseCase(database).execute({
      commandId: CommandId('f1a81414-0b04-4f14-8b04-000000000014'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      compartmentId: compartment,
    }).finally(() => { settled = true; });

    await delay(100);
    assert.equal(settled, false);
    await client.query('commit');
    await assert.rejects(retirement, ConflictError);
  } finally {
    if (!client.release) undefined;
    await client.query('rollback').catch(() => undefined);
    client.release();
    await admin.end();
    await database.close();
  }
});

test('retirement-first serialization rejects a current placement after topology becomes retired', async () => {
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 3 });
  const location = StorageLocationId('f1a82121-0b04-4f21-8b04-000000000021');
  const compartment = CompartmentId('f1a82222-0b04-4f22-8b04-000000000022');
  const locker = await admin.connect();
  try {
    await seedTopology(admin, location, compartment);
    await locker.query('begin');
    await locker.query(
      `select storage_location_id from fridge.storage_location
        where storage_location_id = $1::uuid for update`,
      [location],
    );
    await locker.query(
      `select compartment_id from fridge.compartment
        where compartment_id = $1::uuid for update`,
      [compartment],
    );
    await locker.query(
      `update fridge.compartment
          set lifecycle_status = 'RETIRED', retired_at = clock_timestamp()
        where compartment_id = $1::uuid`,
      [compartment],
    );

    let settled = false;
    const placement = admin.query(
      `insert into fridge.stock_item (
         stock_item_id, household_id, product_id, lifecycle_status,
         placement_anchor_kind, storage_location_id, compartment_id
       ) values (
         'f1a82323-0b04-4f23-8b04-000000000023'::uuid,
         $1::uuid, $2::uuid, 'ACTIVE', 'COMPARTMENT', null, $3::uuid
       )`,
      [HOUSEHOLD, PRODUCT, compartment],
    ).finally(() => { settled = true; });

    await delay(100);
    assert.equal(settled, false);
    await locker.query('commit');
    await assert.rejects(
      placement,
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, '23514');
        return true;
      },
    );
  } finally {
    await locker.query('rollback').catch(() => undefined);
    locker.release();
    await admin.end();
  }
});

test('current LOCATION placement cannot anchor to a retired StorageLocation', async () => {
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const location = StorageLocationId('f1a83131-0b04-4f31-8b04-000000000031');
  try {
    await admin.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name,
         lifecycle_status, created_at, retired_at
       ) values (
         $1::uuid, $2::uuid, $3, 'Retired guard location', 'RETIRED',
         clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour'
       )`,
      [location, HOUSEHOLD, STORAGE_KIND],
    );
    await assert.rejects(
      admin.query(
        `insert into fridge.stock_item (
           stock_item_id, household_id, product_id, lifecycle_status,
           placement_anchor_kind, storage_location_id, compartment_id
         ) values (
           'f1a83232-0b04-4f32-8b04-000000000032'::uuid,
           $1::uuid, $2::uuid, 'ACTIVE', 'LOCATION', $3::uuid, null
         )`,
        [HOUSEHOLD, PRODUCT, location],
      ),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, '23514');
        return true;
      },
    );
  } finally {
    await admin.end();
  }
});
