-- MEDBIOHIM — Schedule Versioning and Save RPC
-- Used by admin operations to safely save schedule updates with rollback capability
-- Date: 2026-10-22

CREATE OR REPLACE FUNCTION schedules.medbiohim_version_and_save_schedule(
    p_user_id UUID,
    p_schedule_id UUID,
    p_entries JSONB[],
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    new_version INTEGER,
    new_id UUID
) AS $$
DECLARE
    v_current_version INTEGER;
    v_new_version INTEGER;
    v_schedule_entry_id UUID;
    v_entry_json JSONB;
    v_entry_data RECORD;
BEGIN
    -- Start transaction for atomicity
    BEGIN
        -- Get current max version
        SELECT COALESCE(MAX(version), 0) INTO v_current_version
        FROM schedules.schedule_versions
        WHERE schedule_id = p_schedule_id;
        
        -- Calculate new version
        v_new_version := v_current_version + 1;
        
        -- Insert new version record
        INSERT INTO schedules.schedule_versions (
            schedule_id,
            version,
            created_by,
            notes,
            created_at
        ) VALUES (
            p_schedule_id,
            v_new_version,
            p_user_id,
            p_notes,
            NOW()
        )
        RETURNING id INTO v_schedule_entry_id;
        
        -- Delete old entries for this schedule version (soft delete logic)
        UPDATE schedule_entries
        SET archived_at = NOW(),
            archived_version = v_new_version
        WHERE schedule_id = p_schedule_id 
        AND archived_at IS NULL;
        
        -- Process each entry from input array
        FOR i IN 1..array_length(p_entries, 1) LOOP
            v_entry_json := p_entries[i];
            
            -- Extract fields from JSON
            WITH entry_data AS (
                SELECT 
                    (v_entry_json->>'id')::UUID as existing_id,
                    (v_entry_json->>'date')::DATE as entry_date,
                    (v_entry_json->>'subject_id')::UUID as subject_id,
                    (v_entry_json->>'teacher_id')::UUID as teacher_id,
                    (v_entry_json->>'room') as room,
                    (v_entry_json->>'start_time')::TIME as start_time,
                    (v_entry_json->>'end_time')::TIME as end_time,
                    (v_entry_json->>'lesson_type') as lesson_type,
                    (v_entry_json->>'topic') as topic,
                    (v_entry_json->>'group_ids'::TEXT[]|>'{}') as group_ids,
                    (v_entry_json->>'is_canceled')::BOOLEAN as is_canceled,
                    (v_entry_json->>'metadata'::JSONB|>'description') as description,
                    (v_entry_json->>'metadata'::JSONB|>'materials_required') as materials_required,
                    (v_entry_json->>'metadata'::JSONB|>'learning_objectives' as learning_objectives
                ) as extracted_data
            )
            INSERT INTO schedule_entries (
                id,
                schedule_id,
                date,
                subject_id,
                teacher_id,
                room,
                start_time,
                end_time,
                lesson_type,
                topic,
                status,
                created_at,
                updated_at
            )
            SELECT 
                COALESCE(existing_id, gen_random_uuid()),
                p_schedule_id,
                entry_date,
                subject_id,
                teacher_id,
                room,
                start_time,
                end_time,
                lesson_type,
                topic,
                CASE WHEN is_canceled THEN 'canceled' ELSE 'scheduled' END,
                NOW(),
                NOW()
            FROM entry_data
            ON CONFLICT (schedule_id, date, subject_id) DO UPDATE
            SET 
                room = EXCLUDED.room,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                lesson_type = EXCLUDED.lesson_type,
                topic = EXCLUDED.topic,
                status = CASE WHEN EXCLUDED.is_canceled THEN 'canceled' ELSE 'scheduled' END,
                updated_at = NOW();
        END LOOP;
        
        -- Return success
        RETURN QUERY
        SELECT 
            true as success,
            'Расписание успешно сохранено' as message,
            v_new_version as new_version,
            v_schedule_entry_id as new_id;
            
    EXCEPTION WHEN OTHERS THEN
        -- Rollback on error
        RAISE;
        
        RETURN QUERY
        SELECT 
            false as success,
            SQLERRM as message,
            v_new_version,
            NULL::UUID as new_id;
    END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION schedules.medbiohim_version_and_save_schedule IS
    'Version-safe schedule saving with rollback capability. Creates new version of schedule, archives old entries, inserts new ones atomically.';

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_schedule_versions_schedule_id 
    ON schedules.schedule_versions(schedule_id DESC);

CREATE INDEX IF NOT EXISTS idx_schedule_versions_version ON schedules.schedule_versions(version);
