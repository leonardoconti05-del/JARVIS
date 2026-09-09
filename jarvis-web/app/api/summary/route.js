import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUMMARY_ID = 'ai_setup_agency_daily';

export async function GET() {
  const url = process.env.SUPABASE_URL_AI_SETUP;
  const key = process.env.SUPABASE_SERVICE_KEY_AI_SETUP;
  if (!url || !key) {
    return NextResponse.json({ summary: null });
  }
  try {
    const client = createClient(url, key);
    const { data, error } = await client
      .from('jarvis_summaries')
      .select('summary, generated_at')
      .eq('id', SUMMARY_ID)
      .maybeSingle();
    if (error || !data) return NextResponse.json({ summary: null });
    return NextResponse.json({ summary: data.summary, generatedAt: data.generated_at });
  } catch (e) {
    return NextResponse.json({ summary: null });
  }
}