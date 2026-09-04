-- FridgeScanner DB-02 integrity checks for 000001__bootstrap.sql
-- This file is intended to fail loudly when a rational invariant regresses.

begin;

-- Canonical reduction.
do $$
declare
  v_num numeric;
  v_den numeric;
begin
  select quantity_num, quantity_den
    into v_num, v_den
    from fridge_internal.normalize_rational(2, 6);

  if v_num <> 1 or v_den <> 3 then
    raise exception 'expected 2/6 -> 1/3, got %/%', v_num, v_den;
  end if;
end;
$$;

-- Sign normalization.
do $$
declare
  v_num numeric;
  v_den numeric;
begin
  select quantity_num, quantity_den
    into v_num, v_den
    from fridge_internal.normalize_rational(2, -6);

  if v_num <> -1 or v_den <> 3 then
    raise exception 'expected 2/-6 -> -1/3, got %/%', v_num, v_den;
  end if;
end;
$$;

-- Zero canonicalization.
do $$
declare
  v_num numeric;
  v_den numeric;
begin
  select quantity_num, quantity_den
    into v_num, v_den
    from fridge_internal.normalize_rational(0, 987654321012345678901234567890::numeric);

  if v_num <> 0 or v_den <> 1 then
    raise exception 'expected zero rational -> 0/1, got %/%', v_num, v_den;
  end if;
end;
$$;

-- Exact non-terminating decimal semantic equality: 1/3 = 2/6.
do $$
begin
  if not fridge_internal.rational_equal(1, 3, 2, 6) then
    raise exception 'expected exact rational equality for 1/3 and 2/6';
  end if;

  if fridge_internal.rational_equal(1, 3, 333333, 1000000) then
    raise exception 'rounded decimal approximation must not equal exact 1/3';
  end if;
end;
$$;

-- Large arbitrary-precision values must avoid bigint-style overflow assumptions
-- and must reduce by the complete GCD, not merely by the obvious injected factor.
-- The source pair below has intrinsic GCD 9; multiplying both sides by 7 yields
-- total GCD 63 and therefore the canonical result asserted here.
do $$
declare
  v_num numeric;
  v_den numeric;
begin
  select quantity_num, quantity_den
    into v_num, v_den
    from fridge_internal.normalize_rational(
      1234567890123456789012345678901234567890::numeric * 7,
      999999999999999999999999999999999999999::numeric * 7
    );

  if v_num <> 137174210013717421001371742100137174210::numeric
     or v_den <> 111111111111111111111111111111111111111::numeric then
    raise exception 'large rational normalization failed: %/%', v_num, v_den;
  end if;
end;
$$;

-- Already-normalized predicate.
do $$
begin
  if not fridge_internal.assert_normalized_rational(-5, 7) then
    raise exception '-5/7 should be normalized';
  end if;

  if fridge_internal.assert_normalized_rational(2, 6) then
    raise exception '2/6 must not be accepted as canonical normalized form';
  end if;
end;
$$;

-- Denominator zero must fail.
do $$
begin
  begin
    perform * from fridge_internal.normalize_rational(1, 0);
    raise exception 'zero denominator unexpectedly accepted';
  exception
    when division_by_zero then
      null;
  end;
end;
$$;

-- Fractional numerator/denominator components must fail.
do $$
begin
  begin
    perform * from fridge_internal.normalize_rational(1.5, 3);
    raise exception 'fractional numerator unexpectedly accepted';
  exception
    when invalid_parameter_value then
      null;
  end;

  begin
    perform * from fridge_internal.normalize_rational(1, 3.5);
    raise exception 'fractional denominator unexpectedly accepted';
  exception
    when invalid_parameter_value then
      null;
  end;
end;
$$;

rollback;
