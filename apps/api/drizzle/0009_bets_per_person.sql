CREATE TABLE `bets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`text` text NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Bisher gab es einen Einsatz pro Team. Jetzt hat jede Person ihren eigenen: der bisherige gilt für beide weiter.
INSERT INTO `bets_new` (`id`, `team_id`, `user_id`, `text`, `effective_from`, `created_at`)
SELECT b.`id` || '-' || m.`user_id`, b.`team_id`, m.`user_id`, b.`text`, b.`effective_from`, b.`created_at`
FROM `bets` b JOIN `memberships` m ON m.`team_id` = b.`team_id`;
--> statement-breakpoint
DROP TABLE `bets`;
--> statement-breakpoint
ALTER TABLE `bets_new` RENAME TO `bets`;
--> statement-breakpoint
CREATE UNIQUE INDEX `bets_user_effective` ON `bets` (`user_id`,`effective_from`);
