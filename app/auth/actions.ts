"use server";

import { z } from "zod";
import { createClient } from "../../utils/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm Password is required"),
    preferred_language: z.string().min(2, "Please select a language"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

export async function login(prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

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

  // Revalidate the root path to ensure session is refreshed
  revalidatePath("/");
  
  // Server-side redirect - this will throw NEXT_REDIRECT which Next.js handles
  redirect("/");
}

export async function signup(prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  const preferred_language = formData.get("preferred_language") as string;

  // Validate
  const validation = registerSchema.safeParse({
    email,
    password,
    confirmPassword,
    preferred_language,
  });
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
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  try {
    redirect("/auth/verify-email");
  } catch (e) {
    if ((e as Error).message === "NEXT_REDIRECT") throw e;
    if (typeof window !== "undefined") {
      window.location.href = "/auth/verify-email";
      return { success: true };
    }
  }
  return { success: true, redirect: "/auth/verify-email" };
}

export async function resetPassword(prevState: unknown, formData: FormData) {
  const email = formData.get("email") as string;

  // Validate email
  const validation = z.string().email("Invalid email address").safeParse(email);
  if (!validation.success) {
    return { error: "Please enter a valid email address" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true, message: "Password reset link sent! Check your email." };
}
