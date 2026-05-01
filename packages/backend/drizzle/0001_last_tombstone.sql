ALTER TABLE "workspaces" ALTER COLUMN "preferred_model" SET DEFAULT 'openclaw-local';--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "preferred_provider" SET DEFAULT 'openclaw';--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "initial_prd" text;