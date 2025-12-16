import React from 'react';
import { getHomeData } from './actions/home';
import HomePageClient from './components/HomePageClient';
import { createClient } from '../utils/supabase/server';
import { redirect } from 'next/navigation';

// Force dynamic rendering to ensure auth check runs on every request
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Check authentication first, before any rendering or data fetching
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Use redirect which throws and prevents any rendering
    redirect('/auth/login');
  }

  // Only fetch data if user is authenticated
  const homeData = await getHomeData();

  return <HomePageClient homeData={homeData} />;
}