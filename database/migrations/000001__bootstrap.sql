-- FridgeScanner DB-02
-- 000001__bootstrap.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

create schema if not exists fridge;
create schema if not exists fridge_internal;

comment on schema fridge is
  'FridgeScanner canonical application database objects.';
comment on schema fridge_internal is
  'FridgeScanner privileged/internal database helpers. Not an application data API.';

-- Avoid accidental object resolution through caller-controlled schemas.
-- Every privileged function must still set/search-path explicitly as appropriate.

create or replace function fridge_internal.is_integral_numeric(p_value numeric)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select trunc(p_value) = p_value;
$$;

comment on function fridge_internal.is_integral_numeric(numeric) is
  'True only when a PostgreSQL numeric value has no fractional component.';

create or replace function fridge_internal.gcd_numeric_integer(
  p_left numeric,
  p_right numeric
)
returns numeric
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
declare
  v_a numeric := abs(p_left);
  v_b numeric := abs(p_right);
  v_r numeric;
begin
  if trunc(v_a) <> v_a or trunc(v_b) <> v_b then
    raise exception using
      errcode = '22023',
      message = 'gcd operands must be integral numeric values';
  end if;

  while v_b <> 0 loop
    v_r := mod(v_a, v_b);
    v_a := v_b;
    v_b := v_r;
  end loop;

  return v_a;
end;
$$;

comment on function fridge_internal.gcd_numeric_integer(numeric, numeric) is
  'Arbitrary-precision Euclidean GCD for integral PostgreSQL numeric values; no fixed-width casts.';

create or replace function fridge_internal.normalize_rational(
  p_num numeric,
  p_den numeric
)
returns table (
  quantity_num numeric,
  quantity_den numeric
)
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
declare
  v_num numeric := p_num;
  v_den numeric := p_den;
  v_gcd numeric;
begin
  if trunc(v_num) <> v_num or trunc(v_den) <> v_den then
    raise exception using
      errcode = '22023',
      message = 'rational numerator and denominator must be integral numeric values';
  end if;

  if v_den = 0 then
    raise exception using
      errcode = '22012',
      message = 'rational denominator must not be zero';
  end if;

  if v_num = 0 then
    quantity_num := 0;
    quantity_den := 1;
    return next;
    return;
  end if;

  if v_den < 0 then
    v_num := -v_num;
    v_den := -v_den;
  end if;

  v_gcd := fridge_internal.gcd_numeric_integer(abs(v_num), v_den);

  quantity_num := v_num / v_gcd;
  quantity_den := v_den / v_gcd;

  return next;
end;
$$;

comment on function fridge_internal.normalize_rational(numeric, numeric) is
  'Canonicalizes an exact rational to coprime numerator/positive denominator; zero is 0/1.';

create or replace function fridge_internal.rational_equal(
  p_left_num numeric,
  p_left_den numeric,
  p_right_num numeric,
  p_right_den numeric
)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
begin
  if trunc(p_left_num) <> p_left_num
     or trunc(p_left_den) <> p_left_den
     or trunc(p_right_num) <> p_right_num
     or trunc(p_right_den) <> p_right_den then
    raise exception using
      errcode = '22023',
      message = 'rational operands must use integral numeric numerator/denominator values';
  end if;

  if p_left_den <= 0 or p_right_den <= 0 then
    raise exception using
      errcode = '22023',
      message = 'rational denominators must be positive';
  end if;

  -- PostgreSQL numeric is arbitrary precision for practical database limits.
  -- No presentation rounding or binary floating point participates.
  return (p_left_num * p_right_den) = (p_right_num * p_left_den);
end;
$$;

comment on function fridge_internal.rational_equal(numeric, numeric, numeric, numeric) is
  'Exact rational equality by cross multiplication; requires positive integral denominators.';

create or replace function fridge_internal.assert_normalized_rational(
  p_num numeric,
  p_den numeric
)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
declare
  v_num numeric;
  v_den numeric;
begin
  select quantity_num, quantity_den
    into v_num, v_den
    from fridge_internal.normalize_rational(p_num, p_den);

  return v_num = p_num and v_den = p_den;
end;
$$;

comment on function fridge_internal.assert_normalized_rational(numeric, numeric) is
  'True only when an integral rational pair is already in canonical normalized form.';

-- No PUBLIC execution on internal helpers. Explicit execution grants are added only
-- when the application privilege topology is finalized and reviewed.
revoke all on schema fridge_internal from public;
revoke all on all functions in schema fridge_internal from public;

commit;
