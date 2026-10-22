/**
 * MEDBIOHIM Interactive Labs Types
 */

export type LabType = 
  | 'physiology'
  | 'biochemistry'
  | 'histology'
  | 'anatomy'
  | 'pharmacology';

export type LabStatus = 
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'archived';

export type CheckpointType = 
  | 'identification'
  | 'dissection'
  | 'simulation'
  | 'quiz'
  | 'calculation';

export type GradingStatus = 
  | 'pending'
  | 'auto_graded'
  | 'manual_review'
  | 'graded';

/**
 * Lab Session - individual instance of a lab completed by a student
 */
export interface LabSession {
  id: string;
  user_id: string;
  lab_type: LabType;
  lab_name: string;
  status: LabStatus;
  started_at: string;
  last_updated_at: string;
  completed_at?: string;
  progress_pct: number;
  metadata: any;
  created_at: string;
  updated_at: string;
}

/**
 * Laboratory Checkpoint - individual task within a lab session
 */
export interface Checkpoint {
  id: string;
  session_id: string;
  checkpoint_order: number;
  checkpoint_type: CheckpointType;
  title: string;
  description: string | null;
  question_snapshot: any;
  expected_answer_schema: any;
  max_points: number;
  is_mandatory: boolean;
  has_result?: boolean;
  score?: number;
  grading_status?: GradingStatus;
  feedback?: string;
  created_at: string;
}

/**
 * Laboratory Result - student answer and grade for a checkpoint
 */
export interface LabResult {
  id: string;
  checkpoint_id: string;
  user_id: string;
  submitted_at: string;
  user_answers: any[];
  score: number | null;
  max_score: number | null;
  percent_correct: number | null;
  is_correct: boolean | null;
  feedback: string | null;
  graded_by?: string;
  grading_status: GradingStatus;
  grading_notes?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Lab Material - media asset for virtual stations
 */
export interface LabMaterial {
  id: string;
  material_type: string;
  title: string;
  description: string | null;
  file_path: string;
  mime_type: string;
  size_bytes: number | null;
  thumbnail_url: string | null;
  alt_text: string | null;
  specialty_slug: string | null;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Lab Template - pre-defined lab structure
 */
export interface LabTemplate {
  id: string;
  title: string;
  subject_area: string;
  estimated_duration_min: number | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  prerequisite_lab_id: string | null;
  content_body: any;
  is_published: boolean;
  published_by?: string;
  published_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * API Response types
 */
export interface StartLabResponse {
  session: LabSession;
}

export interface LoadSessionResponse {
  session: LabSession;
  checkpoints: Checkpoint[];
  summary: {
    total: number;
    completed: number;
    progress_pct: number;
  };
}

export interface SubmitAnswerResponse {
  result: LabResult;
  is_new_submission: boolean;
  auto_graded: boolean;
}

export interface FinishSessionResponse {
  message: string;
  session: LabSession;
}

// Helper type for generic responses
export type ApiResponse<T> = {
  ok: boolean;
  data: T;
  message?: string;
};
