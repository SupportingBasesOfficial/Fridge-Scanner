import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  GetCurrentStorageLocationUseCase,
  HouseholdId,
  ListCurrentStorageLocationsUseCase,
  NotFoundError,
  PrincipalId,
  StorageLocationId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgCurrentStorageLocationReader } from './storage-location-read.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('7c4a0101-0b04-4c01-8b04-000000000001');
const OTHER_HOUSEHOLD = HouseholdId('7c4a0202-0b04-4c02-8b04-000000000002');
const EMPTY_HOUSEHOLD = HouseholdId('7c4a0606-0b04-4c06-8b04-000000000006');
const MEMBER = PrincipalId('7c4a0303-0b04-4c03-8b04-000000000003');
const MEMBER_MEMBERSHIP = '7c4a0404-0b04-4c04-8b04-000000000004';
const EMPTY_MEMBERSHIP = '7c4a0707-0b04-4c07-8b04-000000000007';
const KIND = 'BE04_READ_FRIDGE';
const FIRST = StorageLocationId('7c4a1111-0b04-4c11-8b04-000000000011');
const SECOND = StorageLocationId('7c4a1212-0b04-4c12-8b04-000000000012');
const RETIRED = StorageLocationId('7c4a1313-0b04-4c13-8b04-000000000013');
const FOREIGN = StorageLocationId('7c4a1414-0b04-4c14-8b04-000000000014');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Read Member')`,
      [MEMBER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Read Household'),
              ($2::uuid, 'BE04 Foreign Household'),
              ($3::uuid, 'BE04 Empty Household')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD, EMPTY_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_READ_MEMBER', 'BE04 ordinary read member')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values
         ($1::uuid, $3::uuid, $5::uuid, 'BE04_READ_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null),
         ($2::uuid, $4::uuid, $5::uuid, 'BE04_READ_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBER_MEMBERSHIP, EMPTY_MEMBERSHIP, HOUSEHOLD, EMPTY_HOUSEHOLD, MEMBER],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 read fridge', 'ACTIVE')`,
      [KIND],
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name,
         lifecycle_status, sort_order, created_at, retired_at
       ) values
         ($1::uuid, $5::uuid, $7, 'Null-order location', 'ACTIVE', null, clock_timestamp() - interval '3 hours', null),
         ($2::uuid, $5::uuid, $7, 'First location', 'ACTIVE', 1, clock_timestamp() - interval '2 hours', null),
         ($3::uuid, $5::uuid, $7, 'Retired location', 'RETIRED', 0, clock_timestamp() - interval '4 hours', clock_timestamp() - interval '1 hour'),
         ($4::uuid, $6::uuid, $7, 'Foreign location', 'ACTIVE', 0, clock_timestamp() - interval '1 hour', null)`,
      [SECOND, FIRST, RETIRED, FOREIGN, HOUSEHOLD, OTHER_HOUSEHOLD, KIND],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('ordinary current member lists current StorageLocations with stable ordering only inside the Household', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const result = await new ListCurrentStorageLocationsUseCase(
      database,
      new PgCurrentStorageLocationReader(),
    ).execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD });

    assert.deepEqual(
      result.storageLocations.map((location) => location.storageLocationId),
      [FIRST, SECOND],
    );
    assert.equal(result.storageLocations[0]?.displayName, 'First location');
    assert.equal(result.storageLocations[1]?.sortOrder, null);
  } finally {
    await database.close();
  }
});

test('authorized Household with no current StorageLocations returns an empty list', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const result = await new ListCurrentStorageLocationsUseCase(
      database,
      new PgCurrentStorageLocationReader(),
    ).execute({ actorPrincipalId: MEMBER, householdId: EMPTY_HOUSEHOLD });

    assert.deepEqual(result.storageLocations, []);
  } finally {
    await database.close();
  }
});

test('GetCurrentStorageLocation collapses missing, foreign and retired targets to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new GetCurrentStorageLocationUseCase(
    database,
    new PgCurrentStorageLocationReader(),
  );
  try {
    const found = await useCase.execute({
      actorPrincipalId: MEMBER,
      householdId: HOUSEHOLD,
      storageLocationId: FIRST,
    });
    assert.equal(found.storageLocation.storageLocationId, FIRST);

    for (const target of [RETIRED, FOREIGN, StorageLocationId('7c4a1515-0b04-4c15-8b04-000000000015')]) {
      await assert.rejects(
        useCase.execute({
          actorPrincipalId: MEMBER,
          householdId: HOUSEHOLD,
          storageLocationId: target,
        }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('read boundary revalidates exact membership after transaction authorization', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const reader = new PgCurrentStorageLocationReader();
  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(MEMBER, HOUSEHOLD, async (transaction) => {
        await adminPool.query(
          `update fridge.household_membership
              set lifecycle_status = 'ENDED', effective_to = clock_timestamp()
            where membership_id = $1::uuid`,
          [MEMBER_MEMBERSHIP],
        );
        await reader.listCurrentStorageLocations(transaction);
      }),
      (error: unknown) => (error as { code?: string }).code === 'HOUSEHOLD_UNAUTHORIZED',
    );
  } finally {
    await adminPool.query(
      `update fridge.household_membership
          set lifecycle_status = 'ACTIVE', effective_to = null
        where membership_id = $1::uuid`,
      [MEMBER_MEMBERSHIP],
    );
    await adminPool.end();
    await database.close();
  }
});
