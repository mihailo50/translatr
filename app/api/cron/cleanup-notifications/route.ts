import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API route for cleaning up old notifications (older than 24 hours)
 * 
 * This endpoint can be called manually for testing, but the automatic cleanup
 * should be set up using pg_cron directly in Supabase:
 * 
 * SETUP INSTRUCTIONS:
 * 
 * 1. Enable pg_cron extension in Supabase SQL Editor:
 *    CREATE EXTENSION IF NOT EXISTS pg_cron;
 * 
 * 2. Schedule the cleanup function to run every hour:
 *    SELECT cron.schedule(
 *      'cleanup-old-notifications',
 *      '0 * * * *',  -- Every hour at minute 0
 *      $$SELECT public.cleanup_old_notifications();$$
 *    );
 * 
 * 3. To verify the scheduled job:
 *    SELECT * FROM cron.job;
 * 
 * 4. To manually trigger for testing (requires CRON_SECRET_TOKEN):
 *    GET /api/cron/cleanup-notifications?token=YOUR_SECRET_TOKEN
 */
export async function GET(request: NextRequest) {
  try {
    // Optional: Check for secret token to protect the endpoint
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    const expectedToken = process.env.CRON_SECRET_TOKEN;

    // If CRON_SECRET_TOKEN is set, require it
    if (expectedToken && token !== expectedToken) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      return NextResponse.json(
        { error: 'Server configuration error: Supabase URL not configured' },
        { status: 500 }
      );
    }

    if (!supabaseServiceKey || supabaseServiceKey === 'placeholder-key') {
      return NextResponse.json(
        { error: 'Server configuration error: Supabase service role key not configured' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the cleanup function
    const { data, error } = await supabase.rpc('cleanup_old_notifications');

    if (error) {
      console.error('Error cleaning up notifications:', error);
      return NextResponse.json(
        { error: error.message, success: false },
        { status: 500 }
      );
    }

    const deletedCount = data || 0;

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Successfully deleted ${deletedCount} notifications older than 24 hours`
    });
  } catch (error: any) {
    console.error('Cleanup notifications error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup notifications', success: false },
      { status: 500 }
    );
  }
}

// Also support POST for compatibility
export async function POST(request: NextRequest) {
  return GET(request);
}
