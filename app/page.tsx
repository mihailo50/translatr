import React from "react";
import { getHomeData } from "./actions/home";
import HomePageClient from "./components/HomePageClient";

// Middleware handles auth checks at the edge, so we can use revalidate for better caching
// Revalidate every 60 seconds to keep data fresh while allowing some caching
export const revalidate = 60;

export default async function HomePage() {
  // Auth check is handled by middleware.ts at the edge
  // If we reach here, user is authenticated (middleware already verified)
  // Fetch data directly without redundant auth check
  const homeData = await getHomeData();

  return <HomePageClient homeData={homeData} />;
}
