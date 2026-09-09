import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import {
  CommandId,
  CompatibilityMappingFamilyId,
  CompatibilityMappingId,
  CreateHouseholdCompatibilityMappingUseCase,
  HouseholdId,
  IdempotencyConflictError,
  IngredientConceptId,
  NotFoundError,
  PrincipalId,
  ProductId,
  RetireHouseholdCompatibilityMappingUseCase,
} from '@fridge/application';
import { HouseholdAuthorizationError, PgDatabase } from './index.js';
import { PgHouseholdCatalogAdministrationTransactionManager } from './catalog-administration.js';
import { PgHouseholdCompatibilityMappingWriter } from './create-household-compatibility-mapping.js';
import { PgHouseholdCompatibilityMappingRetirer } from './retire-household-compatibility-mapping.js';

const DATABASE_URL=process.env.BE00_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL=process.env.DATABASE_URL;
if(!DATABASE_URL) throw new Error('BE00_TEST_DATABASE_URL is required');
if(!ADMIN_DATABASE_URL) throw new Error('DATABASE_URL is required');

const HOUSEHOLD=HouseholdId('dc020101-0b14-4d01-8b14-000000000001');
const FOREIGN_HOUSEHOLD=HouseholdId('dc020102-0b14-4d01-8b14-000000000002');
const ADMIN=PrincipalId('dc020202-0b14-4d02-8b14-000000000002');
const SECOND_ADMIN=PrincipalId('dc020203-0b14-4d02-8b14-000000000003');
const ORDINARY=PrincipalId('dc020204-0b14-4d02-8b14-000000000004');
const ADMIN_MEMBERSHIP='dc020303-0b14-4d03-8b14-000000000003';
const SECOND_MEMBERSHIP='dc020304-0b14-4d03-8b14-000000000004';
const ORDINARY_MEMBERSHIP='dc020305-0b14-4d03-8b14-000000000005';
const ADMIN_ROLE='BE05_COMPAT_RETIRE_REPLAY_ADMIN';
const ORDINARY_ROLE='BE05_COMPAT_RETIRE_REPLAY_MEMBER';
const PRODUCT_A=ProductId('dc020404-0b14-4d04-8b14-000000000004');
const PRODUCT_B=ProductId('dc020405-0b14-4d04-8b14-000000000005');
const FOREIGN_PRODUCT=ProductId('dc020406-0b14-4d04-8b14-000000000006');
const GLOBAL_PRODUCT=ProductId('dc020407-0b14-4d04-8b14-000000000007');
const CONCEPT_A=IngredientConceptId('dc020505-0b14-4d05-8b14-000000000005');
const CONCEPT_B=IngredientConceptId('dc020506-0b14-4d05-8b14-000000000006');
const FOREIGN_CONCEPT=IngredientConceptId('dc020507-0b14-4d05-8b14-000000000007');
const GLOBAL_CONCEPT=IngredientConceptId('dc020508-0b14-4d05-8b14-000000000008');

