import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CompartmentId,
  GetCurrentCompartmentUseCase,
  HouseholdId,
  ListCurrentCompartmentsUseCase,
  NotFoundError,
  PrincipalId,
  StorageLocationId,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgCurrentCompartmentReader } from './compartment-read.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('8d5b0101-0b04-4d01-8b04-000000000001');
const OTHER_HOUSEHOLD = HouseholdId('8d5b0202-0b04-4d02-8b04-000000000002');
const MEMBER = PrincipalId('8d5b0303-0b04-4d03-8b04-000000000003');
const MEMBER_MEMBERSHIP = '8d5b0404-0b04-4d04-8b04-000000000004';
const LOCATION = StorageLocationId('8d5b1111-0b04-4d11-8b04-000000000011');
const EMPTY_LOCATION = StorageLocationId('8d5b1212-0b04-4d12-8b04-000000000012');
const RETIRED_LOCATION = StorageLocationId('8d5b1313-0b04-4d13-8b04-000000000013');
const FOREIGN_LOCATION = StorageLocationId('8d5b1414-0b04-4d14-8b04-000000000014');
const FIRST = CompartmentId('8d5b2111-0b04-4d21-8b04-000000000021');
const SECOND = CompartmentId('8d5b2222-0b04-4d22-8b04-000000000022');
const RETIRED = CompartmentId('8d5b2333-0b04-4d23-8b04-000000000023');
const UNDER_RETIRED_PARENT = CompartmentId('8d5b2444-0b04-4d24-8b04-000000000024');
const FOREIGN = CompartmentId('8d5b2555-0b04-4d25-8b04-000000000025');
const LOCATION_KIND = 'BE04_COMP_READ_FRIDGE';
const COMPARTMENT_KIND = 'BE04_COMP_READ_SHELF';

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(
      `insert into fridge.user_profile (user_id, display_name)
       values ($1::uuid, 'BE04 Compartment Read Member')`,
      [MEMBER],
    );
    await pool.query(
      `insert into fridge.household (household_id, display_name)
       values ($1::uuid, 'BE04 Compartment Household'), ($2::uuid, 'BE04 Compartment Foreign Household')`,
      [HOUSEHOLD, OTHER_HOUSEHOLD],
    );
    await pool.query(
      `insert into fridge.household_role (role_code, display_name)
       values ('BE04_COMP_READ_MEMBER', 'BE04 ordinary Compartment read member')`,
    );
    await pool.query(
      `insert into fridge.household_membership (
         membership_id, household_id, user_id, role_code,
         lifecycle_status, effective_from, effective_to
       ) values ($1::uuid, $2::uuid, $3::uuid, 'BE04_COMP_READ_MEMBER', 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [MEMBER_MEMBERSHIP, HOUSEHOLD, MEMBER],
    );
    await pool.query(
      `insert into fridge.storage_location_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 Compartment read fridge', 'ACTIVE')`,
      [LOCATION_KIND],
    );
    await pool.query(
      `insert into fridge.compartment_kind (kind_code, display_name, lifecycle_status)
       values ($1, 'BE04 Compartment read shelf', 'ACTIVE')`,
      [COMPARTMENT_KIND],
    );
    await pool.query(
      `insert into fridge.storage_location (
         storage_location_id, household_id, kind_code, display_name,
         lifecycle_status, sort_order, created_at, retired_at
       ) values
         ($1::uuid, $5::uuid, $7, 'Current parent', 'ACTIVE', 1, clock_timestamp() - interval '4 hours', null),
         ($2::uuid, $5::uuid, $7, 'Empty current parent', 'ACTIVE', 2, clock_timestamp() - interval '3 hours', null),
         ($3::uuid, $5::uuid, $7, 'Retired parent', 'RETIRED', 3, clock_timestamp() - interval '5 hours', clock_timestamp() - interval '1 hour'),
         ($4::uuid, $6::uuid, $7, 'Foreign parent', 'ACTIVE', 1, clock_timestamp() - interval '2 hours', null)`,
      [LOCATION, EMPTY_LOCATION, RETIRED_LOCATION, FOREIGN_LOCATION, HOUSEHOLD, OTHER_HOUSEHOLD, LOCATION_KIND],
    );
    await pool.query(
      `insert into fridge.compartment (
         compartment_id, household_id, storage_location_id, kind_code,
         display_name, sort_order, lifecycle_status, created_at, retired_at
       ) values
         ($1::uuid, $6::uuid, $8::uuid, $10, 'First shelf', 1, 'ACTIVE', clock_timestamp() - interval '3 hours', null),
         ($2::uuid, $6::uuid, $8::uuid, null, 'Null-order shelf', null, 'ACTIVE', clock_timestamp() - interval '2 hours', null),
         ($3::uuid, $6::uuid, $8::uuid, $10, 'Retired shelf', 0, 'RETIRED', clock_timestamp() - interval '4 hours', clock_timestamp() - interval '1 hour'),
         ($4::uuid, $6::uuid, $9::uuid, $10, 'Child under retired parent', 1, 'ACTIVE', clock_timestamp() - interval '2 hours', null),
         ($5::uuid, $7::uuid, $11::uuid, $10, 'Foreign shelf', 1, 'ACTIVE', clock_timestamp() - interval '1 hour', null)`,
      [FIRST, SECOND, RETIRED, UNDER_RETIRED_PARENT, FOREIGN, HOUSEHOLD, OTHER_HOUSEHOLD, LOCATION, RETIRED_LOCATION, COMPARTMENT_KIND, FOREIGN_LOCATION],
    );
  } finally {
    await pool.end();
  }
}

