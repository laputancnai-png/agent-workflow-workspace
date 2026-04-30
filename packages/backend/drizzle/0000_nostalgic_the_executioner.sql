CREATE TYPE "public"."artifact_creator_type" AS ENUM('human', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."artifact_role" AS ENUM('PRD', 'PLAN', 'TASK_LIST', 'CODE_PATCH', 'TEST_REPORT', 'REVIEW_COMMENT', 'PR_SUMMARY', 'HUMAN_EDIT');--> statement-breakpoint
CREATE TYPE "public"."artifact_status" AS ENUM('draft', 'committed', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'agent', 'runner', 'system');--> statement-breakpoint
CREATE TYPE "public"."decision_action" AS ENUM('approve', 'reject', 'request_changes', 'edit', 'take_over', 'rerun');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('pending', 'running', 'completed', 'failed', 'timed_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."runner_status" AS ENUM('online', 'offline', 'draining');--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('planner', 'tasker', 'coder', 'tester', 'reviewer', 'summarizer');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'paused', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_owner" AS ENUM('human', 'agent', 'approval_gate');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'timed_out', 'retrying', 'cancelled', 'human_owned');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('manual', 'webhook', 'api');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'contributor', 'reviewer', 'viewer');--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"step_id" text,
	"role" "artifact_role" NOT NULL,
	"status" "artifact_status" DEFAULT 'draft' NOT NULL,
	"parent_artifact_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"title" varchar(256),
	"content_inline" text,
	"blob_key" text,
	"git_commit_sha" varchar(64),
	"created_by_type" "artifact_creator_type" NOT NULL,
	"created_by_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"committed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" text,
	"target_entity" varchar(64),
	"target_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"self_hash" varchar(64) NOT NULL,
	"prev_hash" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"step_id" text NOT NULL,
	"actor_id" text,
	"action" "decision_action" NOT NULL,
	"comment" text,
	"artifact_version_id" text,
	"resulting_artifact_id" text,
	"target_step_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"step_id" text NOT NULL,
	"runner_id" text,
	"status" "agent_run_status" DEFAULT 'pending' NOT NULL,
	"agent_role" "agent_role" NOT NULL,
	"input_payload_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_payload_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checkpoint_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"timeout_seconds" integer DEFAULT 600 NOT NULL,
	"last_heartbeat_at" timestamp,
	"git_branch" varchar(256),
	"head_commit_sha" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"cancelled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "runners" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"machine_id" varchar(256) NOT NULL,
	"secret_hash" text NOT NULL,
	"status" "runner_status" DEFAULT 'offline' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_heartbeat_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"github_id" varchar(64) NOT NULL,
	"login" varchar(128) NOT NULL,
	"email" varchar(256),
	"avatar_url" text,
	"preferred_language" varchar(8) DEFAULT 'zh-CN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"template_id" text,
	"triggered_by_id" text,
	"trigger_type" "trigger_type" DEFAULT 'manual' NOT NULL,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"feature_branch" varchar(256),
	"base_commit_sha" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"owner_type" "step_owner" NOT NULL,
	"agent_role" "agent_role",
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"input_artifact_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"output_artifact_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"depends_on_step_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_retries" integer DEFAULT 2 NOT NULL,
	"retry_backoff_seconds" integer DEFAULT 30 NOT NULL,
	"execution_lock" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"name" varchar(128) NOT NULL,
	"description" text,
	"steps_json" jsonb NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"github_repo_url" text,
	"default_branch" varchar(128) DEFAULT 'main' NOT NULL,
	"preferred_model" varchar(64) DEFAULT 'claude-sonnet-4-6' NOT NULL,
	"preferred_provider" varchar(32) DEFAULT 'anthropic' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_step_id_workflow_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_step_id_workflow_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_artifact_version_id_artifacts_id_fk" FOREIGN KEY ("artifact_version_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_resulting_artifact_id_artifacts_id_fk" FOREIGN KEY ("resulting_artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_target_step_id_workflow_steps_id_fk" FOREIGN KEY ("target_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_step_id_workflow_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_runner_id_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."runners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runners" ADD CONSTRAINT "runners_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_triggered_by_id_users_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;