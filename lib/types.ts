export interface SearchResult {
  fileName: string
  functionName?: string
  codeSnippet: string
  summary: string
  linesOfCode?: number
  language?: string
  tags?: string[]
  mode?: SearchMode
  similarity?: number
  filePath: string
  content: string
  fileExtension?: string
  lineNumber?: number
}

export interface RawZillizHit {
  content: string;
  filePath?: string;
  sessionId: string;
  score?: number; // Zilliz might return 'score' or 'similarity'
  similarity?: number;
  lineNumber?: number;
}

export interface ZillizSearchResponse {
  status: any; // You might want to define a more specific interface for status
  results: RawZillizHit[];
  recalls: any[];
  session_ts: string;
  collection_name: string;
  all_search_count: string;
}

export interface UploadResponse {
  sessionId: string
}

export interface SearchRequest {
  sessionId: string
  queryText: string
  mode?: SearchMode
}

export interface SearchResponse {
  results: SearchResult[]
}

export interface ClearSessionRequest {
  sessionId: string
}

export interface ClearSessionResponse {
  message: string
}

export interface ChatMessage {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
}

export interface FileItem {
  path: string
  name: string
  language: string
  functions: string[]
}

export interface GraphNode {
  id: string
  label: string
  type: "file" | "function" | "class"
  language: string
  x: number
  y: number
  connections: string[]
}

export interface BuildStep {
  id: string
  title: string
  description: string
  command?: string
  explanation: string
  status: "pending" | "completed" | "current"
  troubleshooting?: string[]
}

export interface ProjectAnalysis {
  language: string
  framework?: string
  packageManager: string
  dependencies: string[]
  buildSteps: BuildStep[]
  keyFiles: FileItem[]
  environment: string[]
}

export type SearchMode = "build-understand" | "search" | "summarize" | "chat" | "visualize"
