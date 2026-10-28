ALTER TABLE `users` ADD `color` text DEFAULT 'ember' NOT NULL;--> statement-breakpoint
-- Bestehende Konten: Platz 2 im Team bekommt den Standard Tide, damit beide verschiedene Farben haben
UPDATE `users` SET `color` = 'tide' WHERE `id` IN (SELECT `user_id` FROM `memberships` WHERE `slot` = 2);
