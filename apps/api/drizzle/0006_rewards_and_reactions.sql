CREATE TABLE `reactions` (
	`checkin_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`checkin_id`, `user_id`),
	FOREIGN KEY (`checkin_id`) REFERENCES `checkins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `reward_claims` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`week_start` text NOT NULL,
	`recipient_id` text NOT NULL,
	`giver_id` text NOT NULL,
	`reward_text` text NOT NULL,
	`created_at` integer NOT NULL,
	`redeemed_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`giver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reward_claims_team_idx` ON `reward_claims` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reward_claims_recipient_week` ON `reward_claims` (`recipient_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`giver_id` text NOT NULL,
	`text` text NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`giver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rewards_giver_effective` ON `rewards` (`giver_id`,`effective_from`);