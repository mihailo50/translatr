"use client";

import React, { useState, useEffect } from "react";
import { getHomeData } from "./actions/home";
import { getPinnedChats } from "./actions/quantumlinks";
import HomePageClient from "./components/HomePageClient";
import { Conversation } from "./actions/home";

export default function HomePage() {
  const [homeData, setHomeData] = useState<{
    user: {
      id: string;
      name: string;
      avatar: string | null;
    };
    conversations: Conversation[];
    pinnedChatIds: string[];
  } | null>(null);
  const [pinnedChats, setPinnedChats] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch home data and full pinned chats in parallel for instant loading
        const [data, pinned] = await Promise.all([
          getHomeData(),
          getPinnedChats()
        ]);
        setHomeData(data);
        setPinnedChats(pinned);
      } catch (error) {
        // Error logging handled by logger utility in production
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to fetch home data:", error);
        }
        // If auth error, redirect to login (but only if not already there)
        if (error instanceof Error && error.message === "Authentication required") {
          const currentPath = window.location.pathname;
          if (!currentPath.startsWith("/auth/")) {
            window.location.href = "/auth/login";
          }
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <>
      {loading ? (
        <div></div>
      ) : homeData ? (
        <HomePageClient 
          homeData={homeData} 
          initialPinnedChatIds={new Set(homeData.pinnedChatIds)}
          initialPinnedChats={pinnedChats}
        />
      ) : (
        <div>No data found</div>
      )}
    </>
  );
}