async function seedFixture(){
  const pool=new Pool({connectionString:ADMIN_DATABASE_URL,max:1});
  try{
    await pool.query(`insert into fridge.user_profile(user_id,display_name) values($1::uuid,'Replay admin'),($2::uuid,'Replay second admin'),($3::uuid,'Replay ordinary')`,[ADMIN,SECOND_ADMIN,ORDINARY]);
    await pool.query(`insert into fridge.household(household_id,display_name) values($1::uuid,'Replay Household'),($2::uuid,'Replay Foreign')`,[HOUSEHOLD,FOREIGN_HOUSEHOLD]);
    await pool.query(`insert into fridge.household_role(role_code,display_name,lifecycle_status) values($1,'Replay admin','ACTIVE'),($2,'Replay ordinary','ACTIVE')`,[ADMIN_ROLE,ORDINARY_ROLE]);
    await pool.query(`insert into fridge.household_role_capability(role_code,capability_code) values($1,'HOUSEHOLD_CATALOG_ADMINISTER')`,[ADMIN_ROLE]);
    await pool.query(`insert into fridge.household_membership(membership_id,household_id,user_id,role_code,lifecycle_status,effective_from,effective_to) values
      ($1::uuid,$4::uuid,$5::uuid,$8,'ACTIVE',clock_timestamp()-interval '1 hour',null),
      ($2::uuid,$4::uuid,$6::uuid,$8,'ACTIVE',clock_timestamp()-interval '1 hour',null),
      ($3::uuid,$4::uuid,$7::uuid,$9,'ACTIVE',clock_timestamp()-interval '1 hour',null)`,[ADMIN_MEMBERSHIP,SECOND_MEMBERSHIP,ORDINARY_MEMBERSHIP,HOUSEHOLD,ADMIN,SECOND_ADMIN,ORDINARY,ADMIN_ROLE,ORDINARY_ROLE]);
    await pool.query(`insert into fridge.product(product_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status) values
      ($1::uuid,'HOUSEHOLD',$5::uuid,'Replay Product A','ACTIVE'),($2::uuid,'HOUSEHOLD',$5::uuid,'Replay Product B','ACTIVE'),
      ($3::uuid,'HOUSEHOLD',$6::uuid,'Replay Foreign Product','ACTIVE'),($4::uuid,'GLOBAL',null,'Replay Global Product','ACTIVE')`,[PRODUCT_A,PRODUCT_B,FOREIGN_PRODUCT,GLOBAL_PRODUCT,HOUSEHOLD,FOREIGN_HOUSEHOLD]);
    await pool.query(`insert into fridge.ingredient_concept(ingredient_concept_id,catalog_scope,owner_household_id,canonical_name,lifecycle_status) values
      ($1::uuid,'HOUSEHOLD',$5::uuid,'Replay Concept A','ACTIVE'),($2::uuid,'HOUSEHOLD',$5::uuid,'Replay Concept B','ACTIVE'),
      ($3::uuid,'HOUSEHOLD',$6::uuid,'Replay Foreign Concept','ACTIVE'),($4::uuid,'GLOBAL',null,'Replay Global Concept','ACTIVE')`,[CONCEPT_A,CONCEPT_B,FOREIGN_CONCEPT,GLOBAL_CONCEPT,HOUSEHOLD,FOREIGN_HOUSEHOLD]);
  }finally{await pool.end();}
}
await seedFixture();

function creator(database:PgDatabase,familyId:CompatibilityMappingFamilyId,mappingId:CompatibilityMappingId){return new CreateHouseholdCompatibilityMappingUseCase(new PgHouseholdCatalogAdministrationTransactionManager(database),new PgHouseholdCompatibilityMappingWriter(),{generate:()=>familyId},{generate:()=>mappingId});}
function retirer(database:PgDatabase){return new RetireHouseholdCompatibilityMappingUseCase(new PgHouseholdCatalogAdministrationTransactionManager(database),new PgHouseholdCompatibilityMappingRetirer());}
async function createMapping(database:PgDatabase,familyId:CompatibilityMappingFamilyId,mappingId:CompatibilityMappingId,commandId:CommandId,productId:ProductId,conceptId:IngredientConceptId){await creator(database,familyId,mappingId).execute({commandId,actorPrincipalId:ADMIN,householdId:HOUSEHOLD,productId,ingredientConceptId:conceptId});}

test('foreign, GLOBAL, already-retired and missing mappings collapse to NotFound',async()=>{
  const database=new PgDatabase({connectionString:DATABASE_URL,capabilityRole:'fridge_app'});
  const admin=new Pool({connectionString:ADMIN_DATABASE_URL,max:1});
  const foreignMapping=CompatibilityMappingId('dc021111-0b14-4d11-8b14-000000000011');
  const globalMapping=CompatibilityMappingId('dc021212-0b14-4d12-8b14-000000000012');
  const retiredMapping=CompatibilityMappingId('dc021313-0b14-4d13-8b14-000000000013');
  try{
    await admin.query(`insert into fridge.product_ingredient_compatibility(compatibility_mapping_id,mapping_family_id,version_no,catalog_scope,owner_household_id,product_id,ingredient_concept_id,effective_from,effective_to,lifecycle_status) values
      ($1::uuid,'dc021414-0b14-4d14-8b14-000000000014'::uuid,1,'HOUSEHOLD',$4::uuid,$5::uuid,$6::uuid,clock_timestamp()-interval '2 hours',null,'ACTIVE'),
      ($2::uuid,'dc021515-0b14-4d15-8b14-000000000015'::uuid,1,'GLOBAL',null,$7::uuid,$8::uuid,clock_timestamp()-interval '2 hours',null,'ACTIVE'),
      ($3::uuid,'dc021616-0b14-4d16-8b14-000000000016'::uuid,1,'HOUSEHOLD',$9::uuid,$10::uuid,$11::uuid,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour','RETIRED')`,[foreignMapping,globalMapping,retiredMapping,FOREIGN_HOUSEHOLD,FOREIGN_PRODUCT,FOREIGN_CONCEPT,GLOBAL_PRODUCT,GLOBAL_CONCEPT,HOUSEHOLD,PRODUCT_A,CONCEPT_A]);
    const cases=[foreignMapping,globalMapping,retiredMapping,CompatibilityMappingId('dc021717-0b14-4d17-8b14-000000000017')];
    for(let i=0;i<cases.length;i+=1){const mapping=cases[i];assert.ok(mapping);await assert.rejects(retirer(database).execute({commandId:CommandId(`dc0218${i}${i}-0b14-4d18-8b14-00000000001${i}`),actorPrincipalId:ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mapping}),NotFoundError);}
  }finally{await database.close();await admin.end();}
});

