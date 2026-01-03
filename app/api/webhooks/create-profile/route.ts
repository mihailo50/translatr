import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Webhook endpoint to create user profile when a new user signs up
 * Called by Supabase Database Webhook on auth.users INSERT
 */
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    
    // Supabase webhook sends data in this format:
    // { type: 'INSERT', table: 'users', record: { id, email, ... }, old_record: null }
    const { record } = payload;
    
    if (!record || !record.id || !record.email) {
      return NextResponse.json(
        { error: 'Invalid payload: missing user data' },
        { status: 400 }
      );
    }

    // Create Supabase client with service role key (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // Check if profile already exists (idempotent)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', record.id)
      .single();

    if (existingProfile) {
      // Profile already exists, return success
      return NextResponse.json({ 
        success: true, 
        message: 'Profile already exists' 
      });
    }

    // Create new profile
    const displayName = record.raw_user_meta_data?.display_name || 
                       record.email?.split('@')[0] || 
                       'User';

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: record.id,
        email: record.email,
        display_name: displayName
      });

    if (error) {
      console.error('Error creating profile:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: 'Profile created successfully'
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

