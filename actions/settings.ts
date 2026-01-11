'use server';

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '../utils/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Get current user profile
 */
export async function getProfile() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { user: null, profile: null };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
      return { user, profile: null };
    }

    return {
      user: {
        id: user.id,
        email: user.email || '',
      },
      profile: profile || null,
    };
  } catch (error: any) {
    console.error('GetProfile error:', error);
    return { user: null, profile: null };
  }
}

/**
 * Sign out the current user
 */
export async function signOutAction() {
  try {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Sign out error:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: any) {
    console.error('SignOutAction error:', error);
    return { success: false, error: error.message || 'Failed to sign out' };
  }
}

/**
 * Update user profile
 */
export async function updateProfile(formData: FormData) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const displayName = formData.get('display_name') as string;
    const bio = formData.get('bio') as string;
    const preferredLanguage = formData.get('preferred_language') as string;
    const theme = formData.get('theme') as 'aurora' | 'midnight';

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName || null,
        bio: bio || null,
        preferred_language: preferredLanguage || 'en',
        theme: theme || 'aurora',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (error) {
      console.error('Error updating profile:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error: any) {
    console.error('UpdateProfile error:', error);
    return { success: false, error: error.message || 'Failed to update profile' };
  }
}

/**
 * Update user subscription plan
 */
export async function updateSubscription(plan: 'free' | 'pro') {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    const updateData: any = {
      plan: plan,
      updated_at: new Date().toISOString(),
    };

    // If downgrading to free, clear subscription end date
    if (plan === 'free') {
      updateData.subscription_end_date = null;
    } else if (plan === 'pro') {
      // If upgrading to pro, set subscription end date to 1 year from now
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      updateData.subscription_end_date = endDate.toISOString();
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (error) {
      console.error('Error updating subscription:', error);
      return { success: false, error: error.message };
    }

    revalidatePath('/settings');
    return { success: true };
  } catch (error: any) {
    console.error('UpdateSubscription error:', error);
    return { success: false, error: error.message || 'Failed to update subscription' };
  }
}

/**
 * Manually trigger notification cleanup (for testing or manual cleanup)
 */
export async function cleanupOldNotifications(): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || supabaseUrl === 'https://placeholder.supabase.co') {
      return { success: false, error: 'Server configuration error' };
    }

    if (!supabaseServiceKey || supabaseServiceKey === 'placeholder-key') {
      return { success: false, error: 'Server configuration error' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the cleanup function
    const { data, error } = await supabase.rpc('cleanup_old_notifications');

    if (error) {
      console.error('Error cleaning up notifications:', error);
      return { success: false, error: error.message };
    }

    const deletedCount = data || 0;

    return {
      success: true,
      deletedCount
    };
  } catch (error: any) {
    console.error('Cleanup notifications error:', error);
    return { success: false, error: error.message || 'Failed to cleanup notifications' };
  }
}
