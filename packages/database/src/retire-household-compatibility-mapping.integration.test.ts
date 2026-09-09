import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  ConflictError,
  CreateHouseholdCompatibilityMappingUseCase,
  HouseholdId,
  IngredientConceptId,
  PrincipalId,
  ProductId,
  RetireHouseholdCompatibilityMappingUseCase,
  RetireHouseholdProductUseCase,
} from '@fridge/application';
import { PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdCompatibilityMappingWriter } from './create-household-compatibility-mapping.js';
import { PgHouseholdCompatibilityMappingRetirer } from './retire-household-compatibility-mapping.js';
import { PgHouseholdProductRetirer } from './retire-household-product.js';

const DATABASE_URL = process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if (!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD = HouseholdId('db010101-0b14-4d01-8b14-000000000001');
const ADMIN = PrincipalId('db010202-0b14-4d02-8b14-000000000002');
const MEMBERSHIP = 'db010303-0b14-4d03-8b14-000000000003';
const ROLE = 'BE05_COMPAT_RETIRE_CORE_ADMIN';
const PRODUCT_A = ProductId('db010404-0b14-4d04-8b14-000000000004');
const PRODUCT_B = ProductId('db010405-0b14-4d04-8b14-000000000005');
const CONCEPT_A = IngredientConceptId('db010505-0b14-4d05-8b14-000000000005');
const CONCEPT_B = IngredientConceptId('db010506-0b14-4d05-8b14-000000000006');

async function seedFixture(): Promise<void> {
  const pool = new Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(`insert into fridge.user_profile(user_id,display_name) values($1::uuid,'Compat retire core admin')`,[ADMIN]);
    await pool.query(`insert into fridge.household(household_id,display_name) values($1::uuid,'Compat retire core Household')`,[HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role(role_code,display_name,lifecycle_status) values($1,'Compat retire core admin','ACTIVE')`,[ROLE]);
    await pool.query(`insert into fridge.household_role_capability(role_code,capability_code) values($1,'HOUSEHOLD_CATALOG_ADMINISTER')`,[ROLE]);
    await pool.query(`insert into fridge.household_membership(membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to)
      values($1::uuid,$2::uuid,$3::uuid,$4,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,[MEMBERSHIP,HOUSEHOLD,ADMIN,ROLE]);
    await pool.query(`insert into fridge.product(product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status) values
      ($1::uuid,'HOUSEHOLD',$3::uuid,'Compat retire Product A','ACTIVE'),
      ($2::uuid,'HOUSEHOLD',$3::uuid,'Compat retire Product B','ACTIVE')`,[PRODUCT_A,PRODUCT_B,HOUSEHOLD]);
    await pool.query(`insert into fridge.ingredient_concept(ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status) values
      ($1::uuid,'HOUSEHOLD',$3::uuid,'Compat retire Concept A','ACTIVE'),
      ($2::uuid,'HOUSEHOLD',$3::uuid,'Compat retire Concept B','ACTIVE')`,[CONCEPT_A,CONCEPT_B,HOUSEHOLD]);
  } finally { await pool.end(); }
}
await seedFixture();

function creator(database: PgDatabase, familyId: CompatibilityMappingFamilyId, mappingId: CompatibilityMappingId) {
  return new CreateHouseholdCompatibilityMappingUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdCompatibilityMappingWriter(),
    { generate: () => familyId },
    { generate: () => mappingId },
  );
}
function retirer(database: PgDatabase) {
  return new RetireHouseholdCompatibilityMappingUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdCompatibilityMappingRetirer(),
  );
}
function productRetirer(database: PgDatabase) {
  return new RetireHouseholdProductUseCase(
    new PgHouseholdCatalogAdministrationTransactionManager(database),
    new PgHouseholdProductRetirer(),
  );
}
async function createMapping(database: PgDatabase, familyId: CompatibilityMappingFamilyId, mappingId: CompatibilityMappingId, commandId: CommandId, productId: ProductId, conceptId: IngredientConceptId) {
  await creator(database,familyId,mappingId).execute({commandId,actorPrincipalId:ADMIN,householdId:HOUSEHOLD,productId,ingredientConceptId:conceptId});
}

