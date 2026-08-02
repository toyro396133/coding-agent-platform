CREATE TABLE "visual_qa_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"prompt" text NOT NULL,
	"verdict" text DEFAULT 'unknown' NOT NULL,
	"critique" text NOT NULL,
	"screenshot_base64" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visual_qa_runs" ADD CONSTRAINT "visual_qa_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visual_qa_runs" ADD CONSTRAINT "visual_qa_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visual_qa_runs_task_id_idx" ON "visual_qa_runs" USING btree ("task_id");
