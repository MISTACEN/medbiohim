-- Trainer Atlas Module - Interactive histology identification with annotations
-- This provides atlas-style cards where students identify labeled structures in electron micrographs

CREATE TABLE IF NOT EXISTS trainer_atlas_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_slug VARCHAR(100),
    specialty_slug VARCHAR(50),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT, -- Google Drive or Blob URL for the base image
    blob_key VARCHAR(512), -- internal Upstash Blob key
    annotations JSONB NOT NULL DEFAULT '[]', -- Array of {id, number, label, description, x, y}
    is_published BOOLEAN DEFAULT false,
    difficulty INTEGER CHECK (difficulty >= 0 AND difficulty <= 5),
    tags TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trainer_atlas_cards_published ON trainer_atlas_cards(is_published) WHERE is_published = true;
CREATE INDEX idx_trainer_atlas_cards_subject ON trainer_atlas_cards(subject_slug) WHERE is_published = true;
CREATE INDEX idx_trainer_atlas_cards_specialty ON trainer_atlas_cards(specialty_slug) WHERE is_published = true;

-- Track student answers for each card attempt
CREATE TABLE IF NOT EXISTS trainer_atlas_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES trainer_atlas_cards(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    selected_label VARCHAR(255), -- annotation id that was clicked
    is_correct BOOLEAN NOT NULL,
    time_ms INTEGER, -- time spent viewing before answering
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trainer_atlas_answers_card ON trainer_atlas_answers(card_id);
CREATE INDEX idx_trainer_atlas_answers_user ON trainer_atlas_answers(user_id);
CREATE INDEX idx_trainer_atlas_answers_correct ON trainer_atlas_answers(is_correct) WHERE is_correct = true;

-- RLS Policies
ALTER TABLE trainer_atlas_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_atlas_answers ENABLE ROW LEVEL SECURITY;

-- Published cards visible to all authenticated users
CREATE POLICY "published_cards_read" ON trainer_atlas_cards
    FOR SELECT USING (is_published = true);

-- Users can view their own answers
CREATE POLICY "user_own_answers_read" ON trainer_atlas_answers
    FOR SELECT USING (user_id = auth.uid());

-- Insert answers for authenticated users
CREATE POLICY "user_answers_insert" ON trainer_atlas_answers
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Admin functions
CREATE OR REPLACE FUNCTION update_trainer_atlas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trainer_atlas_updated_at
    BEFORE UPDATE ON trainer_atlas_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_trainer_atlas_updated_at();
