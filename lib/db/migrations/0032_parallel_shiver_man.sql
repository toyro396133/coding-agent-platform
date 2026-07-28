CREATE TABLE "project_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repo_url" text NOT NULL,
	"rule_content" text NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"source_task_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"repo_url" text NOT NULL,
	"file_path" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"plan_content" jsonb NOT NULL,
	"hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_rules" ADD CONSTRAINT "project_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_rules" ADD CONSTRAINT "project_rules_source_task_id_tasks_id_fk" FOREIGN KEY ("source_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_embeddings" ADD CONSTRAINT "repository_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_plans" ADD CONSTRAINT "task_plans_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_rules_user_repo_idx" ON "project_rules" USING btree ("user_id","repo_url");--> statement-breakpoint
CREATE INDEX "repository_embeddings_user_repo_idx" ON "repository_embeddings" USING btree ("user_id","repo_url");--> statement-breakpoint
CREATE INDEX "repository_embeddings_idx" ON "repository_embeddings" USING hnsw ("embedding" vector_cosine_ops);