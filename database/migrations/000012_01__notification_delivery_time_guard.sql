-- FridgeScanner DB-02
-- 000012_01__notification_delivery_time_guard.sql
-- PostgreSQL 17.x baseline; core PostgreSQL only.

begin;

alter table fridge.notification_delivery
  drop constraint notification_delivery_delivered_after_attempt,
  add constraint notification_delivery_delivered_after_attempt
  check (
    delivered_at is null
    or (
      attempted_at is not null
      and delivered_at >= attempted_at
    )
  );

comment on constraint notification_delivery_delivered_after_attempt
  on fridge.notification_delivery is
  'A delivered timestamp requires an attempt timestamp and cannot precede that attempt.';

commit;
