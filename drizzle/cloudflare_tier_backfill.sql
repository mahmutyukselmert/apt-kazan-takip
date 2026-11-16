INSERT INTO `tariffs`
  (`user_id`, `effective_from`, `price_per_m3`, `price_tier2`, `label`, `created_at`)
VALUES
  ('local-demo', '2026-10-01', 17.3616228, 26.2116228, 'Başkentgaz Ekim 2026 · KDV dahil', '2026-10-30T00:00:00.000Z')
ON CONFLICT (`user_id`, `effective_from`) DO UPDATE SET
  `price_per_m3` = excluded.`price_per_m3`,
  `price_tier2` = excluded.`price_tier2`,
  `label` = excluded.`label`;

UPDATE `readings`
SET
  `unit_price` = 17.3616228,
  `unit_price_tier2` = 26.2116228
WHERE `user_id` = 'local-demo'
  AND `read_at` >= '2026-10-01';
