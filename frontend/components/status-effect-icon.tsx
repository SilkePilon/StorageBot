"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface StatusEffectIconProps {
  effectId: number;
  effectName: string;
  amplifier?: number;
  duration?: number;
  size?: number;
  showTooltip?: boolean;
}

// Effect data: name, sprite filename, description
const EFFECT_DATA: Record<string, { sprite: string; displayName: string; description: string }> = {
  speed: { sprite: "speed", displayName: "Speed", description: "Increases movement speed" },
  slowness: { sprite: "slowness", displayName: "Slowness", description: "Decreases walking speed" },
  haste: { sprite: "haste", displayName: "Haste", description: "Increases mining and attack speed" },
  mining_fatigue: { sprite: "mining-fatigue", displayName: "Mining Fatigue", description: "Decreases mining and attack speed" },
  strength: { sprite: "strength", displayName: "Strength", description: "Increases melee damage" },
  instant_health: { sprite: "instant-health", displayName: "Instant Health", description: "Heals living entities" },
  instant_damage: { sprite: "instant-damage", displayName: "Instant Damage", description: "Damages living entities" },
  jump_boost: { sprite: "jump-boost", displayName: "Jump Boost", description: "Increases jump height and reduces fall damage" },
  nausea: { sprite: "nausea", displayName: "Nausea", description: "Wobbles and warps the screen" },
  regeneration: { sprite: "regeneration", displayName: "Regeneration", description: "Regenerates health over time" },
  resistance: { sprite: "resistance", displayName: "Resistance", description: "Reduces incoming damage" },
  fire_resistance: { sprite: "fire-resistance", displayName: "Fire Resistance", description: "Prevents fire damage" },
  water_breathing: { sprite: "water-breathing", displayName: "Water Breathing", description: "Prevents drowning" },
  invisibility: { sprite: "invisibility", displayName: "Invisibility", description: "Makes the entity invisible" },
  blindness: { sprite: "blindness", displayName: "Blindness", description: "Impairs vision with black fog" },
  night_vision: { sprite: "night-vision", displayName: "Night Vision", description: "See well in darkness and underwater" },
  hunger: { sprite: "hunger", displayName: "Hunger", description: "Increases food exhaustion" },
  weakness: { sprite: "weakness", displayName: "Weakness", description: "Decreases melee damage" },
  poison: { sprite: "poison", displayName: "Poison", description: "Inflicts damage over time (can't kill)" },
  wither: { sprite: "wither", displayName: "Wither", description: "Inflicts damage over time (can kill)" },
  health_boost: { sprite: "health-boost", displayName: "Health Boost", description: "Increases maximum health" },
  absorption: { sprite: "absorption", displayName: "Absorption", description: "Adds damage absorption hearts" },
  saturation: { sprite: "saturation", displayName: "Saturation", description: "Restores hunger and saturation" },
  glowing: { sprite: "glowing", displayName: "Glowing", description: "Outlines the entity (visible through blocks)" },
  levitation: { sprite: "levitation", displayName: "Levitation", description: "Floats the entity upward" },
  luck: { sprite: "luck", displayName: "Luck", description: "Increases chances of better loot" },
  unluck: { sprite: "bad-luck", displayName: "Bad Luck", description: "Reduces chances of good loot" },
  bad_luck: { sprite: "bad-luck", displayName: "Bad Luck", description: "Reduces chances of good loot" },
  slow_falling: { sprite: "slow-falling", displayName: "Slow Falling", description: "Decreases falling speed, negates fall damage" },
  conduit_power: { sprite: "conduit-power", displayName: "Conduit Power", description: "Underwater visibility, mining speed, no drowning" },
  dolphins_grace: { sprite: "dolphins-grace", displayName: "Dolphin's Grace", description: "Increases swimming speed" },
  bad_omen: { sprite: "bad-omen-new", displayName: "Bad Omen", description: "Causes an ominous event in villages/trial chambers" },
  hero_of_the_village: { sprite: "hero-of-the-village", displayName: "Hero of the Village", description: "Discounts on villager trades" },
  village_hero: { sprite: "hero-of-the-village", displayName: "Hero of the Village", description: "Discounts on villager trades" },
  darkness: { sprite: "darkness", displayName: "Darkness", description: "Pulsating darkening effect on screen" },
  trial_omen: { sprite: "trial-omen", displayName: "Trial Omen", description: "Transforms trial spawners into ominous ones" },
  raid_omen: { sprite: "raid-omen", displayName: "Raid Omen", description: "Starts a raid when effect expires" },
  wind_charged: { sprite: "wind-charged", displayName: "Wind Charged", description: "Emit a wind burst upon death" },
  weaving: { sprite: "weaving", displayName: "Weaving", description: "Move faster in cobwebs, spawn cobwebs on death" },
  oozing: { sprite: "oozing", displayName: "Oozing", description: "Spawn slimes upon death" },
  infested: { sprite: "infested", displayName: "Infested", description: "Chance to spawn silverfish when hurt" },
  fatal_poison: { sprite: "fatal-poison", displayName: "Fatal Poison", description: "Inflicts damage over time (can kill)" },
  breath_of_the_nautilus: { sprite: "breath-of-the-nautilus", displayName: "Breath of the Nautilus", description: "Freezes oxygen bar" },
};

