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
      ars_rounds: {
        Row: {
          config: Json
          course_id: number
          created_at: string
          id: number
          name: string
          org_id: number
          sort_order: number
          submission_mode: string
          updated_at: string
        }
        Insert: {
          config?: Json
          course_id: number
          created_at?: string
          id?: never
          name: string
          org_id: number
          sort_order?: number
          submission_mode: string
          updated_at?: string
        }
        Update: {
          config?: Json
          course_id?: number
          created_at?: string
          id?: never
          name?: string
          org_id?: number
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
          org_id: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          org_id: number
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
