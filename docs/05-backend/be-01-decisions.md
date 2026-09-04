# FridgeScanner — BE-01 Decisions

## Status

This register contains BE-01 application/domain decisions. They are subordinate to accepted DB-00/DB-01/DB-02/BE-00 and become authoritative only when BE-01 is accepted.

## B1-001 — Domain package boundary

**Decision:** core domain value semantics live in a dedicated `@fridge/domain` package with no infrastructure/runtime/provider dependencies.

**Rule:** domain may not import Fastify, `pg`, Zod transport schemas, Supabase/provider SDKs, queue clients or deployment APIs.

## B1-002 — Identifier semantics

**Decision:** canonical entity/context identifiers are nominally branded UUID values rather than interchangeable plain strings.

**Rule:** parsing/validation occurs at a boundary. A Household ID cannot be substituted for a Product, Batch or principal ID merely because the wire representation is a string.

## B1-003 — Exact rational values

**Decision:** authoritative fractional quantities use arbitrary-precision `bigint` numerator/denominator pairs normalized to a unique canonical form.

**Rules:** denominator is never zero; denominator is always positive; zero normalizes to `0/1`; common divisors are removed; no JavaScript binary floating point participates in authoritative arithmetic.

## B1-004 — Money values

**Decision:** authoritative money uses exact integer minor units plus explicit currency.

**Rule:** arithmetic across different currencies fails closed. Formatting/decimal display is a delivery concern and does not redefine the authoritative value.

## B1-005 — Time values

**Decision:** domain/application time crosses boundaries as explicit UTC instants rather than ambient local `Date` state.

**Rule:** local timezone interpretation belongs to explicit business policies or delivery/presentation adapters. Ambiguous timestamps are rejected at the kernel boundary.

## B1-006 — Domain errors

**Decision:** domain failures use stable provider-neutral classifications.

**Rule:** SQL/provider/framework messages are never domain error contracts. Delivery adapters may map stable application/domain classifications to transport responses without leaking internal causes.

## B1-007 — Feature restraint

**Decision:** BE-01 establishes reusable kernel/application contracts before feature CRUD.

**Rule:** feature implementation may not be pulled into BE-01 merely to make the phase appear product-complete. Minimal fixtures are acceptable only to prove structural contracts.
