-- MEDBIOHIM Interactive Labs Module
-- Migration for Phase 3: Virtual Dissection Station & Lab Simulations
-- Date: 2026-10-22

-- Create schema for interactive labs if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nname = 'labs') THEN
    CREATE SCHEMA labs;
  END IF;
END
$$;

-- Table: lab_sessions - tracks user progress through labs
CREATE TABLE IF NOT EXISTS labs.lab_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lab_type VARCHAR(50) NOT NULL CHECK (lab_type IN ('physiology', 'biochemistry', 'histology', 'anatomy', 'pharmacology')),
    lab_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' 
        CHECK (status IN ('not_started', 'in_progress', 'completed', 'archived')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    progress_pct INTEGER CHECK (progress_pct >= 0 AND progress_pct <= 100),
    metadata JSONB DEFAULT '{}', -- flexible per-lab data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, lab_name, started_at)
);

-- Table: lab_checkpoints - individual tasks/questions within a lab
CREATE TABLE IF NOT EXISTS labs.laboratory_checkpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES labs.lab_sessions(id) ON DELETE CASCADE,
    checkpoint_order INTEGER NOT NULL,
    checkpoint_type VARCHAR(50) NOT NULL 
        CHECK (checkpoint_type IN ('identification', 'dissection', 'simulation', 'quiz', 'calculation')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    question_snapshot JSONB, -- embedded question/options if applicable
    expected_answer_schema JSONB, -- validation rules
    max_points DECIMAL(5,2) DEFAULT 10.0,
    is_mandatory BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: lab_results - student answers and scoring for each checkpoint
CREATE TABLE IF NOT EXISTS labs.laboratory_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkpoint_id UUID NOT NULL REFERENCES labs.laboratory_checkpoints(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_answers JSONB[], -- [{question, answer, reasoning, attachments}]
    score DECIMAL(6,4),
    max_score DECIMAL(6,4),
    percent_correct DECIMAL(5,2),
    is_correct BOOLEAN DEFAULT false,
    feedback TEXT, -- automated or teacher feedback
    graded_by UUID REFERENCES auth.users(id), -- who graded this (staff/user)
    grading_status VARCHAR(20) DEFAULT 'pending'
        CHECK (grading_status IN ('pending', 'auto_graded', 'manual_review', 'graded')),
    grading_notes TEXT,
    version INTEGER DEFAULT 1, -- allow re-submission tracking
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT positive_score CHECK (score >= 0),
    CONSTRAINT valid_percent CHECK (percent_correct >= 0 AND percent_correct <= 100)
);

-- Table: lab_materials - media assets for virtual stations
CREATE TABLE IF NOT EXISTS labs.lab_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_type VARCHAR(50) NOT NULL 
        CHECK (material_type IN ('microscopy_image', 'electronogram', 'diagram', 'video', 'audio', '3d_model')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_path VARCHAR(500) NOT NULL, -- Upstash Blob key
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT,
    thumbnail_url TEXT,
    alt_text VARCHAR(500),
    specialty_slug VARCHAR(50), -- optional specialization filter
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: lab_templates - pre-defined lab structures
CREATE TABLE IF NOT EXISTS labs.lab_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    subject_area VARCHAR(50) NOT NULL,
    estimated_duration_min INTEGER,
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    prerequisite_lab_id UUID, -- references another lab template (if chained)
    content_body JSONB, -- structured lab definition
    is_published BOOLEAN DEFAULT false,
    published_by UUID REFERENCES auth.users(id),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_sessions_user_status ON labs.lab_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_lab_sessions_last_updated ON labs.lab_sessions(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_results_checkpoint ON labs.laboratory_results(checkpoint_id);
CREATE INDEX IF NOT EXISTS idx_lab_results_user_submitted ON labs.laboratory_results(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_materials_type ON labs.lab_materials(material_type) WHERE is_active = true;

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION trigger_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_lab_sessions_timestamp
    BEFORE UPDATE ON labs.lab_sessions
    FOR EACH ROW EXECUTE FUNCTION trigger_update_timestamp();

CREATE TRIGGER update_lab_results_timestamp
    BEFORE UPDATE ON labs.laboratory_results
    FOR EACH ROW EXECUTE FUNCTION trigger_update_timestamp();

-- Enable RLS on all tables
ALTER TABLE labs.lab_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs.laboratory_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs.laboratory_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs.lab_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE labs.lab_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own sessions
CREATE POLICY "Users can view own lab sessions"
    ON labs.lab_sessions FOR SELECT
    USING (auth.uid() = user_id);

-- Staff can view all sessions (based on role)
CREATE POLICY "Staff can view all lab sessions"
    ON labs.lab_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = auth.uid()
            AND r.code IN ('teacher', 'moderator', 'admin')
        )
    );

-- Users can insert their own sessions
CREATE POLICY "Users can create lab sessions"
    ON labs.lab_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update only their own sessions
CREATE POLICY "Users can update own lab sessions"
    ON labs.lab_sessions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Staff policies (similar structure, adjust as needed)
-- ... additional policies for staff would go here

-- Function: update_session_progress
-- Automatically updates progress_pct based on completed checkpoints
CREATE OR REPLACE FUNCTION labs.update_session_progress(session_id_param UUID)
RETURNS VOID AS $$
DECLARE
    total_checkpoints INTEGER;
    completed_checkpoints INTEGER;
    new_progress_pct INTEGER;
BEGIN
    -- Count total checkpoints for this session
    SELECT COUNT(*) INTO total_checkpoints
    FROM labs.laboratory_checkpoints lc
    JOIN labs.laboratory_results lr ON lc.id = lr.checkpoint_id
    WHERE lc.session_id = session_id_param
    AND lr.grading_status = 'graded';
    
    -- Get total checkpoints regardless of completion
    SELECT COUNT(*) INTO total_checkpoints
    FROM labs.laboratory_checkpoints
    WHERE session_id = session_id_param;
    
    IF total_checkpoints > 0 THEN
        new_progress_pct := ROUND((completed_checkpoints::DECIMAL / total_checkpoints::DECIMAL) * 100);
        
        -- Update session with new progress
        UPDATE labs.lab_sessions
        SET 
            progress_pct = new_progress_pct,
            last_updated_at = NOW(),
            completed_at = CASE WHEN new_progress_pct >= 100 THEN NOW() ELSE completed_at END,
            status = CASE WHEN new_progress_pct >= 100 THEN 'completed' ELSE 'in_progress' END
        WHERE id = session_id_param;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: auto_grading_checker
-- Simple auto-grading function for multiple-choice questions
CREATE OR REPLACE FUNCTION labs.auto_grade_result(result_record labs.laboratory_results%ROWTYPE)
RETURNS void AS $$
DECLARE
    checkpoint_data JSONB;
    expected_answers TEXT[];
    user_answer JSONB;
    is_correct BOOLEAN;
BEGIN
    -- This would normally load checkpoint schema and validate against expected format
    -- Simplified example:
    
    -- Check if answer exists in expected_options array
    IF result_record.user_answers IS NOT NULL AND jsonb_array_length(result_record.user_answers) > 0 THEN
        user_answer := result_record.user_answers[0];
        
        -- Example logic for single-answer MCQ
        -- In production, this would be more sophisticated
        is_correct := TRUE; -- placeholder for actual validation logic
        
        result_record.is_correct := is_correct;
        result_record.percent_correct := CASE WHEN is_correct THEN 100.0 ELSE 0.0 END;
        result_record.grad ing_status := 'auto_graded';
        
        UPDATE labs.laboratory_results
        SET 
            score = CASE WHEN is_correct THEN result_record.max_score ELSE 0 END,
            percent_correct = result_record.percent_correct,
            grading_status = 'auto_graded',
            updated_at = NOW()
        WHERE id = result_record.id;
        
        -- Trigger progress update
        PERFORM labs.update_session_progress((SELECT session_id FROM labs.laboratory_checkpoints WHERE id = result_record.checkpoint_id));
    END IF;
END;
$$ LANGUAGE plpgsql;

-- View: lab_session_summary
-- Aggregated view of session progress and stats
CREATE VIEW labs.vw_lab_session_summary AS
SELECT 
    ls.id,
    ls.lab_name,
    ls.lab_type,
    ls.status,
    ls.progress_pct,
    ls.started_at,
    ls.completed_at,
    COUNT(DISTINCT lrc.id) AS total_checkpoints,
    SUM(CASE WHEN lrg.grading_status = 'graded' THEN 1 ELSE 0 END) AS completed_checkpoints,
    COALESCE(SUM(lrg.score), 0) AS total_score,
    AVG(lrg.percent_correct) AS avg_accuracy
FROM labs.lab_sessions ls
LEFT JOIN labs.laboratory_checkpoints lrc ON ls.id = lrc.session_id
LEFT JOIN labs.laboratory_results lrg ON lrc.id = lrg.checkpoint_id
GROUP BY ls.id;

COMMENT ON TABLE labs.lab_sessions IS 'Tracks individual lab session instances created when students start a lab';
COMMENT ON TABLE labs.laboratory_checkpoints IS 'Individual tasks/questions within a specific lab session';
COMMENT ON TABLE labs.laboratory_results IS 'Student answers and grades for each checkpoint';
COMMENT ON TABLE labs.lab_materials IS 'Media assets and reference materials for labs';
COMMENT ON TABLE labs.lab_templates IS 'Pre-defined lab structures that can be instantiated';
