CREATE TABLE `boiler_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`start_hrc` real NOT NULL,
	`start_krd` real NOT NULL,
	`end_hrc` real,
	`end_krd` real,
	`target_temp` real,
	`outside_temp` real,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `boiler_sessions_user_start_idx` ON `boiler_sessions` (`user_id`,`started_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`building_name` text DEFAULT 'Apartmanımız' NOT NULL,
	`apartment_count` integer DEFAULT 20 NOT NULL,
	`krd_alert` real DEFAULT 300 NOT NULL,
	`city` text DEFAULT 'Eti Mahallesi, Çankaya / Ankara' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_settings`("user_id", "building_name", "apartment_count", "krd_alert", "city", "updated_at") SELECT "user_id", "building_name", "apartment_count", "krd_alert", "city", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `readings` ADD `unit_price_tier2` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tariffs` ADD `price_tier2` real DEFAULT 0 NOT NULL;