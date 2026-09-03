# FridgeScanner — Product Scope

## Product definition

FridgeScanner is a food lifecycle management platform. Its domain is broader than a refrigerator inventory: it manages how food is identified, acquired, received, stored, conserved, moved, transformed, consumed, wasted and replenished inside a household boundary.

## Core scope

The platform must be able to represent:

- multiple users participating in multiple households;
- multiple storage locations per household;
- physical compartments inside storage locations;
- a reusable product catalog and multiple product identifiers;
- physical stock instances and commercial/manufacturing batches without conflating them;
- purchases and stock receipts as related but distinct concepts;
- stock movement as a traceable history rather than only a mutable quantity;
- recipes as reusable definitions and preparations as concrete executions;
- food shelf-life rules and concrete effective-expiry outcomes;
- inventory counts and reconciliation with physical reality;
- waste/disposal as explicit physical actions;
- shopping intent and replenishment policy;
- auditability and origin/provenance of relevant changes.

## Household boundary

`Household` is the primary operational data-isolation boundary. The product UI may present this concept as "Casa", but authorization and data integrity must treat it as an explicit boundary.

## Non-goals for DB-00

DB-00 does not choose the final web/mobile framework, API style, ORM, cloud provider, queue, cache, orchestration platform or deployment topology. It also does not freeze physical SQL types or indexes.

Those decisions must follow the accepted domain and database contracts rather than define them prematurely.
