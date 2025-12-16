import React from 'react';
import { getHomeData } from './actions/home';
import HomePageClient from './components/HomePageClient';

export default async function HomePage() {
  const homeData = await getHomeData();

  return <HomePageClient homeData={homeData} />;
}