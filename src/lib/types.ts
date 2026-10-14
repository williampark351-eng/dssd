export type ApplicationState =
  | 'DISCOVERED' | 'MATCHED' | 'QUEUED' | 'PREPARING' | 'READY_FOR_REVIEW' | 'SUBMITTING' | 'SUBMITTED'
  | 'CONFIRMED' | 'NEEDS_USER_ACTION' | 'BLOCKED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN_SUBMISSION_RESULT';

export type ApplyMode = 'manual' | 'assisted' | 'auto';

export type Weights = {
  experience: number; skills: number; title: number; location: number; seniority: number; compensation: number; other: number;
};

export type Profile = {
  id: string; email: string; full_name: string; headline: string; phone: string; location: string;
  linkedin_url: string; portfolio_url: string; years_experience: number; work_authorization: string;
  requires_sponsorship: boolean; willing_to_relocate: boolean; onboarding_complete: boolean; is_platform_admin: boolean;
};

export type Preferences = {
  user_id: string; target_titles: string[]; locations: string[]; work_arrangements: string[]; seniority_levels: string[];
  industries: string[]; employment_types: string[]; keywords: string[]; excluded_companies: string[]; min_salary: number;
  salary_currency: string; weights: Weights; apply_mode: ApplyMode; auto_apply_consent_at: string | null; auto_min_score: number;
  daily_quota: number; automation_paused: boolean; generate_cover_letters: boolean;
  watch_words: string[]; watch_notify: boolean; feed_read_at: string | null;
};

export type Experience = { title: string; company: string; location: string; start: string; end: string; bullets: string[] };
export type Education = { degree: string; school: string; start: string; end: string; details: string };
export type ParsedResume = {
  contact: { name: string; email: string; phone: string; linkedin: string; website: string; location: string };
  summary: string; experience: Experience[]; education: Education[]; skills: string[]; certifications: string[];
  accomplishments: string[]; estimated_years: number;
};

export type Resume = {
  id: string; name: string; target_category: string; file_path: string | null; file_name: string | null; file_type: string | null;
  raw_text: string; parsed: Partial<ParsedResume>; parse_status: 'pending' | 'parsed' | 'failed' | 'manual'; parse_error: string | null;
  reviewed: boolean; is_primary: boolean; created_at: string; updated_at: string;
};

export type LibraryAnswer = { id: string; question: string; answer: string; category: string; sensitive: boolean; approved: boolean; updated_at: string };

export type JobSource = {
  id: string; provider: 'greenhouse' | 'lever' | 'ashby' | 'workday'; board_token: string; company_name: string;
  active: boolean; last_synced_at: string | null; last_error: string | null; last_job_count: number;
};

export type Job = {
  id: string; provider: string; board_token: string; external_id: string; title: string; company: string; location: string;
  work_arrangement: string; department: string; employment_type: string; seniority: string; salary_min: number | null;
  salary_max: number | null; salary_currency: string | null; description: string; url: string; apply_url: string | null;
  dedupe_key: string; status: 'active' | 'expired'; posted_at: string | null; first_seen_at: string; last_seen_at: string;
};

export type Match = {
  id: string; job_id: string; score: number; eligible: boolean; ineligible_reasons: string[];
  breakdown: Record<keyof Weights, number>;
  explanation: { reasons: string[]; satisfied: string[]; missing: string[]; unknown: string[] };
  saved: boolean; dismissed: boolean; computed_at: string; job?: Job;
};

export type PacketAnswer = {
  question: string; field: string; answer: string; source: string; required: boolean; sensitive: boolean; type: string;
  options?: { label: string; value: string }[];
};

export type EvidenceLevel = 'none' | 'user_reported' | 'provider_accepted' | 'receipt_verified' | 'employer_response_verified';

export type Application = {
  id: string; job_id: string; match_score: number; state: ApplicationState; mode: ApplyMode; resume_id: string | null;
  resume_snapshot: { id: string; name: string; file_name: string | null; parsed: Partial<ParsedResume>; reviewed?: boolean } | null;
  tailoring_notes: string[]; cover_letter: string; answers: PacketAnswer[]; prepared_at: string | null; user_approved_at: string | null;
  submission_method: 'provider_api' | 'manual_user_reported' | null; evidence_level: EvidenceLevel; submitted_at: string | null; confirmed_at: string | null;
  receipt_id: string | null; confirmation_evidence: Record<string, unknown>; employer_response: string; employer_response_at: string | null;
  employer_response_note: string; required_action: string | null; required_action_kind: string | null; last_error: string | null;
  attempts: number; next_attempt_at: string | null; created_at: string; updated_at: string; job?: Job;
};

export type AppEvent = { id: string; from_state: string | null; to_state: string | null; actor: string; message: string; data: Record<string, unknown>; created_at: string };

export type Contact = {
  id: string; company: string; name: string; title: string; email: string; linkedin_url: string; source: string; opted_out: boolean; notes: string; created_at: string;
};

export type OutreachMessage = {
  id: string; application_id: string; contact_id: string; channel: 'email' | 'linkedin' | 'other'; subject: string; body: string;
  status: 'draft' | 'approved' | 'sent' | 'replied' | 'cancelled'; approved_at: string | null; sent_at: string | null;
  scheduled_for: string | null; replied_at: string | null; reply_note: string; created_at: string;
};

export type Interview = {
  id: string; application_id: string; stage: string; scheduled_at: string | null; format: string; interviewer: string; notes: string;
  outcome: 'requested' | 'scheduled' | 'completed' | 'advanced' | 'declined' | 'cancelled'; created_at: string;
};

export type Notification = { id: string; kind: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

export type OrgRole = 'org_admin' | 'advisor' | 'student';
export type Organization = { id: string; name: string; kind: string; seat_limit: number; created_by: string; created_at: string };
export type Membership = { org_id: string; user_id: string; role: OrgRole; cohort_id: string | null; joined_at: string; organization?: Organization };
export type Cohort = { id: string; org_id: string; name: string; term: string };
export type Invitation = { id: string; org_id: string; cohort_id: string | null; email: string; role: OrgRole; token: string; accepted_at: string | null; expires_at: string; created_at: string };

export type InterviewFeedback = {
  score: number; summary: string; strengths: string[]; improvements: string[];
  structure: { situation: boolean; task: boolean; action: boolean; result: boolean };
  talking_points: string[]; filler_words: number; word_count: number;
};
export type MockTurn = { question: string; transcript: string; translation: string; tone: string; duration_s: number; feedback: InterviewFeedback; answered_at: string };
export type MockInterview = {
  id: string; application_id: string | null; resume_id: string | null; role_title: string; company: string; job_description: string;
  answer_language: string; translate_to: string | null; questions: { question: string; focus: string }[]; turns: (MockTurn | null)[];
  status: 'in_progress' | 'completed'; created_at: string; updated_at: string;
};

export type DiscoveredBoard = {
  id: string; provider: 'greenhouse' | 'lever' | 'ashby' | 'workday'; board_token: string; company_name: string; source_url: string;
  discovered_via: 'seed' | 'url' | 'career_page' | 'follow'; status: 'active' | 'unsupported' | 'not_found' | 'error';
  job_count: number; last_checked_at: string | null; last_error: string | null; created_at: string;
};
