DROP INDEX `checkins_user_day`;--> statement-breakpoint
CREATE INDEX `checkins_user_day_idx` ON `checkins` (`user_id`,`local_date`);