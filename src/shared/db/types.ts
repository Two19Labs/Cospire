export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ars_attempt_grants: {
        Row: {
          created_at: string
          granted_by: string
          id: number
          org_id: number
          round_id: number
          student_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: never
          org_id: number
          round_id: number
          student_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: never
          org_id?: number
          round_id?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_attempt_grants_granter_org_fkey"
            columns: ["granted_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_attempt_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ars_attempt_grants_round_org_fkey"
            columns: ["round_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_rounds"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_attempt_grants_student_org_fkey"
            columns: ["student_id", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      ars_process_runs: {
        Row: {
          completed_at: string | null
          course_id: number
          created_at: string
          id: number
          org_id: number
          report_released_at: string | null
          round_order: Json
          started_at: string
          student_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          course_id: number
          created_at?: string
          id?: never
          org_id: number
          report_released_at?: string | null
          round_order?: Json
          started_at?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          course_id?: number
          created_at?: string
          id?: never
          org_id?: number
          report_released_at?: string | null
          round_order?: Json
          started_at?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_process_runs_course_org_fkey"
            columns: ["course_id", "org_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_process_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ars_process_runs_student_org_fkey"
            columns: ["student_id", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      ars_report_components: {
        Row: {
          action_plan: string | null
          created_at: string
          development_areas: string | null
          id: number
          metrics: Json
          next_step: string | null
          org_id: number
          readiness_tag: string | null
          report_id: number
          score: number | null
          strengths: string | null
          template_component_id: number
          timeline: string | null
          updated_at: string
        }
        Insert: {
          action_plan?: string | null
          created_at?: string
          development_areas?: string | null
          id?: never
          metrics?: Json
          next_step?: string | null
          org_id: number
          readiness_tag?: string | null
          report_id: number
          score?: number | null
          strengths?: string | null
          template_component_id: number
          timeline?: string | null
          updated_at?: string
        }
        Update: {
          action_plan?: string | null
          created_at?: string
          development_areas?: string | null
          id?: never
          metrics?: Json
          next_step?: string | null
          org_id?: number
          readiness_tag?: string | null
          report_id?: number
          score?: number | null
          strengths?: string | null
          template_component_id?: number
          timeline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_report_components_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ars_report_components_report_fkey"
            columns: ["report_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_reports"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_report_components_template_component_fkey"
            columns: ["template_component_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_report_template_components"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      ars_report_template_components: {
        Row: {
          created_at: string
          id: number
          metric_has_notes: boolean
          metric_has_scores: boolean
          metric_label: string
          metric_names: Json
          org_id: number
          round_id: number | null
          sort_order: number
          template_id: number
          title: string
          updated_at: string
          uses_action_plan: boolean
          uses_development_areas: boolean
          uses_strengths: boolean
          weightage_pct: number
        }
        Insert: {
          created_at?: string
          id?: never
          metric_has_notes?: boolean
          metric_has_scores?: boolean
          metric_label?: string
          metric_names?: Json
          org_id: number
          round_id?: number | null
          sort_order?: number
          template_id: number
          title: string
          updated_at?: string
          uses_action_plan?: boolean
          uses_development_areas?: boolean
          uses_strengths?: boolean
          weightage_pct: number
        }
        Update: {
          created_at?: string
          id?: never
          metric_has_notes?: boolean
          metric_has_scores?: boolean
          metric_label?: string
          metric_names?: Json
          org_id?: number
          round_id?: number | null
          sort_order?: number
          template_id?: number
          title?: string
          updated_at?: string
          uses_action_plan?: boolean
          uses_development_areas?: boolean
          uses_strengths?: boolean
          weightage_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "ars_report_template_components_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ars_report_template_components_round_fkey"
            columns: ["round_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_rounds"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_report_template_components_template_fkey"
            columns: ["template_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_report_templates"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      ars_report_templates: {
        Row: {
          course_id: number | null
          created_at: string
          id: number
          is_active: boolean
          name: string
          org_id: number
          overall_levels: Json
          readiness_tags: Json
          updated_at: string
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          id?: never
          is_active?: boolean
          name: string
          org_id: number
          overall_levels?: Json
          readiness_tags?: Json
          updated_at?: string
        }
        Update: {
          course_id?: number | null
          created_at?: string
          id?: never
          is_active?: boolean
          name?: string
          org_id?: number
          overall_levels?: Json
          readiness_tags?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_report_templates_course_org_fkey"
            columns: ["course_id", "org_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_report_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ars_reports: {
        Row: {
          closing_note: string | null
          created_at: string
          id: number
          org_id: number
          overall_level: string | null
          overall_score: number | null
          released_at: string | null
          run_id: number
          status: string
          student_id: string
          template_id: number
          updated_at: string
          written_by: string | null
        }
        Insert: {
          closing_note?: string | null
          created_at?: string
          id?: never
          org_id: number
          overall_level?: string | null
          overall_score?: number | null
          released_at?: string | null
          run_id: number
          status?: string
          student_id: string
          template_id: number
          updated_at?: string
          written_by?: string | null
        }
        Update: {
          closing_note?: string | null
          created_at?: string
          id?: never
          org_id?: number
          overall_level?: string | null
          overall_score?: number | null
          released_at?: string | null
          run_id?: number
          status?: string
          student_id?: string
          template_id?: number
          updated_at?: string
          written_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ars_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ars_reports_run_fkey"
            columns: ["run_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_process_runs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_reports_student_org_fkey"
            columns: ["student_id", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_reports_template_fkey"
            columns: ["template_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_report_templates"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_reports_writer_org_fkey"
            columns: ["written_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      ars_rounds: {
        Row: {
          config: Json
          course_id: number
          created_at: string
          due_at: string | null
          id: number
          name: string
          opens_at: string | null
          org_id: number
          requires_review: boolean
          sort_order: number
          submission_mode: string
          updated_at: string
        }
        Insert: {
          config?: Json
          course_id: number
          created_at?: string
          due_at?: string | null
          id?: never
          name: string
          opens_at?: string | null
          org_id: number
          requires_review?: boolean
          sort_order?: number
          submission_mode: string
          updated_at?: string
        }
        Update: {
          config?: Json
          course_id?: number
          created_at?: string
          due_at?: string | null
          id?: never
          name?: string
          opens_at?: string | null
          org_id?: number
          requires_review?: boolean
          sort_order?: number
          submission_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_rounds_course_org_fkey"
            columns: ["course_id", "org_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_rounds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ars_submissions: {
        Row: {
          answer: Json
          attempt_no: number
          created_at: string
          file_path: string | null
          id: number
          org_id: number
          reviewed_at: string | null
          reviewed_by: string | null
          round_id: number
          run_id: number
          status: string
          student_id: string
          submitted_at: string | null
          submitted_late: boolean | null
          updated_at: string
        }
        Insert: {
          answer?: Json
          attempt_no?: number
          created_at?: string
          file_path?: string | null
          id?: never
          org_id: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_id: number
          run_id: number
          status?: string
          student_id: string
          submitted_at?: string | null
          submitted_late?: boolean | null
          updated_at?: string
        }
        Update: {
          answer?: Json
          attempt_no?: number
          created_at?: string
          file_path?: string | null
          id?: never
          org_id?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_id?: number
          run_id?: number
          status?: string
          student_id?: string
          submitted_at?: string | null
          submitted_late?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ars_submissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ars_submissions_reviewer_org_fkey"
            columns: ["reviewed_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_submissions_round_org_fkey"
            columns: ["round_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_rounds"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_submissions_run_org_fkey"
            columns: ["run_id", "org_id"]
            isOneToOne: false
            referencedRelation: "ars_process_runs"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "ars_submissions_student_org_fkey"
            columns: ["student_id", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      content_access: {
        Row: {
          created_at: string
          granted_by: string
          id: number
          org_id: number
          resource_id: number
          resource_type: string
          student_id: string
        }
        Insert: {
          created_at?: string
          granted_by: string
          id?: never
          org_id: number
          resource_id: number
          resource_type: string
          student_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string
          id?: never
          org_id?: number
          resource_id?: number
          resource_type?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_access_granter_org_fkey"
            columns: ["granted_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "content_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_access_student_org_fkey"
            columns: ["student_id", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          id: number
          kind: string
          org_id: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind?: string
          org_id: number
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          org_id?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          folder: string
          id: number
          org_id: number
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          folder?: string
          id?: never
          org_id: number
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          folder?: string
          id?: never
          org_id?: number
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploader_org_fkey"
            columns: ["uploaded_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      mentor_assignments: {
        Row: {
          assigned_by: string
          created_at: string
          id: number
          mentor_id: string
          org_id: number
          student_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          id?: never
          mentor_id: string
          org_id: number
          student_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          id?: never
          mentor_id?: string
          org_id?: number
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_assignments_assigner_org_fkey"
            columns: ["assigned_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "mentor_assignments_mentor_org_fkey"
            columns: ["mentor_id", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "mentor_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_assignments_student_org_fkey"
            columns: ["student_id", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          org_id: number
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          org_id: number
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          org_id?: number
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      question_imports: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: number
          org_id: number
          parsed: Json | null
          position: number
          problems: string[]
          question_id: number | null
          raw: Json
          reviewed_at: string | null
          reviewed_by: string | null
          source_ref: string | null
          source_type: string
          status: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: never
          org_id: number
          parsed?: Json | null
          position: number
          problems?: string[]
          question_id?: number | null
          raw: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ref?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: never
          org_id?: number
          parsed?: Json | null
          position?: number
          problems?: string[]
          question_id?: number | null
          raw?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_ref?: string | null
          source_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_imports_created_by_fk"
            columns: ["created_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "question_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_imports_question_fk"
            columns: ["question_id", "org_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "question_imports_reviewed_by_fk"
            columns: ["reviewed_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      question_keys: {
        Row: {
          correct_answer: Json | null
          created_at: string
          org_id: number
          question_id: number
          solution: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          correct_answer?: Json | null
          created_at?: string
          org_id: number
          question_id: number
          solution?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          correct_answer?: Json | null
          created_at?: string
          org_id?: number
          question_id?: number
          solution?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_keys_question_fk"
            columns: ["question_id", "org_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "question_keys_updated_by_fk"
            columns: ["updated_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      question_sections: {
        Row: {
          created_at: string
          id: number
          name: string
          org_id: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          org_id: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          org_id?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          created_by: string | null
          difficulty: string
          id: number
          images: Json
          marks: number
          options: Json
          org_id: number
          parent_id: number | null
          section_id: number
          topic: string
          type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          difficulty: string
          id?: never
          images?: Json
          marks: number
          options?: Json
          org_id: number
          parent_id?: number | null
          section_id: number
          topic: string
          type: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          difficulty?: string
          id?: never
          images?: Json
          marks?: number
          options?: Json
          org_id?: number
          parent_id?: number | null
          section_id?: number
          topic?: string
          type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fk"
            columns: ["created_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_parent_fk"
            columns: ["parent_id", "org_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "questions_section_fk"
            columns: ["section_id", "org_id"]
            isOneToOne: false
            referencedRelation: "question_sections"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "questions_updated_by_fk"
            columns: ["updated_by", "org_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_question_import: {
        Args: {
          p_body: string
          p_correct_answer: Json
          p_difficulty: string
          p_images: Json
          p_import_id: number
          p_marks: number
          p_options: Json
          p_parent_id: number
          p_section_id: number
          p_solution: string
          p_topic: string
          p_type: string
        }
        Returns: number
      }
      save_question: {
        Args: {
          p_body: string
          p_correct_answer: Json
          p_difficulty: string
          p_images: Json
          p_marks: number
          p_options: Json
          p_parent_id: number
          p_question_id: number
          p_section_id: number
          p_solution: string
          p_topic: string
          p_type: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
