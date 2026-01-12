/**
 * Bot Types - Shared definitions for frontend
 * 
 * This file contains type definitions and utilities for working with
 * different bot types in the frontend.
 */

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  component: string;
}

export interface BotType {
  type: string;
  name: string;
  description: string;
  icon: string;
  setupSteps: SetupStep[];
}

// Colors for bot type badges
export const BOT_TYPE_COLORS: Record<string, string> = {
  storage: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  farming: 'bg-green-500/10 text-green-500 border-green-500/20',
  pvp: 'bg-red-500/10 text-red-500 border-red-500/20',
  building: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

/**
 * Get color classes for a bot type badge
 */
export function getBotTypeColor(botType: string): string {
  return BOT_TYPE_COLORS[botType] || 'bg-muted text-muted-foreground';
}

/**
 * Get display info for a bot type
 */
export function getBotTypeInfo(botType: string, types: BotType[]): BotType | undefined {
  return types.find(t => t.type === botType);
}
