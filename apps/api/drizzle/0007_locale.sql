ALTER TABLE `notifications` ADD `params_json` text;--> statement-breakpoint
ALTER TABLE `users` ADD `locale` text DEFAULT 'de' NOT NULL;