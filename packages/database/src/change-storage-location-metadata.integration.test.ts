import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  ChangeStorageLocationMetadataUseCase,
  CommandId,
  HouseholdId,
  IdempotencyConflictError,
  InvalidInputError,
  NotFoundError,
  PrincipalId,
  StorageLocationId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';
import { PgStorageLocationMetadataChanger } from './change-storage-location-metadata.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('f4e40101-0b04-4e01-8b04-000000000001');
const OTHER_HOUSEHOLD = HouseholdId('f4e40101-0b04-4e01-8b04-000000000002');
const ADMIN = PrincipalId('f4e40202-0b04-4e02-8b04-000000000002');
const MEMBER = PrincipalId('f4e40202-0b04-4e02-8b04-000000000003');
const ADMIN_MEMBERSHIP = 'f4e40303-0b04-4e03-8b04-000000000003';
const MEMBER_MEMBERSHIP = 'f4e40303-0b04-4e03-8b04-000000000004';
const ACTIVE_KIND = 'BE04_CHANGE_ACTIVE';
const OTHER_KIND = 'BE04_CHANGE_OTHER';
const RETIRED_KIND = 'BE04_CHANGE_RETIRED';

const LOCATION_SUCCESS = StorageLocationId('f4e41010-0b04-4e10-8b04-000000000010');
const LOCATION_REPLAY = StorageLocationId('f4e41010-0b04-4e10-8b04-000000000011');
const LOCATION_CONFLICT = StorageLocationId('f4e41010-0b04-4e10-8b04-000000000012');
const LOCATION_RETIRED = StorageLocationId('f4e41010-0b04-4e10-8b04-000000000013');
const LOCATION_CONCURRENT = StorageLocationId('f4e41010-0b04-4e10-8b04-000000000014');
const LOCATION_FOREIGN = StorageLocationId('f4e41010-0b04-4e10-8b04-000000000015');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Change Admin'), ($2::uuid, 'BE04 Change Member')`,
      [ADMIN, MEMBER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Change Household'), ($2::uuid, 'BE04 Other Household')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values
         ('BE04_CHANGE_ADMIN', 'BE04 Change administrator'),
         ('BE04_CHANGE_MEMBER', 'BE04 Change member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_CHANGE_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_CHANGE_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_CHANGE_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, MEMBER_MEMBERSHIP, HOUSEHOLD, ADMIN, MEMBER],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values
         ($1, 'Active kind', 'ACTIVE'),
         ($2, 'Other active kind', 'ACTIVE'),
         ($3, 'Retired kind', 'RETIRED')`,
      [ACTIVE_KIND, OTHER_KIND, RETIRED_KIND],
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name,
         lifecycle_status, sort_order, created_at, retired_at
       ) values
         ($1::uuid, $7::uuid, $9, 'Success target', 'ACTIVE', 1, clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $7::uuid, $9, 'Replay target', 'ACTIVE', 2, clock_timestamp() - interval '1 hour', null),
         ($3::uuid, $7::uuid, $9, 'Conflict target', 'ACTIVE', 3, clock_timestamp() - interval '1 hour', null),
         ($4::uuid, $7::uuid, $9, 'Retired target', 'RETIRED', 4, clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour'),
         ($5::uuid, $7::uuid, $9, 'Concurrent target', 'ACTIVE', 5, clock_timestamp() - interval '1 hour', null),
         ($6::uuid, $8::uuid, $9, 'Foreign target', 'ACTIVE', 6, clock_timestamp() - interval '1 hour', null)`,
      [
        LOCATION_SUCCESS,
        LOCATION_REPLAY,
        LOCATION_CONFLICT,
        LOCATION_RETIRED,
        LOCATION_CONCURRENT,
        LOCATION_FOREIGN,
        HOUSEHOLD,
        OTHER_HOUSEHOLD,
        ACTIVE_KIND,
      ],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function useCase(database: PgDatabase): ChangeStorageLocationMetadataUseCase {
  return new ChangeStorageLocationMetadataUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgStorageLocationMetadataChanger(),
  );
}

test('governed administrator changes mutable metadata without changing identity or Household', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const result = await useCase(database).execute({
      commandId: CommandId('f4e42020-0b04-4e20-8b04-000000000020'),
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: LOCATION_SUCCESS,
      kindCode: OTHER_KIND,
      displayName: 'Renamed success target',
      sortOrder: 99,
    });
    assert.equal(result.storageLocationId, LOCATION_SUCCESS);

    const observed = await adminPool.query<{
      household_id: string;
      storage_location_id: string;
      kind_code: string;
      display_name: string;
      sort_order: number | null;
      actor_user_id: string;
    }>(
      `select sl.household_id::text,
              sl.storage_location_id::text,
              sl.kind_code,
              sl.display_name,
              sl.sort_order,
              c.actor_user_id::text
         from fridge.storage_location sl
         join fridge.storage_location_metadata_change_command c
           on c.household_id = sl.household_id
          and c.storage_location_id = sl.storage_location_id
        where sl.storage_location_id = $1::uuid`,
      [LOCATION_SUCCESS],
    );
    assert.deepEqual(observed.rows[0], {
      household_id: HOUSEHOLD,
      storage_location_id: LOCATION_SUCCESS,
      kind_code: OTHER_KIND,
      display_name: 'Renamed success target',
      sort_order: 99,
      actor_user_id: ADMIN,
    });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('committed replay after later mutation and retirement never restores older metadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const input = {
    commandId: CommandId('f4e42121-0b04-4e21-8b04-000000000021'),
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    storageLocationId: LOCATION_REPLAY,
    kindCode: OTHER_KIND,
    displayName: 'Committed metadata',
    sortOrder: 11,
  } as const;

  try {
    await useCase(database).execute(input);
    await adminPool.query(
      `update fridge.storage_location
          set display_name = 'Later metadata', sort_order = 55,
              lifecycle_status = 'RETIRED', retired_at = clock_timestamp()
        where storage_location_id = $1::uuid`,
      [LOCATION_REPLAY],
    );

    const replay = await useCase(database).execute(input);
    assert.equal(replay.storageLocationId, LOCATION_REPLAY);

    const observed = await adminPool.query<{ display_name: string; sort_order: number; lifecycle_status: string }>(
      `select display_name, sort_order, lifecycle_status
         from fridge.storage_location
        where storage_location_id = $1::uuid`,
      [LOCATION_REPLAY],
    );
    assert.deepEqual(observed.rows[0], {
      display_name: 'Later metadata',
      sort_order: 55,
      lifecycle_status: 'RETIRED',
    });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('CommandId reuse with different semantic facts is an idempotency conflict', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('f4e42222-0b04-4e22-8b04-000000000022');
  try {
    await useCase(database).execute({
      commandId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      storageLocationId: LOCATION_CONFLICT,
      kindCode: OTHER_KIND,
      displayName: 'First facts',
      sortOrder: 12,
    });

    await assert.rejects(
      useCase(database).execute({
        commandId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: LOCATION_CONFLICT,
        kindCode: OTHER_KIND,
        displayName: 'Different facts',
        sortOrder: 12,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('new mutation rejects inactive governed kind', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database).execute({
        commandId: CommandId('f4e42323-0b04-4e23-8b04-000000000023'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        storageLocationId: LOCATION_CONFLICT,
        kindCode: RETIRED_KIND,
        displayName: 'Should fail',
        sortOrder: null,
      }),
      InvalidInputError,
    );
  } finally {
    await database.close();
  }
});

test('missing, foreign-Household and retired targets collapse to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const targets = [
    StorageLocationId('f4e49999-0b04-4e99-8b04-000000000099'),
    LOCATION_FOREIGN,
    LOCATION_RETIRED,
  ];
  try {
    for (let index = 0; index < targets.length; index += 1) {
      await assert.rejects(
        useCase(database).execute({
          commandId: CommandId(`f4e4242${index}-0b04-4e24-8b04-00000000002${index}`),
          actorPrincipalId: ADMIN,
          householdId: HOUSEHOLD,
          storageLocationId: targets[index]!,
          kindCode: ACTIVE_KIND,
          displayName: 'Hidden target',
          sortOrder: null,
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('identical concurrent retries converge on one committed metadata outcome', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app', maxConnections: 2 });
  const input = {
    commandId: CommandId('f4e42525-0b04-4e25-8b04-000000000025'),
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    storageLocationId: LOCATION_CONCURRENT,
    kindCode: OTHER_KIND,
    displayName: 'Concurrent metadata',
    sortOrder: 25,
  } as const;
  try {
    const [first, second] = await Promise.all([
      useCase(database).execute(input),
      useCase(database).execute(input),
    ]);
    assert.equal(first.storageLocationId, LOCATION_CONCURRENT);
    assert.equal(second.storageLocationId, LOCATION_CONCURRENT);
  } finally {
    await database.close();
  }
});

test('ordinary member cannot change StorageLocation metadata', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      useCase(database).execute({
        commandId: CommandId('f4e42626-0b04-4e26-8b04-000000000026'),
        actorPrincipalId: MEMBER,
        householdId: HOUSEHOLD,
        storageLocationId: LOCATION_CONCURRENT,
        kindCode: ACTIVE_KIND,
        displayName: 'Forbidden metadata',
        sortOrder: null,
      }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'HOUSEHOLD_UNAUTHORIZED');
        return true;
      },
    );
  } finally {
    await database.close();
  }
});
