"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface ShulkerToggleButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function ShulkerToggleButton({ isOpen, onToggle, disabled }: ShulkerToggleButtonProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<HTMLCanvasElement[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  
  // Frame 35 is fully open, frames after that are the closing animation
  const FRAME_OPEN = 35;
  
  // Load and properly render all GIF frames
  useEffect(() => {
    const loadGif = async () => {
      try {
        const response = await fetch("/shulker_box.gif");
        const buffer = await response.arrayBuffer();
        
        const { parseGIF, decompressFrames } = await import("gifuct-js");
        const gif = parseGIF(buffer);
        const rawFrames = decompressFrames(gif, true);
        
        if (rawFrames.length === 0) return;
        
        const width = rawFrames[0].dims.width;
        const height = rawFrames[0].dims.height;
        
        // Create a working canvas to composite frames
        const workingCanvas = document.createElement("canvas");
        workingCanvas.width = width;
        workingCanvas.height = height;
        const workingCtx = workingCanvas.getContext("2d")!;
        
        const renderedFrames: HTMLCanvasElement[] = [];
        
        for (let i = 0; i < rawFrames.length; i++) {
          const frame = rawFrames[i];
          
          // Create ImageData from the frame patch
          const patchCanvas = document.createElement("canvas");
          patchCanvas.width = frame.dims.width;
          patchCanvas.height = frame.dims.height;
          const patchCtx = patchCanvas.getContext("2d")!;
          const patchImageData = patchCtx.createImageData(frame.dims.width, frame.dims.height);
          patchImageData.data.set(frame.patch);
          patchCtx.putImageData(patchImageData, 0, 0);
          
          // Draw the patch onto the working canvas at the correct position
          workingCtx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
          
          // Save a copy of the current composite as this frame
          const frameCanvas = document.createElement("canvas");
          frameCanvas.width = width;
          frameCanvas.height = height;
          const frameCtx = frameCanvas.getContext("2d")!;
          frameCtx.drawImage(workingCanvas, 0, 0);
          renderedFrames.push(frameCanvas);
          
          // Handle disposal - for most GIFs we keep the content
          // but if disposal is "restoreToBackground" we'd clear
          if (frame.disposalType === 2) {
            workingCtx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
          }
        }
        
        setFrames(renderedFrames);
        
        // Draw first frame
        if (canvasRef.current && renderedFrames.length > 0) {
          const ctx = canvasRef.current.getContext("2d");
          if (ctx) {
            canvasRef.current.width = width;
            canvasRef.current.height = height;
            ctx.drawImage(renderedFrames[0], 0, 0);
          }
        }
      } catch (error) {
        console.error("Failed to load shulker GIF:", error);
      }
    };
    
    loadGif();
  }, []);
  
  // Draw current frame
  useEffect(() => {
    if (frames.length > 0 && canvasRef.current && frames[currentFrame]) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(frames[currentFrame], 0, 0);
      }
    }
  }, [currentFrame, frames]);
  
  // Handle toggle with animation
  const handleClick = useCallback(() => {
    if (disabled || isAnimating || frames.length === 0) return;
    
    // Clear any existing animation
    if (animationRef.current) {
      clearTimeout(animationRef.current);
    }
    
    setIsAnimating(true);
    
    if (!isOpen) {
      // Opening: animate 0 → FRAME_OPEN
      let frame = 0;
      const animateOpen = () => {
        frame++;
        if (frame <= FRAME_OPEN) {
          setCurrentFrame(frame);
          animationRef.current = setTimeout(animateOpen, 35);
        } else {
          setIsAnimating(false);
        }
      };
      animateOpen();
    } else {
      // Closing: animate from FRAME_OPEN → end, then snap to 0
      let frame = FRAME_OPEN;
      const animateClose = () => {
        frame++;
        if (frame < frames.length) {
          setCurrentFrame(frame);
          animationRef.current = setTimeout(animateClose, 35);
        } else {
          // Animation done, reset to frame 0
          setCurrentFrame(0);
          setIsAnimating(false);
        }
      };
      animateClose();
    }
    
    onToggle();
  }, [disabled, isAnimating, frames.length, isOpen, onToggle]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleClick}
          disabled={disabled || isAnimating}
        >
          <canvas
            ref={canvasRef}
            className="w-6 h-6 object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {isOpen ? "Collapse all shulkers" : "Expand all shulkers"}
      </TooltipContent>
    </Tooltip>
  );
}
