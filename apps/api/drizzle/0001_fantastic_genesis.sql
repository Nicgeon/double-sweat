CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`local_date` text NOT NULL,
	`week_start` text NOT NULL,
	`tz` text NOT NULL,
	`photo_key` text NOT NULL,
	`thumb_key` text NOT NULL,
	`photo_sha256` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`bytes` integer NOT NULL,
	`note` text,
	`tag` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checkins_team_week_idx` ON `checkins` (`team_id`,`week_start`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_user_day` ON `checkins` (`user_id`,`local_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkins_team_photo` ON `checkins` (`team_id`,`photo_sha256`);--> statement-breakpoint
CREATE TABLE `weekly_goals` (
	`user_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`days` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `effective_from`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "weekly_goals_days_range" CHECK("weekly_goals"."days" BETWEEN 1 AND 7)
);
