"use client";

import { motion } from "framer-motion";
import { Library, Clock, Eye, CheckCircle2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardStatsProps {
  stats: {
    total: number;
    pending: number;
    partiallyWatched: number;
    watched: number;
  };
}

export default function DashboardStats({ stats }: DashboardStatsProps) {
  const cards = [
    {
      label: "Total Videos",
      value: stats.total,
      icon: Library,
      color: "text-foreground",
      bg: "bg-secondary",
      border: "border-border",
    },
    {
      label: "Pending",
      value: stats.pending,
      icon: Clock,
      color: "text-muted-foreground",
      bg: "bg-secondary",
      border: "border-border",
    },
    {
      label: "Partially Watched",
      value: stats.partiallyWatched,
      icon: Eye,
      color: "text-primary",
      bg: "bg-[#fff0f3]",
      border: "border-[#ffd1da]",
    },
    {
      label: "Watched",
      value: stats.watched,
      icon: CheckCircle2,
      color: "text-foreground",
      bg: "bg-secondary",
      border: "border-border",
    },
  ];

  const watchedPercent =
    stats.total > 0 ? Math.round((stats.watched / stats.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
              className={cn("card rounded-lg p-5 border", card.border)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", card.bg)}>
                  <Icon className={cn("w-5 h-5", card.color)} />
                </div>
              </div>
              <div>
                <motion.p
                  className={cn("text-3xl font-display font-bold", card.color)}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 + 0.2, type: "spring", stiffness: 200 }}
                >
                  {card.value}
                </motion.p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {card.label}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Progress bar */}
      {stats.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card rounded-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Collection Progress</span>
            </div>
            <span className="text-sm font-semibold text-primary">
              {watchedPercent}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${watchedPercent}%` }}
              transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{stats.watched} watched</span>
            <span>{stats.total - stats.watched} remaining</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
