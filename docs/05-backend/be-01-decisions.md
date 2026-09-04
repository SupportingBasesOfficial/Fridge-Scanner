# FridgeScanner — BE-01 Decisions

## Status

This register defines the initial normative decisions for BE-01. It becomes authoritative only after the BE-01 baseline is reviewed and merged.

## B1-001 — Domain identifiers are opaque

**Decision:** domain/application identifiers are represented by branded or otherwise opaque string types with dedicated parse/validation functions.

**Rule:** public transport strings are converted at boundaries. Internal application APIs must not accept interchangeable generic strings where a specific business identifier is required.

## B1-002 — UUID parsing is canonical and boundary-owned

**Decision:** UUID-backed identifiers use one canonical parser/validator owned by the domain/contracts kernel.

**Rule:** adapters may not each invent their own UUID regular expression or normalization rule. Database adapters consume already-validated identifiers wherever the application boundary permits it.

## B1-003 — Exact values never use JavaScript `number`

**Decision:** authoritative money, quantity and rational values use exact representations backed by bigint and/or canonical decimal/integer strings according to the accepted DB model.

**Rule:** parsing through floating point, implicit numeric coercion and JSON number round-tripping are forbidden for authoritative values.

## B1-004 — Application errors are provider-neutral

**Decision:** application failures use a stable typed taxonomy owned above infrastructure.

**Rule:** PostgreSQL SQLSTATE details, Fastify errors, provider SDK exceptions and network-library errors are adapter concerns. They may be attached as internal causes but cannot define the public application error contract.

## B1-005 — Verified execution context is not client context

**Decision:** a use case that requires Household authority receives a verified application context produced only after the BE-00 authorization transaction validates current membership.

**Rule:** requested Household IDs, provider claims, cookies, JWT fields or headers cannot directly instantiate an authorized context through the ordinary public API.

## B1-006 — Use cases own semantic inputs and outputs

**Decision:** each use case exposes explicit provider-neutral input and output contracts.

**Rule:** Fastify request/reply objects, PostgreSQL clients, provider SDK models and raw database rows are forbidden as application use-case parameters or return values.

## B1-007 — Transaction ownership remains explicit

**Decision:** application operations that require atomicity execute through an explicit transaction/authorized-execution port.

**Rule:** adapters do not start hidden ambient transactions around arbitrary application work. External network calls do not run inside ordinary long-lived business database transactions.

## B1-008 — Ports express intent, not vendor APIs

**Decision:** application-owned ports are shaped around business/application capabilities.

**Rule:** a port may not simply mirror `pg`, Fastify, Supabase or another provider SDK surface. Vendor-specific options remain adapter configuration.

## B1-009 — Dependency direction is mechanically enforced

**Decision:** protected domain/application packages have a machine-checked forbidden-import policy in CI.

**Rule:** architectural boundaries are not documentation-only. A build that compiles while importing prohibited infrastructure is a failed BE-01 gate.

## B1-010 — No generic repository abstraction by default

**Decision:** BE-01 does not introduce a universal CRUD repository interface.

**Reasoning:** generic repositories tend to leak relational persistence shape upward and erase use-case semantics.

**Rule:** persistence ports are introduced only when a concrete application operation requires them, and they expose intent-specific capabilities.

## B1-011 — Read models and write models may differ

**Decision:** application query outputs do not need to reuse write/domain aggregate types when their semantics differ.

**Rule:** convenience reuse must not force transport/read concerns into domain mutation models.

## B1-012 — Serialization is explicit

**Decision:** domain values do not rely on accidental `JSON.stringify` behavior for public contracts.

**Rule:** transport adapters explicitly serialize branded identifiers and exact values into canonical strings/structures.

## B1-013 — Kernel tests are semantic

**Decision:** BE-01 tests must prove invalid states are difficult or impossible to represent and that exact/authority semantics survive round trips.

**Rule:** typecheck-only coverage is insufficient for runtime parsing, serialization, exact arithmetic/value behavior and error mapping.

## B1-014 — Proving slice is deliberately narrow

**Decision:** at most one narrow vertical slice is introduced to prove domain → application → adapter → HTTP wiring during BE-01.

**Rule:** the slice cannot expand into broad feature CRUD before the kernel gate is accepted.

## B1-015 — Accepted upstream contracts remain authoritative

**Decision:** DB-00, DB-01, DB-02 and BE-00 remain the source of truth for invariants, schema enforcement, authorization bootstrap, runtime and infrastructure boundaries.

**Rule:** if BE-01 reveals a contradiction, it is recorded and governed explicitly. The kernel may not silently weaken upstream contracts for developer convenience.
