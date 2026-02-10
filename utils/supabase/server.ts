import { createServerClient, type CookieOptions, createBrowserClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  try {
    // Attempt to use cookies() (Works in Next.js Server Components/Actions)
    // In Next.js 16, cookies() is async and must be awaited
    const cookieStore = await cookies();

    return createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // Ensure cookies work with IP addresses by not setting domain
            // or setting it dynamically based on the request
            const cookieOptions: CookieOptions = {
              ...options,
              // Don't set domain for IP addresses - allows cookies to work on network IPs
              // Domain will be automatically handled by the browser
            };
            cookieStore.set({ name, value, ...cookieOptions });
          } catch (_error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch (_error) {
            // The `delete` method was called from a Server Component.
          }
        },
      },
    });
  } catch (_error) {
    // Fallback: If cookies() fails (e.g. running in browser), use the browser client.
    // This allows shared code/actions to execute in the client shim without crashing.
    return createBrowserClient(supabaseUrl, supabaseKey);
  }
}
