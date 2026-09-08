import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  ConflictError,
  HouseholdId,
  IdempotencyConflictError,
  NotFoundError,
  PrincipalId,
  RetireStorageLocationUseCase,
  StorageLocationId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgStorageLocationRetirer } from './retire-storage-location.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('9f7e0101-0b04-4e01-8b04-000000000001');
const FOREIGN_HOUSEHOLD = HouseholdId('9f7e0101-0b04-4e01-8b04-000000000099');
const ADMIN = PrincipalId('9f7e0202-0b04-4e02-8b04-000000000002');
const ORDINARY = PrincipalId('9f7e0303-0b04-4e03-8b04-000000000003');
const ADMIN_MEMBERSHIP = '9f7e0404-0b04-4e04-8b04-000000000004';
const ORDINARY_MEMBERSHIP = '9f7e0505-0b04-4e05-8b04-000000000005';
const KIND = 'BE04_RETIRE_FRIDGE';
const PRODUCT = '9f7e0606-0b04-4e06-8b04-000000000006';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Retire Admin'), ($2::uuid, 'BE04 Retire Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Retire Household'), ($2::uuid, 'BE04 Retire Foreign Household')`,
      [HOUSEHOLD, FOREIGN_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_RETIRE_ADMIN', 'BE04 retire administrator'),
              ('BE04_RETIRE_MEMBER', 'BE04 retire ordinary member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_RETIRE_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_RETIRE_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_RETIRE_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 retirement fridge', 'ACTIVE')`,
      [KIND],
    );
    await pool.query(
      `insert into fridge.product (product_id, catalog_scope, owner_household_id, canonical_name, lifecycle_status)
       values ($1::uuid, 'GLOBAL', null, 'BE04 retirement stock fixture', 'ACTIVE')`,
      [PRODUCT],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

async function seedLocation(
  pool: Pool,
  id: StorageLocationId,
  householdId: HouseholdId = HOUSEHOLD,
  lifecycleStatus = 'ACTIVE',
): Promise<void> {
  await pool.query(
    `insert into fridge.storage_location (
       storage_location_id, household_id, kind_code, display_name,
       lifecycle_status, created_at, retired_at
     ) values (
       $1::uuid, $2::uuid, $3, $4, $5,
       clock_timestamp() - interval '1 hour',
       case when $5 = 'RETIRED' then clock_timestamp() - interval '1 minute' else null end
     )`,
    [id, householdId, KIND, `Location ${id}`, lifecycleStatus],
  );
}

function createUseCase(database: PgDatabase): RetireStorageLocationUseCase {
  return new RetireStorageLocationUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgStorageLocationRetirer(),
  );
}

test('governed retirement records post-lock lifecycle state and durable actor provenance', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const location = StorageLocationId('9f7e1111-0b04-4e11-8b04-000000000011');
  const command = CommandId('9f7e1212-0b04-4e12-8b04-000000000012');
  try {
    await seedLocation(admin, location);
    const result = await createUseCase(database).execute({
      commandId: command,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: location,
    });
    assert.equal(result.storageLocationId, location);

    const observed = await admin.query<{
      lifecycle_status: string;
      retired: boolean;
      same_retired_at: boolean;
      actor_user_id: string;
    }>(
      `select sl.lifecycle_status,
              sl.retired_at is not null as retired,
              sl.retired_at = c.retired_at as same_retired_at,
              c.actor_user_id::text
         from fridge.storage_location sl
         join fridge.storage_location_retire_command c
           on c.household_id = sl.household_id
          and c.storage_location_id = sl.storage_location_id
        where sl.storage_location_id = $1::uuid
          and c.command_id = $2::uuid`,
      [location, command],
    );
    assert.deepEqual(observed.rows[0], {
      lifecycle_status: 'RETIRED',
      retired: true,
      same_retired_at: true,
      actor_user_id: ADMIN,
    });
  } finally {
    await admin.end();
    await database.close();
  }
});

test('committed replay succeeds without reapplying or restoring the retired StorageLocation', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const location = StorageLocationId('9f7e2121-0b04-4e21-8b04-000000000021');
  const command = CommandId('9f7e2222-0b04-4e22-8b04-000000000022');
  const input = { commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, storageLocationId: location } as const;
  try {
    await seedLocation(admin, location);
    await createUseCase(database).execute(input);
    await admin.query(`update fridge.storage_location set display_name = 'Historical correction marker' where storage_location_id = $1::uuid`, [location]);
    const replay = await createUseCase(database).execute(input);
    assert.equal(replay.storageLocationId, location);
    const observed = await admin.query<{ display_name: string; lifecycle_status: string }>(
      `select display_name, lifecycle_status from fridge.storage_location where storage_location_id = $1::uuid`,
      [location],
    );
    assert.deepEqual(observed.rows[0], { display_name: 'Historical correction marker', lifecycle_status: 'RETIRED' });
  } finally {
    await admin.end();
    await database.close();
  }
});

test('active child Compartment blocks parent StorageLocation retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const location = StorageLocationId('9f7e3131-0b04-4e31-8b04-000000000031');
  try {
    await seedLocation(admin, location);
    await admin.query(
      `insert into fridge.compartment (compartment_id, household_id, storage_location_id, display_name, lifecycle_status)
       values ('9f7e3232-0b04-4e32-8b04-000000000032'::uuid, $1::uuid, $2::uuid, 'Active child', 'ACTIVE')`,
      [HOUSEHOLD, location],
    );
    await assert.rejects(
      createUseCase(database).execute({
        commandId: CommandId('9f7e3333-0b04-4e33-8b04-000000000033'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: location,
      }),
      ConflictError,
    );
  } finally {
    await admin.end();
    await database.close();
  }
});

test('current stock directly in the StorageLocation blocks retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const location = StorageLocationId('9f7e4141-0b04-4e41-8b04-000000000041');
  try {
    await seedLocation(admin, location);
    await admin.query(
      `insert into fridge.stock_item (
         stock_item_id, household_id, product_id, lifecycle_status,
         placement_anchor_kind, storage_location_id, compartment_id
       ) values (
         '9f7e4242-0b04-4e42-8b04-000000000042'::uuid,
         $1::uuid, $2::uuid, 'ACTIVE', 'LOCATION', $3::uuid, null
       )`,
      [HOUSEHOLD, PRODUCT, location],
    );
    await assert.rejects(
      createUseCase(database).execute({
        commandId: CommandId('9f7e4343-0b04-4e43-8b04-000000000043'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: location,
      }),
      ConflictError,
    );
  } finally {
    await admin.end();
    await database.close();
  }
});

test('legacy current stock in a retired child Compartment still blocks parent retirement', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const location = StorageLocationId('9f7e5151-0b04-4e51-8b04-000000000051');
  const compartment = '9f7e5252-0b04-4e52-8b04-000000000052';
  try {
    await seedLocation(admin, location);
    await admin.query(
      `insert into fridge.compartment (
         compartment_id, household_id, storage_location_id, display_name,
         lifecycle_status, created_at, retired_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'Retired child', 'RETIRED',
         clock_timestamp() - interval '1 hour', clock_timestamp() - interval '1 minute'
       )`,
      [compartment, HOUSEHOLD, location],
    );

    // The current-stock topology guard now prevents this state through every
    // ordinary write path. Disable only that guard while seeding a deliberately
    // legacy/corrupted fixture so RetireStorageLocation keeps proving defensive
    // stock-safety if such pre-hardening data exists. Canonical FKs remain active.
    await admin.query(
      `alter table fridge.stock_item disable trigger stock_item_current_topology_guard`,
    );
    try {
      await admin.query(
        `insert into fridge.stock_item (
           stock_item_id, household_id, product_id, lifecycle_status,
           placement_anchor_kind, storage_location_id, compartment_id
         ) values (
           '9f7e5353-0b04-4e53-8b04-000000000053'::uuid,
           $1::uuid, $2::uuid, 'ACTIVE', 'COMPARTMENT', null, $3::uuid
         )`,
        [HOUSEHOLD, PRODUCT, compartment],
      );
    } finally {
      await admin.query(
        `alter table fridge.stock_item enable trigger stock_item_current_topology_guard`,
      );
    }

    await assert.rejects(
      createUseCase(database).execute({
        commandId: CommandId('9f7e5454-0b04-4e54-8b04-000000000054'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: location,
      }),
      ConflictError,
    );
  } finally {
    await admin.end();
    await database.close();
  }
});

test('hidden target states collapse to NOT_FOUND and divergent CommandId reuse conflicts', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const retired = StorageLocationId('9f7e6161-0b04-4e61-8b04-000000000061');
  const foreign = StorageLocationId('9f7e6262-0b04-4e62-8b04-000000000062');
  const first = StorageLocationId('9f7e6363-0b04-4e63-8b04-000000000063');
  const second = StorageLocationId('9f7e6464-0b04-4e64-8b04-000000000064');
  const command = CommandId('9f7e6565-0b04-4e65-8b04-000000000065');
  try {
    await seedLocation(admin, retired, HOUSEHOLD, 'RETIRED');
    await seedLocation(admin, foreign, FOREIGN_HOUSEHOLD);
    await seedLocation(admin, first);
    await seedLocation(admin, second);

    for (const target of [
      retired,
      foreign,
      StorageLocationId('9f7e6666-0b04-4e66-8b04-000000000066'),
    ]) {
      await assert.rejects(
        createUseCase(database).execute({
          commandId: CommandId(`9f7e6767-0b04-4e67-8b04-${target.slice(-12)}`),
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          storageLocationId: target,
        }),
        NotFoundError,
      );
    }

    await createUseCase(database).execute({ commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, storageLocationId: first });
    await assert.rejects(
      createUseCase(database).execute({ commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, storageLocationId: second }),
      IdempotencyConflictError,
    );
  } finally {
    await admin.end();
    await database.close();
  }
});

test('ordinary member is denied and identical concurrent retries converge on one retirement command', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app', maxConnections: 2 });
  const admin = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const denied = StorageLocationId('9f7e7171-0b04-4e71-8b04-000000000071');
  const concurrent = StorageLocationId('9f7e7272-0b04-4e72-8b04-000000000072');
  const command = CommandId('9f7e7373-0b04-4e73-8b04-000000000073');
  try {
    await seedLocation(admin, denied);
    await seedLocation(admin, concurrent);
    await assert.rejects(
      createUseCase(database).execute({
        commandId: CommandId('9f7e7474-0b04-4e74-8b04-000000000074'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        storageLocationId: denied,
      }),
      (error: unknown) => (error as { code?: string }).code === 'HOUSEHOLD_UNAUTHORIZED',
    );

    const input = { commandId: command, actorPrincipalId: ADMIN, householdId: HOUSEHOLD, storageLocationId: concurrent } as const;
    const [a, b] = await Promise.all([
      createUseCase(database).execute(input),
      createUseCase(database).execute(input),
    ]);
    assert.equal(a.storageLocationId, concurrent);
    assert.equal(b.storageLocationId, concurrent);

    const count = await admin.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.storage_location_retire_command
        where household_id = $1::uuid and command_id = $2::uuid`,
      [HOUSEHOLD, command],
    );
    assert.equal(count.rows[0]?.count, '1');
  } finally {
    await admin.end();
    await database.close();
  }
});