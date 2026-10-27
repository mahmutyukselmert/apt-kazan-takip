CREATE TABLE `readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text NOT NULL,
	`hrc` real NOT NULL,
	`krd` real NOT NULL,
	`boiler_temp` real,
	`outside_temp` real,
	`boiler_status` text DEFAULT 'on' NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `readings_user_date_idx` ON `readings` (`user_id`,`read_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `readings_user_exact_date_idx` ON `readings` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`building_name` text DEFAULT 'Apartmanımız' NOT NULL,
	`apartment_count` integer DEFAULT 20 NOT NULL,
	`krd_alert` real DEFAULT 300 NOT NULL,
	`city` text DEFAULT 'Ankara' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tariffs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`price_per_m3` real NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tariffs_user_date_idx` ON `tariffs` (`user_id`,`effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `tariffs_user_exact_date_idx` ON `tariffs` (`user_id`,`effective_from`);