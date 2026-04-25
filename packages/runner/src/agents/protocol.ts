export interface AgentRequest {
  type: 'run';
  agent_run_id: string;
  step_id: string;
  agent_role: string;
  input_artifacts: Array<{ id: string; role: string; content: string }>;
  preferred_provider: string;
  checkpoint_data?: Record<string, unknown>;
  config: {
    repo_path: string;
    feature_branch: string;
    max_tokens_budget: number;
    providers: Record<string, unknown>;
  };
}

export interface AgentResponse {
  type: 'complete' | 'fail' | 'checkpoint';
  agent_run_id: string;
  output_artifacts?: Array<{ role: string; content: string; git_commit_sha?: string }>;
  checkpoint_data?: Record<string, unknown>;
  tokens_used?: number;
  error_code?: string;
  error_message?: string;
  retryable?: boolean;
}
