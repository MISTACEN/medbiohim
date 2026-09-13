-- Phase C+ : tests and homework (apply after 001)

CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  topic_id UUID REFERENCES public.topics(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  answer_key TEXT,
  difficulty INT DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  time_limit_sec INT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score NUMERIC(5,2),
  max_score NUMERIC(5,2),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress'
);

CREATE TABLE IF NOT EXISTS public.homeworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES public.homeworks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_id UUID REFERENCES public.files(id),
  text_answer TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  grade NUMERIC(5,2),
  teacher_comment TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (homework_id, user_id)
);
