"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { Bot, Box, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/dashboard");
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/20">
      <div className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center text-center space-y-8">
          <div className="flex items-center gap-3">
            <Box className="h-12 w-12 text-primary" />
            <h1 className="text-5xl font-bold">StorageBot</h1>
          </div>
          
          <p className="text-xl text-muted-foreground max-w-2xl">
            Manage your Minecraft storage systems with an intelligent bot. 
            Index chests, search items, and control everything from a modern web interface.
          </p>

          <div className="flex gap-4">
            <Button asChild size="lg">
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/register">Create Account</Link>
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            <div className="flex flex-col items-center p-6 rounded-lg border bg-card">
              <Bot className="h-10 w-10 mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Intelligent Bot</h3>
              <p className="text-muted-foreground text-sm">
                Mineflayer-powered bot that navigates and indexes your storage automatically
              </p>
            </div>
            
            <div className="flex flex-col items-center p-6 rounded-lg border bg-card">
              <Box className="h-10 w-10 mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Storage Indexing</h3>
              <p className="text-muted-foreground text-sm">
                Automatically scan and catalog all items in your chests with position tracking
              </p>
            </div>
            
            <div className="flex flex-col items-center p-6 rounded-lg border bg-card">
              <Cpu className="h-10 w-10 mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Real-time Control</h3>
              <p className="text-muted-foreground text-sm">
                Monitor bot status and control it in real-time through the web interface
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
