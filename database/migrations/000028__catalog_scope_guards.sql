-- FridgeScanner DB-02
-- 000028__catalog_scope_guards.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.
--
-- Enforces GLOBAL/HOUSEHOLD catalog visibility and scope coherence as database
-- postconditions. These guards are defense in depth around governed mutation
-- routines; they do not replace service-boundary authorization.

begin;

create or replace function fridge_internal.catalog_object_visible_to_household(
  p_scope fridge.catalog_scope,
  p_owner_household_id uuid,
  p_household_id uuid
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case
    when p_scope = 'GLOBAL' then p_owner_household_id is null
    when p_scope = 'HOUSEHOLD' then p_owner_household_id = p_household_id
    else false
  end;
$$;

revoke all on function fridge_internal.catalog_object_visible_to_household(fridge.catalog_scope,uuid,uuid) from public;

create or replace function fridge_internal.assert_compatibility_mapping_scope(
  p_mapping_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_mapping fridge.product_ingredient_compatibility%rowtype;
  v_product fridge.product%rowtype;
  v_concept fridge.ingredient_concept%rowtype;
begin
  select * into v_mapping
    from fridge.product_ingredient_compatibility
   where compatibility_mapping_id = p_mapping_id;
  if not found then return; end if;

  select * into v_product from fridge.product where product_id = v_mapping.product_id;
  select * into v_concept from fridge.ingredient_concept where ingredient_concept_id = v_mapping.ingredient_concept_id;

  if v_mapping.catalog_scope = 'GLOBAL' then
    if v_product.catalog_scope <> 'GLOBAL' or v_concept.catalog_scope <> 'GLOBAL' then
      raise exception using errcode = '23514', message = 'GLOBAL compatibility mapping requires GLOBAL Product and IngredientConcept';
    end if;
  else
    if not fridge_internal.catalog_object_visible_to_household(v_product.catalog_scope, v_product.owner_household_id, v_mapping.owner_household_id)
       or not fridge_internal.catalog_object_visible_to_household(v_concept.catalog_scope, v_concept.owner_household_id, v_mapping.owner_household_id) then
      raise exception using errcode = '23514', message = 'HOUSEHOLD compatibility mapping endpoints must be GLOBAL or owned by the same Household';
    end if;
  end if;
end;
$$;

revoke all on function fridge_internal.assert_compatibility_mapping_scope(uuid) from public;

create or replace function fridge_internal.assert_compatibility_evidence_scope(
  p_evidence_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_evidence fridge.compatibility_decision_evidence%rowtype;
  v_mapping fridge.product_ingredient_compatibility%rowtype;
  v_product fridge.product%rowtype;
  v_concept fridge.ingredient_concept%rowtype;
begin
  select * into v_evidence
    from fridge.compatibility_decision_evidence
   where compatibility_evidence_id = p_evidence_id;
  if not found then return; end if;

  select * into v_mapping
    from fridge.product_ingredient_compatibility
   where compatibility_mapping_id = v_evidence.compatibility_mapping_id;
  select * into v_product from fridge.product where product_id = v_evidence.product_id;
  select * into v_concept from fridge.ingredient_concept where ingredient_concept_id = v_evidence.ingredient_concept_id;

  if v_mapping.product_id <> v_evidence.product_id
     or v_mapping.ingredient_concept_id <> v_evidence.ingredient_concept_id then
    raise exception using errcode = '23514', message = 'compatibility evidence endpoints must equal the pinned mapping endpoints';
  end if;

  if v_evidence.household_id is null then
    if v_mapping.catalog_scope <> 'GLOBAL'
       or v_product.catalog_scope <> 'GLOBAL'
       or v_concept.catalog_scope <> 'GLOBAL' then
      raise exception using errcode = '23514', message = 'GLOBAL compatibility evidence requires a fully GLOBAL mapping and endpoints';
    end if;
  else
    if not fridge_internal.catalog_object_visible_to_household(v_mapping.catalog_scope, v_mapping.owner_household_id, v_evidence.household_id)
       or not fridge_internal.catalog_object_visible_to_household(v_product.catalog_scope, v_product.owner_household_id, v_evidence.household_id)
       or not fridge_internal.catalog_object_visible_to_household(v_concept.catalog_scope, v_concept.owner_household_id, v_evidence.household_id) then
      raise exception using errcode = '23514', message = 'compatibility evidence references catalog objects not visible to its Household';
    end if;
  end if;
end;
$$;

revoke all on function fridge_internal.assert_compatibility_evidence_scope(uuid) from public;

create or replace function fridge_internal.assert_recipe_version_scope(
  p_recipe_version_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_version fridge.recipe_version%rowtype;
  v_recipe fridge.recipe%rowtype;
begin
  select * into v_version from fridge.recipe_version where recipe_version_id = p_recipe_version_id;
  if not found then return; end if;
  select * into v_recipe from fridge.recipe where recipe_id = v_version.recipe_id;

  if v_version.catalog_scope <> v_recipe.catalog_scope
     or v_version.owner_household_id is distinct from v_recipe.owner_household_id then
    raise exception using errcode = '23514', message = 'RecipeVersion scope/owner must exactly match Recipe';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_recipe_version_scope(uuid) from public;

create or replace function fridge_internal.assert_recipe_ingredient_scope(
  p_recipe_ingredient_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_line fridge.recipe_ingredient%rowtype;
  v_version fridge.recipe_version%rowtype;
  v_concept fridge.ingredient_concept%rowtype;
  v_product fridge.product%rowtype;
begin
  select * into v_line from fridge.recipe_ingredient where recipe_ingredient_id = p_recipe_ingredient_id;
  if not found then return; end if;
  select * into v_version from fridge.recipe_version where recipe_version_id = v_line.recipe_version_id;
  select * into v_concept from fridge.ingredient_concept where ingredient_concept_id = v_line.ingredient_concept_id;

  if v_version.catalog_scope = 'GLOBAL' then
    if v_concept.catalog_scope <> 'GLOBAL' then
      raise exception using errcode = '23514', message = 'GLOBAL RecipeIngredient requires GLOBAL IngredientConcept';
    end if;
  elsif not fridge_internal.catalog_object_visible_to_household(v_concept.catalog_scope, v_concept.owner_household_id, v_version.owner_household_id) then
    raise exception using errcode = '23514', message = 'RecipeIngredient concept is not visible to Recipe Household';
  end if;

  if v_line.exact_product_id is not null then
    select * into v_product from fridge.product where product_id = v_line.exact_product_id;
    if v_version.catalog_scope = 'GLOBAL' then
      if v_product.catalog_scope <> 'GLOBAL' then
        raise exception using errcode = '23514', message = 'GLOBAL RecipeIngredient exact Product must be GLOBAL';
      end if;
    elsif not fridge_internal.catalog_object_visible_to_household(v_product.catalog_scope, v_product.owner_household_id, v_version.owner_household_id) then
      raise exception using errcode = '23514', message = 'RecipeIngredient exact Product is not visible to Recipe Household';
    end if;
  end if;
end;
$$;

revoke all on function fridge_internal.assert_recipe_ingredient_scope(uuid) from public;

create or replace function fridge_internal.assert_preparation_recipe_visibility(
  p_household_id uuid,
  p_preparation_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_preparation fridge.preparation%rowtype;
  v_version fridge.recipe_version%rowtype;
begin
  select * into v_preparation
    from fridge.preparation
   where household_id = p_household_id and preparation_id = p_preparation_id;
  if not found or v_preparation.recipe_version_id is null then return; end if;

  select * into v_version from fridge.recipe_version where recipe_version_id = v_preparation.recipe_version_id;
  if not fridge_internal.catalog_object_visible_to_household(v_version.catalog_scope, v_version.owner_household_id, p_household_id) then
    raise exception using errcode = '23514', message = 'Preparation RecipeVersion is not visible to its Household';
  end if;
end;
$$;

revoke all on function fridge_internal.assert_preparation_recipe_visibility(uuid,uuid) from public;

create or replace function fridge_internal.assert_shelf_life_rule_scope(
  p_rule_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_rule fridge.shelf_life_rule%rowtype;
  v_product fridge.product%rowtype;
  v_concept fridge.ingredient_concept%rowtype;
begin
  select * into v_rule from fridge.shelf_life_rule where shelf_life_rule_id = p_rule_id;
  if not found then return; end if;

  if v_rule.target_product_id is not null then
    select * into v_product from fridge.product where product_id = v_rule.target_product_id;
    if v_rule.catalog_scope = 'GLOBAL' and v_product.catalog_scope <> 'GLOBAL' then
      raise exception using errcode = '23514', message = 'GLOBAL ShelfLifeRule Product target must be GLOBAL';
    elsif v_rule.catalog_scope = 'HOUSEHOLD'
      and not fridge_internal.catalog_object_visible_to_household(v_product.catalog_scope, v_product.owner_household_id, v_rule.owner_household_id) then
      raise exception using errcode = '23514', message = 'ShelfLifeRule Product target is not visible to rule Household';
    end if;
  else
    select * into v_concept from fridge.ingredient_concept where ingredient_concept_id = v_rule.target_ingredient_concept_id;
    if v_rule.catalog_scope = 'GLOBAL' and v_concept.catalog_scope <> 'GLOBAL' then
      raise exception using errcode = '23514', message = 'GLOBAL ShelfLifeRule IngredientConcept target must be GLOBAL';
    elsif v_rule.catalog_scope = 'HOUSEHOLD'
      and not fridge_internal.catalog_object_visible_to_household(v_concept.catalog_scope, v_concept.owner_household_id, v_rule.owner_household_id) then
      raise exception using errcode = '23514', message = 'ShelfLifeRule IngredientConcept target is not visible to rule Household';
    end if;
  end if;
end;
$$;

revoke all on function fridge_internal.assert_shelf_life_rule_scope(uuid) from public;

create or replace function fridge_internal.assert_shelf_life_activation_scope(
  p_household_id uuid,
  p_activation_id uuid
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
declare
  v_activation fridge.shelf_life_rule_activation%rowtype;
  v_rule fridge.shelf_life_rule%rowtype;
  v_evidence fridge.compatibility_decision_evidence%rowtype;
begin
  select * into v_activation
    from fridge.shelf_life_rule_activation
   where household_id = p_household_id
     and shelf_life_rule_activation_id = p_activation_id;
  if not found then return; end if;

  select * into v_rule from fridge.shelf_life_rule where shelf_life_rule_id = v_activation.shelf_life_rule_id;
  if not fridge_internal.catalog_object_visible_to_household(v_rule.catalog_scope, v_rule.owner_household_id, p_household_id) then
    raise exception using errcode = '23514', message = 'ShelfLifeRuleActivation references a rule not visible to its Household';
  end if;

  if v_rule.target_product_id is not null then
    if v_rule.target_product_id <> v_activation.product_id then
      raise exception using errcode = '23514', message = 'Product-target ShelfLifeRuleActivation must match StockItem Product';
    end if;
    if v_activation.compatibility_evidence_id is not null then
      raise exception using errcode = '23514', message = 'Product-target ShelfLifeRuleActivation must not carry concept compatibility evidence';
    end if;
  else
    if v_activation.compatibility_evidence_id is null then
      raise exception using errcode = '23514', message = 'IngredientConcept-target ShelfLifeRuleActivation requires compatibility evidence';
    end if;
    select * into v_evidence
      from fridge.compatibility_decision_evidence
     where compatibility_evidence_id = v_activation.compatibility_evidence_id;
    if (v_evidence.household_id is not null and v_evidence.household_id <> p_household_id)
       or v_evidence.product_id <> v_activation.product_id
       or v_evidence.ingredient_concept_id <> v_rule.target_ingredient_concept_id then
      raise exception using errcode = '23514', message = 'ShelfLifeRuleActivation compatibility evidence does not match visible Household/Product/Concept context';
    end if;
  end if;
end;
$$;

revoke all on function fridge_internal.assert_shelf_life_activation_scope(uuid,uuid) from public;

create or replace function fridge_internal.guard_catalog_scope_row()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, fridge, fridge_internal
as $$
begin
  if tg_table_name = 'product_ingredient_compatibility' then
    perform fridge_internal.assert_compatibility_mapping_scope(new.compatibility_mapping_id);
  elsif tg_table_name = 'compatibility_decision_evidence' then
    perform fridge_internal.assert_compatibility_evidence_scope(new.compatibility_evidence_id);
  elsif tg_table_name = 'recipe_version' then
    perform fridge_internal.assert_recipe_version_scope(new.recipe_version_id);
  elsif tg_table_name = 'recipe_ingredient' then
    perform fridge_internal.assert_recipe_ingredient_scope(new.recipe_ingredient_id);
  elsif tg_table_name = 'preparation' then
    perform fridge_internal.assert_preparation_recipe_visibility(new.household_id, new.preparation_id);
  elsif tg_table_name = 'shelf_life_rule' then
    perform fridge_internal.assert_shelf_life_rule_scope(new.shelf_life_rule_id);
  elsif tg_table_name = 'shelf_life_rule_activation' then
    perform fridge_internal.assert_shelf_life_activation_scope(new.household_id, new.shelf_life_rule_activation_id);
  end if;
  return null;
end;
$$;

revoke all on function fridge_internal.guard_catalog_scope_row() from public;

create constraint trigger compatibility_mapping_scope_guard
after insert or update on fridge.product_ingredient_compatibility
deferrable initially deferred
for each row execute function fridge_internal.guard_catalog_scope_row();

create constraint trigger compatibility_evidence_scope_guard
after insert or update on fridge.compatibility_decision_evidence
deferrable initially deferred
for each row execute function fridge_internal.guard_catalog_scope_row();

create constraint trigger recipe_version_scope_guard
after insert or update on fridge.recipe_version
deferrable initially deferred
for each row execute function fridge_internal.guard_catalog_scope_row();

create constraint trigger recipe_ingredient_scope_guard
after insert or update on fridge.recipe_ingredient
deferrable initially deferred
for each row execute function fridge_internal.guard_catalog_scope_row();

create constraint trigger preparation_recipe_visibility_guard
after insert or update on fridge.preparation
deferrable initially deferred
for each row execute function fridge_internal.guard_catalog_scope_row();

create constraint trigger shelf_life_rule_scope_guard
after insert or update on fridge.shelf_life_rule
deferrable initially deferred
for each row execute function fridge_internal.guard_catalog_scope_row();

create constraint trigger shelf_life_activation_scope_guard
after insert or update on fridge.shelf_life_rule_activation
deferrable initially deferred
for each row execute function fridge_internal.guard_catalog_scope_row();

commit;
