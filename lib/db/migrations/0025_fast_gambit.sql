CREATE TABLE "background_test_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"test_id" text NOT NULL,
	"status" text NOT NULL,
	"logs" text,
	"remediation_patch" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "background_test_executions" ADD CONSTRAINT "background_test_executions_test_id_background_tests_bank_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."background_tests_bank"("id") ON DELETE cascade ON UPDATE no action;