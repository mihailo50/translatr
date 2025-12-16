'use server';

import { z } from 'zod';
import { createClient } from '../../utils/supabase/server';
import { redirect } from 'next/navigation';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string().min(1, 'Confirm Password is required'),
  preferred_language: z.string().min(2, 'Please select a language'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  // Validate
  const validation = loginSchema.safeParse({ email, password });
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Handle redirect: try/catch for Next.js internal redirect, or return path for client
  try {
     // In a real server environment this throws 'NEXT_REDIRECT'
     // In a client environment, this might do nothing or fail.
     // We return a specialized object for the client to handle if needed.
     redirect('/');
  } catch (e) {
     if ((e as Error).message === 'NEXT_REDIRECT') throw e;
     // Fallback for client handling
     if (typeof window !== 'undefined') {
         window.location.href = '/';
         return { success: true };
     }
  }
  return { success: true, redirect: '/' };
}

export async function signup(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;
  const preferred_language = formData.get('preferred_language') as string;

  // Validate
  const validation = registerSchema.safeParse({ email, password, confirmPassword, preferred_language });
  if (!validation.success) {
    return { error: validation.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      data: {
        email: email,
        preferred_language: preferred_language,
      }
    },
  });

  if (error) {
    return { error: error.message };
  }

  try {
    redirect('/auth/verify-email');
  } catch (e) {
    if ((e as Error).message === 'NEXT_REDIRECT') throw e;
    if (typeof window !== 'undefined') {
         window.location.href = '/auth/verify-email';
         return { success: true };
     }
  }
  return { success: true, redirect: '/auth/verify-email' };
}