CREATE TABLE `bets` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`text` text NOT NULL,
	`effective_from` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bets_team_effective` ON `bets` (`team_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`week_start` text NOT NULL,
	`debtor_id` text NOT NULL,
	`creditor_id` text NOT NULL,
	`bet_text` text NOT NULL,
	`created_at` integer NOT NULL,
	`redeemed_at` integer,
	`redeemed_by` text,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`debtor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creditor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`redeemed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `debts_team_idx` ON `debts` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `debts_debtor_week` ON `debts` (`debtor_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `week_results` (
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`week_start` text NOT NULL,
	`tz` text NOT NULL,
	`goal_days` integer,
	`done_days` integer NOT NULL,
	`met` integer,
	`settled_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `week_start`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `week_results_team_week_idx` ON `week_results` (`team_id`,`week_start`);