await seedFixture();

test('ordinary current member lists current Compartments under a current parent with stable ordering', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const result = await new ListCurrentCompartmentsUseCase(
      database,
      new PgCurrentCompartmentReader(),
    ).execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, storageLocationId: LOCATION });

    assert.deepEqual(result.compartments.map((compartment) => compartment.compartmentId), [FIRST, SECOND]);
    assert.equal(result.compartments[0]?.kindCode, COMPARTMENT_KIND);
    assert.equal(result.compartments[1]?.kindCode, null);
    assert.equal(result.compartments[1]?.sortOrder, null);
  } finally {
    await database.close();
  }
});

test('authorized current parent with no current Compartments returns an empty list', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  try {
    const result = await new ListCurrentCompartmentsUseCase(
      database,
      new PgCurrentCompartmentReader(),
    ).execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, storageLocationId: EMPTY_LOCATION });
    assert.deepEqual(result.compartments, []);
  } finally {
    await database.close();
  }
});

test('Compartment list collapses retired, foreign and missing parents to NOT_FOUND', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new ListCurrentCompartmentsUseCase(database, new PgCurrentCompartmentReader());
  try {
    for (const parent of [
      RETIRED_LOCATION,
      FOREIGN_LOCATION,
      StorageLocationId('8d5b1515-0b04-4d15-8b04-000000000015'),
    ]) {
      await assert.rejects(
        useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, storageLocationId: parent }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('GetCurrentCompartment requires both child and parent to be current and collapses hidden states', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const useCase = new GetCurrentCompartmentUseCase(database, new PgCurrentCompartmentReader());
  try {
    const found = await useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, compartmentId: FIRST });
    assert.equal(found.compartment.compartmentId, FIRST);
    assert.equal(found.compartment.storageLocationId, LOCATION);

    for (const target of [
      RETIRED,
      UNDER_RETIRED_PARENT,
      FOREIGN,
      CompartmentId('8d5b2666-0b04-4d26-8b04-000000000026'),
    ]) {
      await assert.rejects(
        useCase.execute({ actorPrincipalId: MEMBER, householdId: HOUSEHOLD, compartmentId: target }),
        NotFoundError,
      );
    }
  } finally {
    await database.close();
  }
});

test('Compartment read boundary revalidates exact membership after transaction authorization', async () => {
  const database = new PgDatabase({ connectionString: DATABASE_URL, capabilityRole: 'fridge_app' });
  const adminPool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  const reader = new PgCurrentCompartmentReader();
  try {
    await assert.rejects(
      database.withAuthorizedHouseholdTransaction(MEMBER, HOUSEHOLD, async (transaction) => {
        await adminPool.query(
          `update fridge.household_membership
              set lifecycle_status = 'ENDED', effective_to = clock_timestamp()
            where membership_id = $1::uuid`,
          [MEMBER_MEMBERSHIP],
        );
        await reader.listCurrentCompartments(transaction, LOCATION);
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
