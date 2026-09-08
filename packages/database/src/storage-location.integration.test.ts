import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CreateStorageLocationUseCase,
  HouseholdId,
  IdempotencyConflictError,
  InvalidInputError,
  PrincipalId,
  StorageLocationId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdStorageAdministrationTransactionManager } from './storage-administration.js';
import { PgStorageLocationWriter } from './storage-location.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('BE00_TEST_DATABASE_URL is required for storage location integration tests');
}
if (!ADMIN_DATABASE_URL) {
  throw new Error('DATABASE_URL is required for storage location integration tests');
}

const HOUSEHOLD = HouseholdId('f4c40101-0b04-4c01-8b04-000000000001');
const ADMIN = PrincipalId('f4c40202-0b04-4c02-8b04-000000000002');
const ORDINARY = PrincipalId('f4c40303-0b04-4c03-8b04-000000000003');
const ADMIN_MEMBERSHIP = 'f4c40404-0b04-4c04-8b04-000000000004';
const ORDINARY_MEMBERSHIP = 'f4c40505-0b04-4c05-8b04-000000000005';
const ACTIVE_KIND = 'BE04_TEST_FRIDGE';
const RETIRED_KIND = 'BE04_TEST_RETIRED_KIND';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Create Admin'), ($2::uuid, 'BE04 Create Ordinary')`,
      [ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Create Household')`,
      [HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values
         ('BE04_CREATE_ADMIN', 'BE04 CreateStorageLocation administrator'),
         ('BE04_CREATE_MEMBER', 'BE04 CreateStorageLocation ordinary member')`,
    );
    await pool.query(
      `insert into fridge.household_role_capability (role_code, capability_code)
       values ('BE04_CREATE_ADMIN', 'HOUSEHOLD_STORAGE_ADMINISTER')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $4::uuid, 'BE04_CREATE_ADMIN', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $3::uuid, $5::uuid, 'BE04_CREATE_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [ADMIN_MEMBERSHIP, ORDINARY_MEMBERSHIP, HOUSEHOLD, ADMIN, ORDINARY],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values
         ($1, 'BE04 test fridge', 'ACTIVE'),
         ($2, 'BE04 retired kind', 'RETIRED')`,
      [ACTIVE_KIND, RETIRED_KIND],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

function createUseCase(database: PgDatabase): CreateStorageLocationUseCase {
  return new CreateStorageLocationUseCase(
    new PgHouseholdStorageAdministrationTransactionManager(database),
    new PgStorageLocationWriter(),
  );
}

test('governed administrator creates a Household-owned StorageLocation with durable command provenance', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('f4c41111-0b04-4c11-8b04-000000000011');
  const candidateId = StorageLocationId('f4c41212-0b04-4c12-8b04-000000000012');

  try {
    const result = await createUseCase(database).execute({
      commandId,
      candidateStorageLocationId: candidateId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      kindCode: ACTIVE_KIND,
      displayName: 'Kitchen fridge',
      sortOrder: 7,
    });
    assert.equal(result.storageLocationId, candidateId);

    const observed = await adminPool.query<{
      household_id: string;
      kind_code: string;
      display_name: string;
      lifecycle_status: string;
      sort_order: number | null;
      actor_user_id: string;
      outcome_code: string;
    }>(
      `select sl.household_id::text,
              sl.kind_code,
              sl.display_name,
              sl.lifecycle_status,
              sl.sort_order,
              c.actor_user_id::text,
              c.outcome_code
         from fridge.storage_location sl
         join fridge.storage_location_create_command c
           on c.result_storage_location_id = sl.storage_location_id
        where sl.storage_location_id = $1::uuid`,
      [candidateId],
    );

    assert.deepEqual(observed.rows[0], {
      household_id: HOUSEHOLD,
      kind_code: ACTIVE_KIND,
      display_name: 'Kitchen fridge',
      lifecycle_status: 'ACTIVE',
      sort_order: 7,
      actor_user_id: ADMIN,
      outcome_code: 'CREATED',
    });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('committed replay returns the original identity without allocating or reapplying', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('f4c42121-0b04-4c21-8b04-000000000021');
  const candidateId = StorageLocationId('f4c42222-0b04-4c22-8b04-000000000022');
  const input = {
    commandId,
    candidateStorageLocationId: candidateId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    kindCode: ACTIVE_KIND,
    displayName: 'Garage fridge',
    sortOrder: null,
  } as const;

  try {
    const first = await createUseCase(database).execute(input);
    const second = await createUseCase(database).execute(input);
    assert.equal(first.storageLocationId, candidateId);
    assert.equal(second.storageLocationId, candidateId);

    const count = await adminPool.query<{ count: string }>(
      `select count(*)::text as count
         from fridge.storage_location
        where storage_location_id = $1::uuid`,
      [candidateId],
    );
    assert.equal(count.rows[0]?.count, '1');
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('CommandId reuse with different candidate or facts is an idempotency conflict', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const commandId = CommandId('f4c43131-0b04-4c31-8b04-000000000031');
  const candidateId = StorageLocationId('f4c43232-0b04-4c32-8b04-000000000032');

  try {
    await createUseCase(database).execute({
      commandId,
      candidateStorageLocationId: candidateId,
      actorPrincipalId: ADMIN,
      householdId: HOUSEHOLD,
      kindCode: ACTIVE_KIND,
      displayName: 'Pantry fridge',
      sortOrder: 1,
    });

    await assert.rejects(
      createUseCase(database).execute({
        commandId,
        candidateStorageLocationId: StorageLocationId('f4c43333-0b04-4c33-8b04-000000000033'),
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        kindCode: ACTIVE_KIND,
        displayName: 'Pantry fridge renamed',
        sortOrder: 1,
      }),
      IdempotencyConflictError,
    );
  } finally {
    await database.close();
  }
});

test('new create rejects inactive governed kind without durable command or resource', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('f4c44141-0b04-4c41-8b04-000000000041');
  const candidateId = StorageLocationId('f4c44242-0b04-4c42-8b04-000000000042');

  try {
    await assert.rejects(
      createUseCase(database).execute({
        commandId,
        candidateStorageLocationId: candidateId,
        actorPrincipalId: ADMIN,
        householdId: HOUSEHOLD,
        kindCode: RETIRED_KIND,
        displayName: 'Invalid fridge',
        sortOrder: null,
      }),
      InvalidInputError,
    );

    const counts = await adminPool.query<{ commands: string; locations: string }>(
      `select
         (select count(*) from fridge.storage_location_create_command where household_id = $1::uuid and command_id = $2::uuid)::text as commands,
         (select count(*) from fridge.storage_location where storage_location_id = $3::uuid)::text as locations`,
      [HOUSEHOLD, commandId, candidateId],
    );
    assert.deepEqual(counts.rows[0], { commands: '0', locations: '0' });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('committed replay after later retirement never resurrects the StorageLocation', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('f4c45151-0b04-4c51-8b04-000000000051');
  const candidateId = StorageLocationId('f4c45252-0b04-4c52-8b04-000000000052');
  const input = {
    commandId,
    candidateStorageLocationId: candidateId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    kindCode: ACTIVE_KIND,
    displayName: 'Basement fridge',
    sortOrder: 3,
  } as const;

  try {
    await createUseCase(database).execute(input);
    await adminPool.query(
      `update fridge.storage_location
          set lifecycle_status = 'RETIRED', retired_at = clock_timestamp()
        where storage_location_id = $1::uuid`,
      [candidateId],
    );
    await adminPool.query(
      `update fridge.storage_location_kind
          set lifecycle_status = 'RETIRED'
        where kind_code = $1`,
      [ACTIVE_KIND],
    );

    const replay = await createUseCase(database).execute(input);
    assert.equal(replay.storageLocationId, candidateId);

    const observed = await adminPool.query<{ lifecycle_status: string; retired: boolean }>(
      `select lifecycle_status, retired_at is not null as retired
         from fridge.storage_location
        where storage_location_id = $1::uuid`,
      [candidateId],
    );
    assert.deepEqual(observed.rows[0], { lifecycle_status: 'RETIRED', retired: true });
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('two retries of the same create command converge on one durable StorageLocation', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app', maxConnections: 2 });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const commandId = CommandId('f4c46161-0b04-4c61-8b04-000000000061');
  const candidateId = StorageLocationId('f4c46262-0b04-4c62-8b04-000000000062');
  const input = {
    commandId,
    candidateStorageLocationId: candidateId,
    actorPrincipalId: ADMIN,
    householdId: HOUSEHOLD,
    kindCode: RETIRED_KIND,
    displayName: 'Concurrent fridge',
    sortOrder: 9,
  } as const;

  try {
    await adminPool.query(
      `update fridge.storage_location_kind set lifecycle_status = 'ACTIVE' where kind_code = $1`,
      [RETIRED_KIND],
    );

    const [first, second] = await Promise.all([
      createUseCase(database).execute(input),
      createUseCase(database).execute(input),
    ]);
    assert.equal(first.storageLocationId, candidateId);
    assert.equal(second.storageLocationId, candidateId);

    const count = await adminPool.query<{ count: string }>(
      `select count(*)::text as count from fridge.storage_location where storage_location_id = $1::uuid`,
      [candidateId],
    );
    assert.equal(count.rows[0]?.count, '1');
  } finally {
    await adminPool.end();
    await database.close();
  }
});

test('ordinary current member cannot create StorageLocation', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    await assert.rejects(
      createUseCase(database).execute({
        commandId: CommandId('f4c47171-0b04-4c71-8b04-000000000071'),
        candidateStorageLocationId: StorageLocationId('f4c47272-0b04-4c72-8b04-000000000072'),
        actorPrincipalId: ORDINARY,
        householdId: HOUSEHOLD,
        kindCode: RETIRED_KIND,
        displayName: 'Forbidden fridge',
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
