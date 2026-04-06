import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

/*
  Run this SQL in your Supabase dashboard (SQL Editor) to create the leads table:

  CREATE TABLE customer_leads (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    phone text NOT NULL,
    job_type text,
    vehicle_type text,
    areas text[],
    material_preference text,
    description text,
    estimate_data jsonb,
    created_at timestamptz DEFAULT now()
  );

  -- Allow anonymous inserts (the estimator submits without auth)
  ALTER TABLE customer_leads ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "allow anon insert" ON customer_leads FOR INSERT TO anon WITH CHECK (true);

  -- Only you can read leads (authenticated via Supabase dashboard)
  CREATE POLICY "allow service read" ON customer_leads FOR SELECT USING (auth.role() = 'service_role');
*/
