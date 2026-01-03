'use server';

import { createClient } from '../utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const profileSchema = z.object({
  display_name: z.string().min(2, "Name must be at least 2 characters").max(50),
  bio: z.string().max(160, "Bio must be less than 160 characters").optional().or(z.literal('')),
  preferred_language: z.string(),
  theme: z.enum(['aurora', 'midnight']),
});

export async function getProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
    
  return { user, profile: data };
}

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const rawData = {
    display_name: formData.get('display_name'),
    bio: formData.get('bio'),
    preferred_language: formData.get('preferred_language'),
    theme: formData.get('theme'),
  };

  const validation = profileSchema.safeParse(rawData);
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return { error: error.message };

  try {
    revalidatePath('/settings');
    revalidatePath('/', 'layout'); 
  } catch (e) {
    // Ignore revalidatePath errors in client env
  }
  
  return { success: true };
}

export async function updateSubscription(plan: 'free' | 'pro') {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Unauthorized' };

    // In a real app, this would verify payment with Stripe/etc.
    const { error } = await supabase
        .from('profiles')
        .update({ 
            plan: plan,
            // If upgrading to pro, set arbitrary future date. If free, null.
            subscription_end_date: plan === 'pro' ? new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString() : null
        })
        .eq('id', user.id);

    if (error) return { error: error.message };
    
    try {
        revalidatePath('/settings');
        revalidatePath('/', 'layout');
    } catch(e) {}

    return { success: true };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  
  // We return success: true instead of redirecting here.
  // This avoids the NEXT_REDIRECT error in Next.js Server Actions when called from client components
  // and allows the client to show a toast before redirecting.
  return { success: true };
}