test('retirement closes only lifecycle/effective interval and preserves exact mapping history plus evidence', async () => {
  const database=new PgDatabase({connectionString:DATABASE_URL,capabilityRole:'fridge_app'});
  const admin=new Pool({connectionString:ADMIN_DATABASE_URL,max:1});
  const familyId=CompatibilityMappingFamilyId('db011111-0b14-4d11-8b14-000000000011');
  const mappingId=CompatibilityMappingId('db011212-0b14-4d12-8b14-000000000012');
  const evidenceId='db011313-0b14-4d13-8b14-000000000013';
  try {
    await createMapping(database,familyId,mappingId,CommandId('db011414-0b14-4d14-8b14-000000000014'),PRODUCT_A,CONCEPT_A);
    const before=(await admin.query<{mapping_family_id:string;version_no:number;catalog_scope:string;owner_household_id:string;product_id:string;ingredient_concept_id:string;effective_from:Date;recorded_at:Date}>(
      `select mapping_family_id::text,version_no,catalog_scope::text,owner_household_id::text,product_id::text,ingredient_concept_id::text,effective_from,recorded_at
         from fridge.product_ingredient_compatibility where compatibility_mapping_id=$1::uuid`,[mappingId])).rows[0];
    assert.ok(before);
    await admin.query(`insert into fridge.compatibility_decision_evidence(compatibility_evidence_id,household_id,product_id,ingredient_concept_id,compatibility_mapping_id,evaluation_anchor,approved_by_user_id,approval_reason,provenance)
      values($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,clock_timestamp(),$6::uuid,'accepted','retirement preservation')`,[evidenceId,HOUSEHOLD,PRODUCT_A,CONCEPT_A,mappingId,ADMIN]);

    const output=await retirer(database).execute({commandId:CommandId('db011515-0b14-4d15-8b14-000000000015'),actorPrincipalId:ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mappingId});
    assert.deepEqual(output,{compatibilityMappingId:mappingId});

    const after=(await admin.query<{mapping_family_id:string;version_no:number;catalog_scope:string;owner_household_id:string;product_id:string;ingredient_concept_id:string;effective_from:Date;effective_to:Date;lifecycle_status:string;recorded_at:Date;evidence_count:number;intent_code:string}>(
      `select m.mapping_family_id::text,m.version_no,m.catalog_scope::text,m.owner_household_id::text,m.product_id::text,m.ingredient_concept_id::text,m.effective_from,m.effective_to,m.lifecycle_status,m.recorded_at,
              (select count(*)::int from fridge.compatibility_decision_evidence e where e.compatibility_evidence_id=$2::uuid and e.compatibility_mapping_id=m.compatibility_mapping_id) evidence_count,
              r.intent_code
         from fridge.product_ingredient_compatibility m
         join fridge.household_compatibility_mapping_retire_command c on c.compatibility_mapping_id=m.compatibility_mapping_id
         join fridge.household_catalog_command_registry r on r.household_id=c.household_id and r.command_id=c.command_id
        where m.compatibility_mapping_id=$1::uuid`,[mappingId,evidenceId])).rows[0];
    assert.ok(after);
    assert.equal(after.mapping_family_id,before.mapping_family_id);
    assert.equal(after.version_no,before.version_no);
    assert.equal(after.catalog_scope,before.catalog_scope);
    assert.equal(after.owner_household_id,before.owner_household_id);
    assert.equal(after.product_id,before.product_id);
    assert.equal(after.ingredient_concept_id,before.ingredient_concept_id);
    assert.equal(after.effective_from.getTime(),before.effective_from.getTime());
    assert.equal(after.recorded_at.getTime(),before.recorded_at.getTime());
    assert.equal(after.lifecycle_status,'RETIRED');
    assert.ok(after.effective_to.getTime()>after.effective_from.getTime());
    assert.equal(after.evidence_count,1);
    assert.equal(after.intent_code,'RETIRE_HOUSEHOLD_COMPATIBILITY_MAPPING');
  } finally { await database.close(); await admin.end(); }
});

test('current compatibility blocks Product retirement until mapping retirement closes the dependency', async () => {
  const database=new PgDatabase({connectionString:DATABASE_URL,capabilityRole:'fridge_app'});
  const mappingId=CompatibilityMappingId('db012121-0b14-4d21-8b14-000000000021');
  try {
    await createMapping(database,CompatibilityMappingFamilyId('db012222-0b14-4d22-8b14-000000000022'),mappingId,CommandId('db012323-0b14-4d23-8b14-000000000023'),PRODUCT_B,CONCEPT_B);
    await assert.rejects(productRetirer(database).execute({commandId:CommandId('db012424-0b14-4d24-8b14-000000000024'),actorPrincipalId:ADMIN,householdId:HOUSEHOLD,productId:PRODUCT_B}),ConflictError);
    await retirer(database).execute({commandId:CommandId('db012525-0b14-4d25-8b14-000000000025'),actorPrincipalId:ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mappingId});
    const result=await productRetirer(database).execute({commandId:CommandId('db012626-0b14-4d26-8b14-000000000026'),actorPrincipalId:ADMIN,householdId:HOUSEHOLD,productId:PRODUCT_B});
    assert.deepEqual(result,{productId:PRODUCT_B});
  } finally { await database.close(); }
});
