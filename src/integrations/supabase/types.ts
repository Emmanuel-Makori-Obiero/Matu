export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      admin_warnings: {
        Row: {
          acknowledged_at: string | null;
          created_at: string;
          id: string;
          issued_by: string;
          message: string;
          user_id: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          created_at?: string;
          id?: string;
          issued_by: string;
          message: string;
          user_id: string;
        };
        Update: {
          acknowledged_at?: string | null;
          created_at?: string;
          id?: string;
          issued_by?: string;
          message?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      alerts: {
        Row: {
          created_at: string;
          id: string;
          message: string | null;
          passenger_id: string;
          read: boolean;
          trip_id: string;
          type: Database["public"]["Enums"]["alert_type"];
        };
        Insert: {
          created_at?: string;
          id?: string;
          message?: string | null;
          passenger_id: string;
          read?: boolean;
          trip_id: string;
          type: Database["public"]["Enums"]["alert_type"];
        };
        Update: {
          created_at?: string;
          id?: string;
          message?: string | null;
          passenger_id?: string;
          read?: boolean;
          trip_id?: string;
          type?: Database["public"]["Enums"]["alert_type"];
        };
        Relationships: [
          {
            foreignKeyName: "alerts_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      bookings: {
        Row: {
          alighted_at: string | null;
          boarded_at: string | null;
          cancellation_reason: string | null;
          cash_collected: boolean;
          created_at: string;
          dropoff_stage_id: string | null;
          fare_paid: number | null;
          id: string;
          is_walk_in: boolean;
          manual_payment_confirmed: boolean;
          passenger_id: string | null;
          payment_method: string;
          pickup_stage_id: string | null;
          seat_number: number | null;
          status: Database["public"]["Enums"]["booking_status"];
          trip_id: string;
          updated_at: string;
          walk_in_label: string | null;
        };
        Insert: {
          alighted_at?: string | null;
          boarded_at?: string | null;
          cancellation_reason?: string | null;
          cash_collected?: boolean;
          created_at?: string;
          dropoff_stage_id?: string | null;
          fare_paid?: number | null;
          id?: string;
          is_walk_in?: boolean;
          manual_payment_confirmed?: boolean;
          passenger_id?: string | null;
          payment_method?: string;
          pickup_stage_id?: string | null;
          seat_number?: number | null;
          status?: Database["public"]["Enums"]["booking_status"];
          trip_id: string;
          updated_at?: string;
          walk_in_label?: string | null;
        };
        Update: {
          alighted_at?: string | null;
          boarded_at?: string | null;
          cancellation_reason?: string | null;
          cash_collected?: boolean;
          created_at?: string;
          dropoff_stage_id?: string | null;
          fare_paid?: number | null;
          id?: string;
          is_walk_in?: boolean;
          manual_payment_confirmed?: boolean;
          passenger_id?: string | null;
          payment_method?: string;
          pickup_stage_id?: string | null;
          seat_number?: number | null;
          status?: Database["public"]["Enums"]["booking_status"];
          trip_id?: string;
          updated_at?: string;
          walk_in_label?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "bookings_dropoff_stage_id_fkey";
            columns: ["dropoff_stage_id"];
            isOneToOne: false;
            referencedRelation: "stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_pickup_stage_id_fkey";
            columns: ["pickup_stage_id"];
            isOneToOne: false;
            referencedRelation: "stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bookings_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      complaints: {
        Row: {
          category: Database["public"]["Enums"]["complaint_category"];
          created_at: string;
          driver_id: string | null;
          emailed_to: string[] | null;
          id: string;
          message: string;
          passenger_id: string;
          recipient: Database["public"]["Enums"]["complaint_recipient"];
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          sacco_id: string | null;
          status: Database["public"]["Enums"]["complaint_status"];
          trip_id: string | null;
        };
        Insert: {
          category: Database["public"]["Enums"]["complaint_category"];
          created_at?: string;
          driver_id?: string | null;
          emailed_to?: string[] | null;
          id?: string;
          message: string;
          passenger_id: string;
          recipient: Database["public"]["Enums"]["complaint_recipient"];
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          sacco_id?: string | null;
          status?: Database["public"]["Enums"]["complaint_status"];
          trip_id?: string | null;
        };
        Update: {
          category?: Database["public"]["Enums"]["complaint_category"];
          created_at?: string;
          driver_id?: string | null;
          emailed_to?: string[] | null;
          id?: string;
          message?: string;
          passenger_id?: string;
          recipient?: Database["public"]["Enums"]["complaint_recipient"];
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          sacco_id?: string | null;
          status?: Database["public"]["Enums"]["complaint_status"];
          trip_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "complaints_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: false;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "complaints_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      driver_join_requests: {
        Row: {
          brings_own_vehicle: boolean;
          created_at: string;
          driver_id: string;
          id: string;
          id_number: string | null;
          join_fee_failure_reason: string | null;
          join_fee_status: Database["public"]["Enums"]["payment_status"];
          license_number: string | null;
          mpesa_checkout_request_id: string | null;
          note: string | null;
          phone: string | null;
          sacco_id: string;
          status: string;
          updated_at: string;
          vehicle_plate: string | null;
        };
        Insert: {
          brings_own_vehicle?: boolean;
          created_at?: string;
          driver_id: string;
          id?: string;
          id_number?: string | null;
          join_fee_failure_reason?: string | null;
          join_fee_status?: Database["public"]["Enums"]["payment_status"];
          license_number?: string | null;
          mpesa_checkout_request_id?: string | null;
          note?: string | null;
          phone?: string | null;
          sacco_id: string;
          status?: string;
          updated_at?: string;
          vehicle_plate?: string | null;
        };
        Update: {
          brings_own_vehicle?: boolean;
          created_at?: string;
          driver_id?: string;
          id?: string;
          id_number?: string | null;
          join_fee_failure_reason?: string | null;
          join_fee_status?: Database["public"]["Enums"]["payment_status"];
          license_number?: string | null;
          mpesa_checkout_request_id?: string | null;
          note?: string | null;
          phone?: string | null;
          sacco_id?: string;
          status?: string;
          updated_at?: string;
          vehicle_plate?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "driver_join_requests_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: false;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
        ];
      };
      escrow_transactions: {
        Row: {
          created_at: string;
          held_amount: number;
          id: string;
          payment_id: string;
          released_at: string | null;
          sacco_id: string | null;
        };
        Insert: {
          created_at?: string;
          held_amount: number;
          id?: string;
          payment_id: string;
          released_at?: string | null;
          sacco_id?: string | null;
        };
        Update: {
          created_at?: string;
          held_amount?: number;
          id?: string;
          payment_id?: string;
          released_at?: string | null;
          sacco_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "escrow_transactions_payment_id_fkey";
            columns: ["payment_id"];
            isOneToOne: false;
            referencedRelation: "payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "escrow_transactions_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: false;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
        ];
      };
      favorite_routes: {
        Row: {
          created_at: string;
          id: string;
          passenger_id: string;
          route_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          passenger_id: string;
          route_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          passenger_id?: string;
          route_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorite_routes_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
        ];
      };
      hire_listings: {
        Row: {
          contact_phone: string;
          created_at: string;
          id: string;
          is_active: boolean;
          location_lat: number | null;
          location_lng: number | null;
          location_name: string;
          owner_id: string;
          photo_url: string | null;
          photo_urls: string[];
          plate_number: string;
          sacco_name: string | null;
          seats: number;
          vehicle_make: string;
          vehicle_model: string | null;
        };
        Insert: {
          contact_phone: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          location_lat?: number | null;
          location_lng?: number | null;
          location_name: string;
          owner_id: string;
          photo_url?: string | null;
          photo_urls?: string[];
          plate_number: string;
          sacco_name?: string | null;
          seats?: number;
          vehicle_make: string;
          vehicle_model?: string | null;
        };
        Update: {
          contact_phone?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          location_lat?: number | null;
          location_lng?: number | null;
          location_name?: string;
          owner_id?: string;
          photo_url?: string | null;
          photo_urls?: string[];
          plate_number?: string;
          sacco_name?: string | null;
          seats?: number;
          vehicle_make?: string;
          vehicle_model?: string | null;
        };
        Relationships: [];
      };
      hire_requests: {
        Row: {
          created_at: string;
          dropoff_location: string;
          id: string;
          listing_id: string;
          notes: string | null;
          passenger_id: string;
          payment_method: string | null;
          pickup_location: string;
          quoted_price: number | null;
          status: string;
          trip_date: string;
        };
        Insert: {
          created_at?: string;
          dropoff_location: string;
          id?: string;
          listing_id: string;
          notes?: string | null;
          passenger_id: string;
          payment_method?: string | null;
          pickup_location: string;
          quoted_price?: number | null;
          status?: string;
          trip_date: string;
        };
        Update: {
          created_at?: string;
          dropoff_location?: string;
          id?: string;
          listing_id?: string;
          notes?: string | null;
          passenger_id?: string;
          payment_method?: string | null;
          pickup_location?: string;
          quoted_price?: number | null;
          status?: string;
          trip_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "hire_requests_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "hire_listings";
            referencedColumns: ["id"];
          },
        ];
      };
      jam_reports: {
        Row: {
          id: string;
          is_active: boolean;
          location_text: string | null;
          notes: string | null;
          reported_at: string;
          reported_by: string | null;
          route_id: string | null;
          severity: string;
          source: string;
          stage_id: string | null;
        };
        Insert: {
          id?: string;
          is_active?: boolean;
          location_text?: string | null;
          notes?: string | null;
          reported_at?: string;
          reported_by?: string | null;
          route_id?: string | null;
          severity?: string;
          source?: string;
          stage_id?: string | null;
        };
        Update: {
          id?: string;
          is_active?: boolean;
          location_text?: string | null;
          notes?: string | null;
          reported_at?: string;
          reported_by?: string | null;
          route_id?: string | null;
          severity?: string;
          source?: string;
          stage_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "jam_reports_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "jam_reports_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "stages";
            referencedColumns: ["id"];
          },
        ];
      };
      parcels: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          delivered_at: string | null;
          description: string | null;
          destination: string;
          driver_id: string | null;
          dropoff_code: string;
          id: string;
          origin: string;
          price: number;
          receiver_name: string;
          receiver_phone: string;
          sender_id: string;
          size: string;
          status: string;
          trip_id: string | null;
          weight_kg: number;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          description?: string | null;
          destination: string;
          driver_id?: string | null;
          dropoff_code?: string;
          id?: string;
          origin: string;
          price: number;
          receiver_name: string;
          receiver_phone: string;
          sender_id: string;
          size: string;
          status?: string;
          trip_id?: string | null;
          weight_kg: number;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          description?: string | null;
          destination?: string;
          driver_id?: string | null;
          dropoff_code?: string;
          id?: string;
          origin?: string;
          price?: number;
          receiver_name?: string;
          receiver_phone?: string;
          sender_id?: string;
          size?: string;
          status?: string;
          trip_id?: string | null;
          weight_kg?: number;
        };
        Relationships: [
          {
            foreignKeyName: "parcels_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount: number;
          booking_id: string | null;
          checkout_request_id: string | null;
          created_at: string;
          failure_reason: string | null;
          id: string;
          mpesa_checkout_request_id: string | null;
          mpesa_receipt: string | null;
          payer_id: string;
          status: Database["public"]["Enums"]["payment_status"];
        };
        Insert: {
          amount: number;
          booking_id?: string | null;
          checkout_request_id?: string | null;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          mpesa_checkout_request_id?: string | null;
          mpesa_receipt?: string | null;
          payer_id: string;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Update: {
          amount?: number;
          booking_id?: string | null;
          checkout_request_id?: string | null;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          mpesa_checkout_request_id?: string | null;
          mpesa_receipt?: string | null;
          payer_id?: string;
          status?: Database["public"]["Enums"]["payment_status"];
        };
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          age: number | null;
          avatar_url: string | null;
          created_at: string;
          driver_payment_method: string | null;
          driver_payment_name: string | null;
          driver_payment_target: string | null;
          driver_type: Database["public"]["Enums"]["driver_type"] | null;
          full_name: string | null;
          good_conduct_path: string | null;
          id: string;
          id_document_path: string | null;
          id_number: string | null;
          is_suspended: boolean;
          license_document_path: string | null;
          license_number: string | null;
          phone: string | null;
          psv_badge_path: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspended_reason: string | null;
          updated_at: string;
          verification_rejection_reason: string | null;
          verification_status: string;
        };
        Insert: {
          age?: number | null;
          avatar_url?: string | null;
          created_at?: string;
          driver_payment_method?: string | null;
          driver_payment_name?: string | null;
          driver_payment_target?: string | null;
          driver_type?: Database["public"]["Enums"]["driver_type"] | null;
          full_name?: string | null;
          good_conduct_path?: string | null;
          id: string;
          id_document_path?: string | null;
          id_number?: string | null;
          is_suspended?: boolean;
          license_document_path?: string | null;
          license_number?: string | null;
          phone?: string | null;
          psv_badge_path?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
          verification_rejection_reason?: string | null;
          verification_status?: string;
        };
        Update: {
          age?: number | null;
          avatar_url?: string | null;
          created_at?: string;
          driver_payment_method?: string | null;
          driver_payment_name?: string | null;
          driver_payment_target?: string | null;
          driver_type?: Database["public"]["Enums"]["driver_type"] | null;
          full_name?: string | null;
          good_conduct_path?: string | null;
          id?: string;
          id_document_path?: string | null;
          id_number?: string | null;
          is_suspended?: boolean;
          license_document_path?: string | null;
          license_number?: string | null;
          phone?: string | null;
          psv_badge_path?: string | null;
          suspended_at?: string | null;
          suspended_by?: string | null;
          suspended_reason?: string | null;
          updated_at?: string;
          verification_rejection_reason?: string | null;
          verification_status?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      rate_limit_hits: {
        Row: {
          action: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          action: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      routes: {
        Row: {
          base_fare: number | null;
          created_at: string;
          created_by: string | null;
          destination: string;
          id: string;
          name: string;
          origin: string;
          path: Json | null;
          path_updated_at: string | null;
          path_updated_by: string | null;
          sacco_id: string | null;
        };
        Insert: {
          base_fare?: number | null;
          created_at?: string;
          created_by?: string | null;
          destination: string;
          id?: string;
          name: string;
          origin: string;
          path?: Json | null;
          path_updated_at?: string | null;
          path_updated_by?: string | null;
          sacco_id?: string | null;
        };
        Update: {
          base_fare?: number | null;
          created_at?: string;
          created_by?: string | null;
          destination?: string;
          id?: string;
          name?: string;
          origin?: string;
          path?: Json | null;
          path_updated_at?: string | null;
          path_updated_by?: string | null;
          sacco_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "routes_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: false;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
        ];
      };
      sacco_commission_rates: {
        Row: {
          commission_percent: number;
          sacco_id: string;
          updated_at: string;
        };
        Insert: {
          commission_percent?: number;
          sacco_id: string;
          updated_at?: string;
        };
        Update: {
          commission_percent?: number;
          sacco_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sacco_commission_rates_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: true;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
        ];
      };
      sacco_join_requests: {
        Row: {
          brings_own_vehicle: boolean;
          created_at: string;
          driver_id: string;
          full_name: string;
          id: string;
          id_number: string;
          license_number: string;
          phone: string;
          reviewed_at: string | null;
          sacco_id: string;
          status: Database["public"]["Enums"]["join_request_status"];
          vehicle_plate: string | null;
        };
        Insert: {
          brings_own_vehicle?: boolean;
          created_at?: string;
          driver_id: string;
          full_name: string;
          id?: string;
          id_number: string;
          license_number: string;
          phone: string;
          reviewed_at?: string | null;
          sacco_id: string;
          status?: Database["public"]["Enums"]["join_request_status"];
          vehicle_plate?: string | null;
        };
        Update: {
          brings_own_vehicle?: boolean;
          created_at?: string;
          driver_id?: string;
          full_name?: string;
          id?: string;
          id_number?: string;
          license_number?: string;
          phone?: string;
          reviewed_at?: string | null;
          sacco_id?: string;
          status?: Database["public"]["Enums"]["join_request_status"];
          vehicle_plate?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sacco_join_requests_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: false;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
        ];
      };
      sacco_subscriptions: {
        Row: {
          amount: number;
          created_at: string;
          failure_reason: string | null;
          id: string;
          mpesa_checkout_request_id: string | null;
          mpesa_receipt: string | null;
          period_end: string;
          period_start: string;
          sacco_id: string;
          status: Database["public"]["Enums"]["subscription_status"];
          vehicle_count: number;
        };
        Insert: {
          amount: number;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          mpesa_checkout_request_id?: string | null;
          mpesa_receipt?: string | null;
          period_end?: string;
          period_start?: string;
          sacco_id: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          vehicle_count: number;
        };
        Update: {
          amount?: number;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          mpesa_checkout_request_id?: string | null;
          mpesa_receipt?: string | null;
          period_end?: string;
          period_start?: string;
          sacco_id?: string;
          status?: Database["public"]["Enums"]["subscription_status"];
          vehicle_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sacco_subscriptions_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: false;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
        ];
      };
      saccos: {
        Row: {
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          registration_number: string | null;
        };
        Insert: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          registration_number?: string | null;
        };
        Update: {
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          registration_number?: string | null;
        };
        Relationships: [];
      };
      stage_pings: {
        Row: {
          created_at: string;
          id: string;
          passenger_id: string;
          route_id: string;
          stage_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          passenger_id: string;
          route_id: string;
          stage_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          passenger_id?: string;
          route_id?: string;
          stage_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stage_pings_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stage_pings_stage_id_fkey";
            columns: ["stage_id"];
            isOneToOne: false;
            referencedRelation: "stages";
            referencedColumns: ["id"];
          },
        ];
      };
      stages: {
        Row: {
          added_by: string | null;
          created_at: string;
          id: string;
          lat: number;
          lng: number;
          name: string;
          order_index: number;
          route_id: string;
        };
        Insert: {
          added_by?: string | null;
          created_at?: string;
          id?: string;
          lat: number;
          lng: number;
          name: string;
          order_index?: number;
          route_id: string;
        };
        Update: {
          added_by?: string | null;
          created_at?: string;
          id?: string;
          lat?: number;
          lng?: number;
          name?: string;
          order_index?: number;
          route_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stages_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_locations: {
        Row: {
          current_heading: number | null;
          current_lat: number | null;
          current_lng: number | null;
          trip_id: string;
          updated_at: string;
        };
        Insert: {
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_locations_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: true;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_reviews: {
        Row: {
          booking_id: string;
          comment: string | null;
          created_at: string;
          driver_id: string;
          id: string;
          passenger_id: string;
          rating: number;
          trip_id: string;
        };
        Insert: {
          booking_id: string;
          comment?: string | null;
          created_at?: string;
          driver_id: string;
          id?: string;
          passenger_id: string;
          rating: number;
          trip_id: string;
        };
        Update: {
          booking_id?: string;
          comment?: string | null;
          created_at?: string;
          driver_id?: string;
          id?: string;
          passenger_id?: string;
          rating?: number;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_reviews_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_reviews_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          created_at: string;
          current_heading: number | null;
          current_lat: number | null;
          current_lng: number | null;
          current_stage_id: string | null;
          driver_id: string;
          ended_at: string | null;
          fare: number;
          id: string;
          route_id: string;
          started_at: string | null;
          status: Database["public"]["Enums"]["trip_status"];
          vehicle_id: string;
        };
        Insert: {
          created_at?: string;
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          current_stage_id?: string | null;
          driver_id: string;
          ended_at?: string | null;
          fare: number;
          id?: string;
          route_id: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["trip_status"];
          vehicle_id: string;
        };
        Update: {
          created_at?: string;
          current_heading?: number | null;
          current_lat?: number | null;
          current_lng?: number | null;
          current_stage_id?: string | null;
          driver_id?: string;
          ended_at?: string | null;
          fare?: number;
          id?: string;
          route_id?: string;
          started_at?: string | null;
          status?: Database["public"]["Enums"]["trip_status"];
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_current_stage_id_fkey";
            columns: ["current_stage_id"];
            isOneToOne: false;
            referencedRelation: "stages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_route_id_fkey";
            columns: ["route_id"];
            isOneToOne: false;
            referencedRelation: "routes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          capacity: number;
          created_at: string;
          driver_id: string | null;
          id: string;
          last_lat: number | null;
          last_lng: number | null;
          last_seen_at: string | null;
          nickname: string | null;
          plate_number: string;
          sacco_id: string | null;
          suspended: boolean;
          suspended_reason: string | null;
          vehicle_type: Database["public"]["Enums"]["vehicle_type"];
        };
        Insert: {
          capacity: number;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          last_lat?: number | null;
          last_lng?: number | null;
          last_seen_at?: string | null;
          nickname?: string | null;
          plate_number: string;
          sacco_id?: string | null;
          suspended?: boolean;
          suspended_reason?: string | null;
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"];
        };
        Update: {
          capacity?: number;
          created_at?: string;
          driver_id?: string | null;
          id?: string;
          last_lat?: number | null;
          last_lng?: number | null;
          last_seen_at?: string | null;
          nickname?: string | null;
          plate_number?: string;
          sacco_id?: string | null;
          suspended?: boolean;
          suspended_reason?: string | null;
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"];
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_sacco_id_fkey";
            columns: ["sacco_id"];
            isOneToOne: false;
            referencedRelation: "saccos";
            referencedColumns: ["id"];
          },
        ];
      };
      wallet_transactions: {
        Row: {
          amount: number;
          balance_after: number | null;
          booking_id: string | null;
          created_at: string;
          failure_reason: string | null;
          id: string;
          mpesa_checkout_request_id: string | null;
          mpesa_conversation_id: string | null;
          mpesa_receipt: string | null;
          phone: string | null;
          related_wallet_id: string | null;
          status: Database["public"]["Enums"]["wallet_txn_status"];
          type: Database["public"]["Enums"]["wallet_txn_type"];
          wallet_id: string;
        };
        Insert: {
          amount: number;
          balance_after?: number | null;
          booking_id?: string | null;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          mpesa_checkout_request_id?: string | null;
          mpesa_conversation_id?: string | null;
          mpesa_receipt?: string | null;
          phone?: string | null;
          related_wallet_id?: string | null;
          status?: Database["public"]["Enums"]["wallet_txn_status"];
          type: Database["public"]["Enums"]["wallet_txn_type"];
          wallet_id: string;
        };
        Update: {
          amount?: number;
          balance_after?: number | null;
          booking_id?: string | null;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          mpesa_checkout_request_id?: string | null;
          mpesa_conversation_id?: string | null;
          mpesa_receipt?: string | null;
          phone?: string | null;
          related_wallet_id?: string | null;
          status?: Database["public"]["Enums"]["wallet_txn_status"];
          type?: Database["public"]["Enums"]["wallet_txn_type"];
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_transactions_related_wallet_id_fkey";
            columns: ["related_wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey";
            columns: ["wallet_id"];
            isOneToOne: false;
            referencedRelation: "wallets";
            referencedColumns: ["id"];
          },
        ];
      };
      wallets: {
        Row: {
          balance: number;
          created_at: string;
          id: string;
          owner_id: string;
          owner_type: Database["public"]["Enums"]["wallet_owner_type"];
          updated_at: string;
        };
        Insert: {
          balance?: number;
          created_at?: string;
          id?: string;
          owner_id: string;
          owner_type: Database["public"]["Enums"]["wallet_owner_type"];
          updated_at?: string;
        };
        Update: {
          balance?: number;
          created_at?: string;
          id?: string;
          owner_id?: string;
          owner_type?: Database["public"]["Enums"]["wallet_owner_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_sessions: {
        Row: {
          context: Json;
          phone: string;
          state: string;
          updated_at: string;
        };
        Insert: {
          context?: Json;
          phone: string;
          state?: string;
          updated_at?: string;
        };
        Update: {
          context?: Json;
          phone?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      whatsapp_users: {
        Row: {
          created_at: string;
          display_name: string | null;
          id: string;
          phone: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          phone: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          id?: string;
          phone?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      pending_verifications: {
        Row: {
          created_at: string | null;
          driver_type: Database["public"]["Enums"]["driver_type"] | null;
          full_name: string | null;
          good_conduct_path: string | null;
          id_document_path: string | null;
          id_number: string | null;
          license_document_path: string | null;
          license_number: string | null;
          phone: string | null;
          psv_badge_path: string | null;
          roles: Database["public"]["Enums"]["app_role"][] | null;
          sacco_name: string | null;
          sacco_registration_number: string | null;
          user_id: string | null;
          verification_status: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      admin_issue_warning: {
        Args: { _message: string; _user_id: string };
        Returns: undefined;
      };
      admin_list_users: {
        Args: never;
        Returns: {
          created_at: string;
          email: string;
          full_name: string;
          is_suspended: boolean;
          phone: string;
          roles: string[];
          suspended_reason: string;
          user_id: string;
          warning_count: number;
        }[];
      };
      admin_sacco_overview: {
        Args: never;
        Returns: {
          driver_count: number;
          owner_name: string;
          registration_number: string;
          sacco_id: string;
          sacco_name: string;
          sacco_wallet_balance: number;
          total_commission_earned: number;
          total_fares_collected: number;
          vehicle_count: number;
        }[];
      };
      admin_set_user_suspension: {
        Args: { _reason?: string; _suspended: boolean; _user_id: string };
        Returns: undefined;
      };
      apply_wallet_transaction: {
        Args: {
          _amount: number;
          _booking_id?: string;
          _direction: boolean;
          _mpesa_checkout_request_id?: string;
          _mpesa_conversation_id?: string;
          _mpesa_receipt?: string;
          _phone?: string;
          _related_wallet_id?: string;
          _type: Database["public"]["Enums"]["wallet_txn_type"];
          _wallet_id: string;
        };
        Returns: string;
      };
      approve_driver_request: {
        Args: { _request_id: string };
        Returns: undefined;
      };
      approve_join_request: {
        Args: { _request_id: string };
        Returns: undefined;
      };
      assert_not_suspended: { Args: { _user_id: string }; Returns: undefined };
      calculate_subscription_fee: {
        Args: { _vehicle_count: number };
        Returns: number;
      };
      can_manage_route: { Args: { _route_id: string }; Returns: boolean };
      cancel_booking: {
        Args: { _booking_id: string; _reason?: string };
        Returns: boolean;
      };
      cancel_trip: {
        Args: { _reason?: string; _trip_id: string };
        Returns: boolean;
      };
      check_rate_limit: {
        Args: { _action: string; _max_count: number; _window_seconds: number };
        Returns: boolean;
      };
      claim_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] };
        Returns: undefined;
      };
      confirm_cash_payment: {
        Args: { p_booking_id: string };
        Returns: {
          alighted_at: string | null;
          boarded_at: string | null;
          cancellation_reason: string | null;
          cash_collected: boolean;
          created_at: string;
          dropoff_stage_id: string | null;
          fare_paid: number | null;
          id: string;
          is_walk_in: boolean;
          manual_payment_confirmed: boolean;
          passenger_id: string | null;
          payment_method: string;
          pickup_stage_id: string | null;
          seat_number: number | null;
          status: Database["public"]["Enums"]["booking_status"];
          trip_id: string;
          updated_at: string;
          walk_in_label: string | null;
        };
      };
      confirm_manual_payment: {
        Args: { p_booking_id: string };
        Returns: {
          alighted_at: string | null;
          boarded_at: string | null;
          cancellation_reason: string | null;
          cash_collected: boolean;
          created_at: string;
          dropoff_stage_id: string | null;
          fare_paid: number | null;
          id: string;
          is_walk_in: boolean;
          manual_payment_confirmed: boolean;
          passenger_id: string | null;
          payment_method: string;
          pickup_stage_id: string | null;
          seat_number: number | null;
          status: Database["public"]["Enums"]["booking_status"];
          trip_id: string;
          updated_at: string;
          walk_in_label: string | null;
        };
      };
      confirm_parcel_delivery: {
        Args: { _code: string; _parcel_id: string };
        Returns: boolean;
      };
      driver_rating_summary: {
        Args: { _driver_id: string };
        Returns: {
          average_rating: number;
          rating_count: number;
        }[];
      };
      end_trip: { Args: { _trip_id: string }; Returns: boolean };
      get_my_sacco_contact_phone: {
        Args: { _sacco_id: string };
        Returns: string;
      };
      get_my_sacco_dashboard: {
        Args: never;
        Returns: {
          cash_uncollected_today: number;
          driver_count: number;
          live_trip_count: number;
          revenue_cash_today: number;
          revenue_mpesa_today: number;
          revenue_today: number;
          route_count: number;
          sacco_id: string;
          today_trip_count: number;
          vehicle_count: number;
        }[];
      };
      get_my_sacco_drivers: {
        Args: { _sacco_id: string };
        Returns: {
          driver_id: string;
          full_name: string;
          phone: string;
          plate_number: string;
          status: string;
          vehicle_id: string;
        }[];
      };
      get_or_create_my_wallet: {
        Args: { _owner_type: Database["public"]["Enums"]["wallet_owner_type"] };
        Returns: string;
      };
      get_or_create_wallet: {
        Args: {
          _owner_id: string;
          _owner_type: Database["public"]["Enums"]["wallet_owner_type"];
        };
        Returns: string;
      };
      get_parcel_dropoff_code: { Args: { _parcel_id: string }; Returns: string };
      get_primary_role: {
        Args: { _user_id: string };
        Returns: Database["public"]["Enums"]["app_role"];
      };
      get_recent_jams: {
        Args: { p_route_id?: string };
        Returns: {
          id: string;
          location_text: string;
          notes: string;
          reported_at: string;
          route_id: string;
          severity: string;
          source: string;
          stage_id: string;
        }[];
      };
      get_route_active_vehicle_locations: {
        Args: { _route_id: string };
        Returns: {
          current_heading: number;
          current_lat: number;
          current_lng: number;
          trip_id: string;
          vehicle_id: string;
        }[];
      };
      get_stage_ping_counts: {
        Args: { _route_id: string };
        Returns: {
          stage_id: string;
          waiting_count: number;
        }[];
      };
      get_trip_booked_count: { Args: { _trip_id: string }; Returns: number };
      get_trip_location: {
        Args: { _trip_id: string };
        Returns: {
          current_heading: number;
          current_lat: number;
          current_lng: number;
        }[];
      };
      get_trip_occupancy: {
        Args: { p_trip_id: string };
        Returns: {
          capacity: number;
          seats_available: number;
          seats_taken: number;
          trip_id: string;
        }[];
      };
      get_trip_taken_seats: {
        Args: { _trip_id: string };
        Returns: {
          seat_number: number;
        }[];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      increment_wallet_balance: {
        Args: { _amount: number; _wallet_id: string };
        Returns: number;
      };
      is_platform_admin: { Args: never; Returns: boolean };
      is_sacco_owner: { Args: { _sacco_id: string }; Returns: boolean };
      is_trip_driver: { Args: { _trip_id: string }; Returns: boolean };
      list_public_saccos: {
        Args: never;
        Returns: {
          id: string;
          name: string;
        }[];
      };
      list_sacco_join_requests: {
        Args: { _sacco_id: string };
        Returns: {
          created_at: string;
          driver_id: string;
          full_name: string;
          id: string;
          note: string;
          phone: string;
          status: string;
        }[];
      };
      owns_vehicle_sacco: { Args: { _vehicle_id: string }; Returns: boolean };
      pay_fare_from_wallet:
        | { Args: { _booking_id: string }; Returns: undefined }
        | {
            Args: { _booking_id: string; _passenger_id: string };
            Returns: undefined;
          };
      ping_stage: { Args: { _stage_id: string }; Returns: undefined };
      resign_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] };
        Returns: undefined;
      };
      resolve_complaint: {
        Args: {
          _complaint_id: string;
          _note?: string;
          _status: Database["public"]["Enums"]["complaint_status"];
        };
        Returns: undefined;
      };
      set_vehicle_suspension: {
        Args: { _reason?: string; _suspended: boolean; _vehicle_id: string };
        Returns: undefined;
      };
      set_verification_status: {
        Args: { _reason?: string; _status: string; _user_id: string };
        Returns: undefined;
      };
      update_trip_location: {
        Args: {
          _current_stage_id: string;
          _heading: number;
          _lat: number;
          _lng: number;
          _trip_id: string;
        };
        Returns: boolean;
      };
      vehicle_has_active_trip: {
        Args: { _vehicle_id: string };
        Returns: boolean;
      };
      vehicle_is_suspended: { Args: { _vehicle_id: string }; Returns: boolean };
    };
    Enums: {
      alert_type: "near_pickup" | "near_dropoff" | "alight_request";
      app_role: "passenger" | "driver" | "conductor" | "sacco_admin" | "platform_admin";
      booking_status: "reserved" | "confirmed" | "boarded" | "alighted" | "cancelled";
      complaint_category: "app" | "travel";
      complaint_recipient: "developer" | "driver" | "sacco" | "both";
      complaint_status: "open" | "acknowledged" | "resolved";
      driver_type: "sacco_driver" | "independent";
      join_request_status: "pending" | "approved" | "rejected";
      payment_status: "pending" | "held" | "released" | "refunded" | "failed";
      subscription_status: "pending" | "active" | "past_due" | "failed";
      trip_status: "scheduled" | "boarding" | "in_transit" | "completed" | "cancelled";
      vehicle_type: "matatu_14" | "matatu_25" | "bus_33" | "bus_51";
      wallet_owner_type: "passenger" | "driver" | "sacco";
      wallet_txn_status: "pending" | "completed" | "failed" | "reversed";
      wallet_txn_type:
        | "topup"
        | "fare_payment"
        | "fare_credit"
        | "sacco_commission"
        | "withdrawal"
        | "refund"
        | "adjustment";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      alert_type: ["near_pickup", "near_dropoff", "alight_request"],
      app_role: ["passenger", "driver", "conductor", "sacco_admin", "platform_admin"],
      booking_status: ["reserved", "confirmed", "boarded", "alighted", "cancelled"],
      complaint_category: ["app", "travel"],
      complaint_recipient: ["developer", "driver", "sacco", "both"],
      complaint_status: ["open", "acknowledged", "resolved"],
      driver_type: ["sacco_driver", "independent"],
      join_request_status: ["pending", "approved", "rejected"],
      payment_status: ["pending", "held", "released", "refunded", "failed"],
      subscription_status: ["pending", "active", "past_due", "failed"],
      trip_status: ["scheduled", "boarding", "in_transit", "completed", "cancelled"],
      vehicle_type: ["matatu_14", "matatu_25", "bus_33", "bus_51"],
      wallet_owner_type: ["passenger", "driver", "sacco"],
      wallet_txn_status: ["pending", "completed", "failed", "reversed"],
      wallet_txn_type: [
        "topup",
        "fare_payment",
        "fare_credit",
        "sacco_commission",
        "withdrawal",
        "refund",
        "adjustment",
      ],
    },
  },
} as const;
