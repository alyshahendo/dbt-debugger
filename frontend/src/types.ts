export interface TestResult {
  unique_id: string;
  name: string;
  test_type?: string;
  column_name?: string | null;
  status: string | null;
  failures?: number | null;
}

export interface Column {
  name: string;
  data_type?: string | null;
}

export interface GraphNode {
  id: string;
  name: string;
  resource_type: 'model' | 'source';
  status?: string | null;
  failure_class?: string;
  test_status?: string | null;
  materialization?: string | null;
  path?: string | null;
  lane: number;
  freshness_status?: string | null;
  freshness_age_seconds?: number | null;
  execution_time?: number | null;
  completed_at?: string | null;
  message?: string | null;
  blamed_root_cause?: string | null;
  columns?: Column[];
  tests?: TestResult[];
}

export interface Graph {
  command: string;
  nodes: GraphNode[];
  edges: { source: string; target: string }[];
  summary: {
    models: number;
    sources: number;
    by_failure_class: Record<string, number>;
    root_causes: string[];
    failing_tests: number;
    stale_sources: number;
  };
}
