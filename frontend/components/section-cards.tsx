"use client";

import { Bot, ArrowUpDown, Heart, Drumstick, Timer, Zap } from "lucide-react";
import { useBots } from "@/hooks/use-bots";
import { useBotStore } from "@/stores/bot-store";
import { Badge } from "@/components/ui/badge";

export function SectionCards() {
  const { data: bots, isLoading } = useBots();
  const botStatuses = useBotStore((state) => state.botStatuses);

  // Calculate stats
  const totalBots = bots?.length || 0;

  // Get online bots with their statuses
  const onlineBotStatuses =
    bots
      ?.filter((bot: any) => {
        const status = botStatuses[bot.id] || bot.runtimeStatus;
        return status?.connected;
      })
      .map((bot: any) => botStatuses[bot.id] || bot.runtimeStatus) || [];

  const onlineBots = onlineBotStatuses.length;

  // Calculate average health of online bots
  const avgHealth =
    onlineBots > 0
      ? Math.round(
          onlineBotStatuses.reduce(
            (acc: number, s: any) => acc + (s?.health || 0),
            0
          ) / onlineBots
        )
      : 0;

  // Calculate average food/saturation as a general "status" metric
  const avgFood =
    onlineBots > 0
      ? Math.round(
          onlineBotStatuses.reduce(
            (acc: number, s: any) => acc + (s?.food || 0),
            0
          ) / onlineBots
        )
      : 0;

  // Calculate average ping (ms) of online bots
  const avgPing =
    onlineBots > 0
      ? Math.round(
          onlineBotStatuses.reduce(
            (acc: number, s: any) => acc + (s?.ping || 0),
            0
          ) / onlineBots
        )
      : 0;

  // Calculate average uptime (minutes) of online bots
  const avgUptime =
    onlineBots > 0
      ? Math.round(
          onlineBotStatuses.reduce(
            (acc: number, s: any) => acc + (s?.uptimeMinutes || 0),
            0
          ) / onlineBots
        )
      : 0;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-24 bg-muted rounded-md animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Bot className="h-3.5 w-3.5" />
        <span className="font-semibold">{totalBots}</span>
        <span className="text-muted-foreground">bots</span>
      </Badge>
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <ArrowUpDown className="h-3.5 w-3.5" />
        <span className="font-semibold">{onlineBots}</span>
        <span className="text-muted-foreground">online</span>
      </Badge>
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Heart className="h-3.5 w-3.5" />
        <span className="font-semibold">
          {onlineBots > 0 ? `${avgHealth}/20` : "--"}
        </span>
        <span className="text-muted-foreground">avg health</span>
      </Badge>
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Drumstick className="h-3.5 w-3.5" />
        <span className="font-semibold">
          {onlineBots > 0 ? `${avgFood}/20` : "--"}
        </span>
        <span className="text-muted-foreground">avg food</span>
      </Badge>
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Zap className="h-3.5 w-3.5" />
        <span className="font-semibold">
          {onlineBots > 0 ? `${avgPing}ms` : "--"}
        </span>
        <span className="text-muted-foreground">avg ping</span>
      </Badge>
      <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
        <Timer className="h-3.5 w-3.5" />
        <span className="font-semibold">
          {onlineBots > 0 ? `${avgUptime}m` : "--"}
        </span>
        <span className="text-muted-foreground">avg uptime</span>
      </Badge>
    </div>
  );
}
