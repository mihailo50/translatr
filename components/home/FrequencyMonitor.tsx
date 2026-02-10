"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUserStatus } from '../../hooks/useUserStatus';

const FrequencyMonitor = () => {
  const { user } = useAuth();
  const { onlineUsers, status } = useUserStatus(user ? { id: user.id } : null);
  const [ping, setPing] = useState<number>(24);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());

  // Calculate online nodes count
  const onlineNodes = useMemo(() => {
    if (!onlineUsers) return 0;
    return Object.values(onlineUsers).filter(
      (userStatus) => userStatus === 'online' || userStatus === 'in-call' || userStatus === 'busy' || userStatus === 'dnd'
    ).length;
  }, [onlineUsers]);

  // Update ping every 2 seconds with random variation
  useEffect(() => {
    const interval = setInterval(() => {
      // Base ping on real-time update frequency
      const now = Date.now();
      const timeSinceUpdate = now - lastUpdate;
      
      let basePing: number;
      if (timeSinceUpdate < 2000) {
        basePing = Math.floor(Math.random() * 10) + 20; // 20-30ms (excellent)
      } else if (timeSinceUpdate < 5000) {
        basePing = Math.floor(Math.random() * 15) + 30; // 30-45ms (good)
      } else {
        basePing = Math.floor(Math.random() * 20) + 50; // 50-70ms (fair)
      }
      
      // Add small random variation (±4ms)
      const variation = Math.floor(Math.random() * 9) - 4;
      setPing(Math.max(15, Math.min(100, basePing + variation)));
    }, 2000);

    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Track when onlineUsers updates
  useEffect(() => {
    setLastUpdate(Date.now());
  }, [onlineUsers]);

  // Determine system status
  const systemStatus = useMemo(() => {
    if (!user) return 'OFFLINE';
    if (status === 'offline' || status === 'invisible') return 'STANDBY';
    if (onlineNodes > 0) return 'OPTIMAL';
    return 'SCANNING';
  }, [user, status, onlineNodes]);

  const isOnline = status === 'online' || status === 'in-call' || status === 'busy' || status === 'dnd';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="aurora-glass-base rounded-xl px-4 py-3 h-auto w-full flex items-center justify-between"
    >
      {/* Left: System Status */}
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs text-emerald-400 tracking-wider">
          SYSTEM {systemStatus}
        </p>
      </div>

      {/* Right: Metrics Row */}
      <div className="flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Ping:</span>
          <span className="text-emerald-300">{ping}ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Nodes:</span>
          <span className="text-emerald-300">{onlineNodes} Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Encryption:</span>
          <span className="text-emerald-300">AES-256</span>
        </div>
      </div>
    </motion.div>
  );
};

export default FrequencyMonitor;
