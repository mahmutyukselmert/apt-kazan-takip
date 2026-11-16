CREATE TABLE IF NOT EXISTS `limit_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`per_home_limit` real NOT NULL,
	`source_label` text DEFAULT '' NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `limit_versions_user_month_idx` ON `limit_versions` (`user_id`,`year`,`month`,`effective_from`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `limit_versions_user_exact_idx` ON `limit_versions` (`user_id`,`effective_from`,`year`,`month`);
--> statement-breakpoint
INSERT OR IGNORE INTO `limit_versions` (`user_id`,`effective_from`,`year`,`month`,`per_home_limit`,`source_label`,`source_url`,`note`,`created_at`) VALUES
('local-demo','2026-04-04',2026,1,344.73,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,2,326.80,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,3,302.09,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,4,180.69,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,5,109.01,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,6,46.20,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,7,35.19,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,8,31.03,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,9,40.69,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,10,76.86,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','İlk yayımlanan Ankara hane başı aylık limit','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,11,161.63,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','Önceki Kasım limiti; geçmiş kayıt olarak korunur','2026-10-31T00:00:00.000Z'),
('local-demo','2026-04-04',2026,12,284.25,'BOTAŞ 4 Nisan 2026 limit listesi','https://www.botas.gov.tr/uploads/dosyaYoneticisi/325499-kfu_limitler.pdf','Önceki Aralık limiti; geçmiş kayıt olarak korunur','2026-10-31T00:00:00.000Z'),
('local-demo','2026-10-31',2026,11,283.78,'BOTAŞ Kasım-Aralık 2026 güncellemesi','https://www.botas.gov.tr/Sayfa/4-nisan-2026-tarihinden-itibaren-gecerli-botas-dogal-gaz-toptan-satis-fiyat-tarifesi/812','31.10.2026 tarihinde duyurulan güncel Ankara Kasım limiti','2026-10-31T12:00:00.000Z'),
('local-demo','2026-10-31',2026,12,420.00,'BOTAŞ Kasım-Aralık 2026 güncellemesi','https://www.botas.gov.tr/Sayfa/4-nisan-2026-tarihinden-itibaren-gecerli-botas-dogal-gaz-toptan-satis-fiyat-tarifesi/812','31.10.2026 tarihinde duyurulan güncel Ankara Aralık limiti','2026-10-31T12:00:00.000Z');
