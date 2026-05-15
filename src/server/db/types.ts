/**
 * 자동 생성 — 수동 편집 금지.
 *
 * 갱신 방법:
 * - Claude MCP: `mcp__plugin_supabase_supabase__generate_typescript_types`
 * - CLI 대안: `supabase gen types typescript --project-id jwjqfzxnswiobxnyjksd > src/server/db/types.ts`
 *
 * 스키마가 바뀔 때마다 (마이그레이션 적용 후) 다시 생성해 커밋.
 *
 * 주석 헤더만 수동 유지. 본문 (export type Json ~ Constants) 은 통째로 교체.
 */

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
      insurance_products: {
        Row: {
          id: string
          insurance_company: string
          original_filename: string | null
          processing_status: string | null
          product_name: string
          registered_at: string | null
          release_date: string
          source_gcs_uri: string | null
          total_pages: number | null
          total_sections: number | null
        }
        Insert: {
          id: string
          insurance_company: string
          original_filename?: string | null
          processing_status?: string | null
          product_name: string
          registered_at?: string | null
          release_date: string
          source_gcs_uri?: string | null
          total_pages?: number | null
          total_sections?: number | null
        }
        Update: {
          id?: string
          insurance_company?: string
          original_filename?: string | null
          processing_status?: string | null
          product_name?: string
          registered_at?: string | null
          release_date?: string
          source_gcs_uri?: string | null
          total_pages?: number | null
          total_sections?: number | null
        }
        Relationships: []
      }
      insurance_sections: {
        Row: {
          document_id: string
          id: string
          indexed_at: string | null
          page_end: number | null
          page_start: number | null
          product_id: string | null
          section_depth: number
          section_id: string
          section_title: string
          source_gcs_uri: string
        }
        Insert: {
          document_id: string
          id?: string
          indexed_at?: string | null
          page_end?: number | null
          page_start?: number | null
          product_id?: string | null
          section_depth: number
          section_id: string
          section_title: string
          source_gcs_uri: string
        }
        Update: {
          document_id?: string
          id?: string
          indexed_at?: string | null
          page_end?: number | null
          page_start?: number | null
          product_id?: string | null
          section_depth?: number
          section_id?: string
          section_title?: string
          source_gcs_uri?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_sections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "insurance_products"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_request: {
        Row: {
          additional_notes: string | null
          consent_messaging: boolean
          consent_third_party: boolean
          created_at: string
          deadline_at: string | null
          coverage: Json
          dispatched_at: string | null
          gender: string
          id: string
          monthly_budget_max: number
          monthly_budget_min: number
          name: string | null
          occupation: string
          phone: string | null
          rematch_count: number
          result_token: string | null
          status: string
          updated_at: string
        }
        Insert: {
          additional_notes?: string | null
          consent_messaging?: boolean
          consent_third_party?: boolean
          created_at?: string
          deadline_at?: string | null
          coverage: Json
          dispatched_at?: string | null
          gender: string
          id: string
          monthly_budget_max: number
          monthly_budget_min: number
          name?: string | null
          occupation: string
          phone?: string | null
          rematch_count?: number
          result_token?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          additional_notes?: string | null
          consent_messaging?: boolean
          consent_third_party?: boolean
          created_at?: string
          deadline_at?: string | null
          coverage?: Json
          dispatched_at?: string | null
          gender?: string
          id?: string
          monthly_budget_max?: number
          monthly_budget_min?: number
          name?: string | null
          occupation?: string
          phone?: string | null
          rematch_count?: number
          result_token?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_request_candidate: {
        Row: {
          agent_id: string
          candidate_rank: number
          created_at: string
          request_id: string
          selected: boolean
        }
        Insert: {
          agent_id: string
          candidate_rank: number
          created_at?: string
          request_id: string
          selected?: boolean
        }
        Update: {
          agent_id?: string
          candidate_rank?: number
          created_at?: string
          request_id?: string
          selected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plan_request_candidate_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "plan_request"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_request_medical_history: {
        Row: {
          created_at: string
          diagnosis: string
          had_surgery: boolean
          hospitalization_days: number
          id: string
          outpatient_visits: number
          position: number
          request_id: string
          treatment_period: string
          treatment_start_date: string
        }
        Insert: {
          created_at?: string
          diagnosis: string
          had_surgery?: boolean
          hospitalization_days?: number
          id: string
          outpatient_visits?: number
          position: number
          request_id: string
          treatment_period: string
          treatment_start_date: string
        }
        Update: {
          created_at?: string
          diagnosis?: string
          had_surgery?: boolean
          hospitalization_days?: number
          id?: string
          outpatient_visits?: number
          position?: number
          request_id?: string
          treatment_period?: string
          treatment_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_request_medical_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "plan_request"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
