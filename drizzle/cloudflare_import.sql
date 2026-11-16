INSERT OR REPLACE INTO `settings`
  (`user_id`, `building_name`, `apartment_count`, `krd_alert`, `city`, `updated_at`)
VALUES
  ('local-demo', 'SEMA APARTMANI', 25, 300, 'Eti Mahallesi, Çankaya / Ankara', '2026-10-27T19:29:03.859Z');

INSERT OR REPLACE INTO `tariffs`
  (`id`, `user_id`, `effective_from`, `price_per_m3`, `label`, `created_at`)
VALUES
  (1, 'local-demo', '2026-01-01', 14.1, 'Başlangıç taslağı – doğrulayın', '2026-10-27T19:10:54.675Z');

INSERT OR REPLACE INTO `readings`
  (`id`, `user_id`, `read_at`, `hrc`, `krd`, `boiler_temp`, `outside_temp`, `boiler_status`, `unit_price`, `note`, `created_at`)
VALUES
  (1, 'local-demo', '2026-10-27T15:24', 11.8, 2737.4, 0, 14, 'off', 14.1, 'test yapıldı sayaç değişimi.', '2026-10-27T19:16:03.563Z');