test('committed replay is non-restoring and fingerprint binds actor plus mapping',async()=>{
  const database=new PgDatabase({connectionString:DATABASE_URL,capabilityRole:'fridge_app'});
  const admin=new Pool({connectionString:ADMIN_DATABASE_URL,max:1});
  const mappingA=CompatibilityMappingId('dc022121-0b14-4d21-8b14-000000000021');
  const mappingB=CompatibilityMappingId('dc022222-0b14-4d22-8b14-000000000022');
  const commandId=CommandId('dc022323-0b14-4d23-8b14-000000000023');
  try{
    await createMapping(database,CompatibilityMappingFamilyId('dc022424-0b14-4d24-8b14-000000000024'),mappingA,CommandId('dc022525-0b14-4d25-8b14-000000000025'),PRODUCT_A,CONCEPT_B);
    await createMapping(database,CompatibilityMappingFamilyId('dc022626-0b14-4d26-8b14-000000000026'),mappingB,CommandId('dc022727-0b14-4d27-8b14-000000000027'),PRODUCT_B,CONCEPT_A);
    await retirer(database).execute({commandId,actorPrincipalId:ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mappingA});
    await admin.query(`update fridge.product_ingredient_compatibility set effective_to=null,lifecycle_status='ACTIVE' where compatibility_mapping_id=$1::uuid`,[mappingA]);
    const replay=await retirer(database).execute({commandId,actorPrincipalId:ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mappingA});
    assert.deepEqual(replay,{compatibilityMappingId:mappingA});
    const state=(await admin.query<{lifecycle_status:string;effective_to:Date|null}>(`select lifecycle_status,effective_to from fridge.product_ingredient_compatibility where compatibility_mapping_id=$1::uuid`,[mappingA])).rows[0];
    assert.deepEqual(state,{lifecycle_status:'ACTIVE',effective_to:null});
    await assert.rejects(retirer(database).execute({commandId,actorPrincipalId:SECOND_ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mappingA}),IdempotencyConflictError);
    await assert.rejects(retirer(database).execute({commandId,actorPrincipalId:ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mappingB}),IdempotencyConflictError);
  }finally{await database.close();await admin.end();}
});

test('cross-intent reuse conflicts and ordinary member has no compatibility retirement authority',async()=>{
  const database=new PgDatabase({connectionString:DATABASE_URL,capabilityRole:'fridge_app'});
  const mapping=CompatibilityMappingId('dc023131-0b14-4d31-8b14-000000000031');
  const commandId=CommandId('dc023232-0b14-4d32-8b14-000000000032');
  try{
    await createMapping(database,CompatibilityMappingFamilyId('dc023333-0b14-4d33-8b14-000000000033'),mapping,CommandId('dc023434-0b14-4d34-8b14-000000000034'),GLOBAL_PRODUCT,CONCEPT_B);
    await retirer(database).execute({commandId,actorPrincipalId:ADMIN,householdId:HOUSEHOLD,compatibilityMappingId:mapping});
    await assert.rejects(creator(database,CompatibilityMappingFamilyId('dc023535-0b14-4d35-8b14-000000000035'),CompatibilityMappingId('dc023636-0b14-4d36-8b14-000000000036')).execute({commandId,actorPrincipalId:ADMIN,householdId:HOUSEHOLD,productId:PRODUCT_B,ingredientConceptId:GLOBAL_CONCEPT}),IdempotencyConflictError);
    await assert.rejects(retirer(database).execute({commandId:CommandId('dc023737-0b14-4d37-8b14-000000000037'),actorPrincipalId:ORDINARY,householdId:HOUSEHOLD,compatibilityMappingId:mapping}),HouseholdAuthorizationError);
  }finally{await database.close();}
});
