ALTER TABLE "tasks" ADD COLUMN "execution_mode" text DEFAULT 'orchestrator_external' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'he' NOT NULL;