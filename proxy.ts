import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Create Supabase client for proxy (edge runtime compatible)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return Array.from(request.cookies.getAll()).map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
        }));
      },
      set(
        name: string,
        value: string,
        options?: {
          path?: string;
          domain?: string;
          maxAge?: number;
          httpOnly?: boolean;
          secure?: boolean;
          sameSite?: "strict" | "lax" | "none";
        }
      ) {
        // Set cookie on both request and response
        request.cookies.set({
          name,
          value,
          ...options,
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(
        name: string,
        options?: {
          path?: string;
          domain?: string;
          maxAge?: number;
          httpOnly?: boolean;
          secure?: boolean;
          sameSite?: "strict" | "lax" | "none";
        }
      ) {
        // Remove cookie from both request and response
        request.cookies.set({
          name,
          value: "",
          ...options,
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({
          name,
          value: "",
          ...options,
        });
      },
    },
  } as unknown as Parameters<typeof createServerClient>[2]);

  // Refresh session if expired (this updates cookies if needed)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Define protected routes (routes that require authentication)
  const protectedRoutes = ["/", "/chat", "/contacts", "/settings", "/translate"];
  const isProtectedRoute = protectedRoutes.some((route) => {
    if (route === "/") {
      return pathname === "/";
    }
    return pathname === route || pathname.startsWith(route + "/");
  });

  // Define auth routes (routes that should be accessible without auth)
  const authRoutes = [
    "/auth/login",
    "/auth/register",
    "/auth/verify-email",
    "/auth/auth-code-error",
    "/auth/callback",
    "/auth/forgot-password",
    "/auth/reset-password",
  ];
  const isAuthRoute = authRoutes.some((route) => pathname === route || pathname.startsWith(route));

  // If accessing a protected route without authentication, redirect to login
  // This happens at the edge BEFORE the page component loads, eliminating redirect chains
  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    // Preserve the original URL as a query parameter for redirect after login
    if (pathname !== "/") {
      redirectUrl.searchParams.set("redirectedFrom", pathname);
    }
    return NextResponse.redirect(redirectUrl);
  }

  // If accessing an auth route while authenticated, redirect to home
  // Exception: allow /auth/verify-email even when authenticated
  if (isAuthRoute && user && pathname !== "/auth/verify-email" && pathname !== "/auth/callback") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files (images, etc.)
     * - API routes that don't need auth checks
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$|api/).*)",
  ],
};
