"use client";

import { useState } from "react";
import { Box } from "lucide-react";

interface ItemIconProps {
  itemId: string;
  itemName?: string;
  size?: number;
  className?: string;
  showTooltip?: boolean;
  version?: string;
}

// Convert Minecraft item ID to the API format
// e.g., "minecraft:diamond_sword" -> "minecraft_diamond_sword"
// e.g., "diamond_sword" -> "minecraft_diamond_sword"
function formatItemId(itemId: string): string {
  // Remove minecraft: prefix if present, then add minecraft_ prefix
  let formatted = itemId.replace("minecraft:", "");
  return `minecraft_${formatted.toLowerCase()}`;
}

// External API for Minecraft item icons (high-res rendered icons)
const TEXTURE_API_BASE = "https://mc.nerothe.com/img";

// Track failed textures to avoid repeated attempts
const failedTextures = new Set<string>();

export function ItemIcon({
  itemId,
  itemName,
  size = 32,
  className = "",
  showTooltip = true,
  version = "1.21.4",
}: ItemIconProps) {
  const formattedId = formatItemId(itemId);
  const textureUrl = `${TEXTURE_API_BASE}/${version}/${formattedId}.png`;
  
  // Check if already known to be failed
  const [hasError, setHasError] = useState(() => failedTextures.has(textureUrl));

  const handleError = () => {
    failedTextures.add(textureUrl);
    setHasError(true);
  };

  if (hasError) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
        title={showTooltip ? itemName || itemId : undefined}
      >
        <Box className="text-muted-foreground" style={{ width: size * 0.6, height: size * 0.6 }} />
      </div>
    );
  }

  return (
    <img
      src={textureUrl}
      alt={itemName || itemId}
      title={showTooltip ? itemName || itemId : undefined}
      className={`${className}`}
      style={{ 
        width: size, 
        height: size,
      }}
      onError={handleError}
      draggable={false}
      loading="lazy"
    />
  );
}

// Simple version for inline display
export function ItemIconSimple({
  itemId,
  itemName,
  size = 24,
  className = "",
  version = "1.21.4",
}: Omit<ItemIconProps, "showTooltip">) {
  const formattedId = formatItemId(itemId);
  const textureUrl = `${TEXTURE_API_BASE}/${version}/${formattedId}.png`;
  
  // Check if already known to be failed
  const [hasError, setHasError] = useState(() => failedTextures.has(textureUrl));

  const handleError = () => {
    failedTextures.add(textureUrl);
    setHasError(true);
  };

  if (hasError) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`}
        style={{ width: size, height: size }}
      >
        <Box className="text-muted-foreground" style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    );
  }

  return (
    <img
      src={textureUrl}
      alt={itemName || itemId}
      className={`inline-block ${className}`}
      style={{ 
        width: size, 
        height: size,
      }}
      onError={handleError}
      draggable={false}
      loading="lazy"
    />
  );
}