// Effect ID to name mapping (Minecraft uses 1-based IDs, but some versions use 0-based)
const EFFECT_ID_TO_NAME: Record<number, string> = {
  1: "speed",
  2: "slowness",
  3: "haste",
  4: "mining_fatigue",
  5: "strength",
  6: "instant_health",
  7: "instant_damage",
  8: "jump_boost",
  9: "nausea",
  10: "regeneration",
  11: "resistance",
  12: "fire_resistance",
  13: "water_breathing",
  14: "invisibility",
  15: "blindness",
  16: "night_vision",
  17: "hunger",
  18: "weakness",
  19: "poison",
  20: "wither",
  21: "health_boost",
  22: "absorption",
  23: "saturation",
  24: "glowing",
  25: "levitation",
  26: "luck",
  27: "bad_luck",
  28: "slow_falling",
  29: "conduit_power",
  30: "dolphins_grace",
  31: "bad_omen",
  32: "hero_of_the_village",
  33: "darkness",
  34: "trial_omen",
  35: "raid_omen",
  36: "wind_charged",
  37: "weaving",
  38: "oozing",
  39: "infested",
};

// Get effect data from ID or name
function getEffectData(effectId: number, effectName: string): { sprite: string; displayName: string; description: string } {
  // Try by name first
  const normalizedName = effectName.toLowerCase().replace(/\s+/g, "_").replace(/^minecraft:/, "");
  if (EFFECT_DATA[normalizedName]) {
    return EFFECT_DATA[normalizedName];
  }
  
  // Try by ID
  const nameFromId = EFFECT_ID_TO_NAME[effectId];
  if (nameFromId && EFFECT_DATA[nameFromId]) {
    return EFFECT_DATA[nameFromId];
  }
  
  // Fallback
  return {
    sprite: normalizedName.replace(/_/g, "-"),
    displayName: effectName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    description: "Unknown effect",
  };
}

// Format amplifier (0 = I, 1 = II, etc.)
function formatAmplifier(amplifier: number): string {
  const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return numerals[amplifier] || `${amplifier + 1}`;
}

// Format duration from ticks to human readable
function formatDuration(ticks: number): string {
  if (ticks < 0 || ticks > 1000000) return "∞";
  const seconds = Math.floor(ticks / 20);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${remainingMinutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

// Get icon URL from Minecraft wiki
function getIconUrl(sprite: string): string {
  // Wiki uses format: https://minecraft.wiki/images/EffectSprite_name.png
  // Sprite names use hyphens and are lowercase
  return `https://minecraft.wiki/images/EffectSprite_${sprite}.png`;
}

export function StatusEffectIcon({
  effectId,
  effectName,
  amplifier = 0,
  duration,
  size = 16,
  showTooltip = true,
}: StatusEffectIconProps) {
  const data = getEffectData(effectId, effectName);
  const iconUrl = getIconUrl(data.sprite);
  
  const [hasError, setHasError] = useState(false);

  const icon = hasError ? (
    <div
      className="flex items-center justify-center bg-muted/50 rounded"
      style={{ width: size, height: size }}
    >
      <Sparkles className="text-muted-foreground" style={{ width: size * 0.6, height: size * 0.6 }} />
    </div>
  ) : (
    <img
      src={iconUrl}
      alt={data.displayName}
      style={{ width: size, height: size }}
      onError={() => setHasError(true)}
      draggable={false}
      loading="lazy"
      className="pixelated"
    />
  );

  if (!showTooltip) {
    return icon;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{icon}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[200px]">
        <div className="font-medium">
          {data.displayName} {amplifier > 0 && formatAmplifier(amplifier)}
        </div>
        <div className="text-muted-foreground">{data.description}</div>
        {duration !== undefined && duration > 0 && (
          <div className="text-muted-foreground mt-1">
            Duration: {formatDuration(duration)}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// Simple icon-only badge for status effects (no colors, no level text)
export function StatusEffectBadge({
  effectId,
  effectName,
  amplifier = 0,
  duration,
}: StatusEffectIconProps) {
  const data = getEffectData(effectId, effectName);
  const iconUrl = getIconUrl(data.sprite);
  
  const [hasError, setHasError] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="h-7 w-7 p-0 cursor-default">
          {hasError ? (
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          ) : (
            <img
              src={iconUrl}
              alt={data.displayName}
              className="h-4 w-4 pixelated"
              onError={() => setHasError(true)}
              draggable={false}
              loading="lazy"
            />
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[200px]">
        <div className="font-medium">
          {data.displayName} {amplifier > 0 && formatAmplifier(amplifier)}
        </div>
        <div className="text-muted-foreground">{data.description}</div>
        {duration !== undefined && duration > 0 && (
          <div className="text-muted-foreground mt-1">
            Duration: {formatDuration(duration)}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// Simple dot version for compact display
export function StatusEffectDot({
  effectId,
  effectName,
  amplifier = 0,
  duration,
  size = 12,
}: StatusEffectIconProps) {
  const data = getEffectData(effectId, effectName);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-block rounded-full bg-muted border border-border"
          style={{ width: size, height: size }}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs max-w-[200px]">
        <div className="font-medium">
          {data.displayName} {amplifier > 0 && formatAmplifier(amplifier)}
        </div>
        <div className="text-muted-foreground">{data.description}</div>
        {duration !== undefined && duration > 0 && (
          <div className="text-muted-foreground mt-1">
            Duration: {formatDuration(duration)}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
