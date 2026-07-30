CREATE TABLE "checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"file_states" jsonb NOT NULL,
	"metadata" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "worker_team_config" jsonb;--> statement-breakpoint
ALTER TABLE "checkpoints" ADD CONSTRAINT "checkpoints_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkpoints_task_id_idx" ON "checkpoints" USING btree ("task_id");--> statement-breakpoint
ALTER TABLE "task_plans" ADD CONSTRAINT "task_plans_task_id_version_unique" UNIQUE("task_id","version");