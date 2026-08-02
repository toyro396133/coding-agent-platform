CREATE TABLE "request_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"prompt" text NOT NULL,
	"title" text,
	"repo_url" text,
	"selected_agent" text DEFAULT 'claude' NOT NULL,
	"selected_model" text,
	"install_dependencies" boolean DEFAULT false NOT NULL,
	"keep_alive" boolean DEFAULT false NOT NULL,
	"enable_browser" boolean DEFAULT false NOT NULL,
	"max_duration" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"source" text DEFAULT 'user' NOT NULL,
	"task_id" text,
	"error" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "request_queue" ADD CONSTRAINT "request_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_queue" ADD CONSTRAINT "request_queue_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_queue_user_id_idx" ON "request_queue" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "request_queue_user_position_idx" ON "request_queue" USING btree ("user_id","position");
