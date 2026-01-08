"use client";

import { useState, useEffect } from "react";
import { useBot, useStartBotAuth, useConnectBot, useUpdateBot } from "@/hooks/use-bots";
import { useCreateStorageSystem, useStartIndexing } from "@/hooks/use-storage";
import { useSocket } from "@/hooks/use-socket";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Key,
  Server,
  MapPin,
  Box,
  ExternalLink,
  Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SetupBotDialogProps {
  botId: string;
  botName: string;
  children?: React.ReactNode;
  onComplete?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const getSteps = (useOfflineAccount: boolean) => {
  if (useOfflineAccount) {
    return [
      { id: 1, title: "Server", icon: Server },
      { id: 2, title: "Storage", icon: MapPin },
      { id: 3, title: "Index", icon: Box },
    ];
  }
  return [
    { id: 1, title: "Auth", icon: Key },
    { id: 2, title: "Server", icon: Server },
    { id: 3, title: "Storage", icon: MapPin },
    { id: 4, title: "Index", icon: Box },
  ];
};

export function SetupBotDialog({ 
  botId, 
  botName, 
  children, 
  onComplete,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: SetupBotDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  
  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (controlledOnOpenChange || (() => {})) : setInternalOpen;
  
  const { data: bot, isLoading, refetch } = useBot(botId);
  const startAuth = useStartBotAuth();
  const connectBot = useConnectBot();
  const updateBot = useUpdateBot();
  const createStorage = useCreateStorageSystem();
  const startIndexing = useStartIndexing();
  const { socket, subscribeTo } = useSocket();

  const [currentStep, setCurrentStep] = useState(1);
  const [authStarted, setAuthStarted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Server form
  const [serverHost, setServerHost] = useState("");
  const [serverPort, setServerPort] = useState("25565");
  const [serverVersion, setServerVersion] = useState("auto");
  const [microsoftEmail, setMicrosoftEmail] = useState("");
  const [supportedVersions, setSupportedVersions] = useState<string[]>([]);
  
  // Storage form
  const [storageName, setStorageName] = useState("Main Storage");
  const [centerX, setCenterX] = useState("");
  const [centerY, setCenterY] = useState("");
  const [centerZ, setCenterZ] = useState("");
  const [radius, setRadius] = useState("32");

  // Indexing state
  const [indexingProgress, setIndexingProgress] = useState(0);
  const [indexingStatus, setIndexingStatus] = useState("");
  const [storageId, setStorageId] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);

  // Microsoft auth state
  const [msaCode, setMsaCode] = useState<{ userCode: string; verificationUri: string } | null>(null);

  const useOfflineAccount = bot?.useOfflineAccount || false;
  const STEPS = getSteps(useOfflineAccount);
  
  const getStepNumber = (stepName: string) => {
    const step = STEPS.find(s => s.title === stepName);
    return step?.id || 1;
  };

  useEffect(() => {
    if (open && botId) {
      console.log('[SetupBotDialog] Subscribing to bot:', botId);
      subscribeTo(botId);
    }
  }, [open, botId, subscribeTo]);

  // Fetch supported versions
  useEffect(() => {
    if (open && supportedVersions.length === 0) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/bots/versions`)
        .then(res => res.json())
        .then(data => {
          if (data.versions) {
            // Reverse to show newest first
            setSupportedVersions([...data.versions].reverse());
          }
        })
        .catch(err => console.error('Failed to fetch versions:', err));
    }
  }, [open, supportedVersions.length]);

  useEffect(() => {
    if (socket) {
      const handleIndexProgress = (data: any) => {
        if (data.storageId === storageId) {
          setIndexingProgress(data.progress);
          setIndexingStatus(data.status);
        }
      };

      const handleIndexComplete = (data: any) => {
        if (data.storageId === storageId) {
          setIndexingProgress(100);
          setIndexingStatus("Complete!");
          toast.success(`Indexed ${data.totalChests} chests!`);
        }
      };

      const handleMsaCode = (data: { userCode: string; verificationUri: string; message: string }) => {
        console.log('[SetupBotDialog] Received bot:msaCode event:', data);
        setMsaCode({ userCode: data.userCode, verificationUri: data.verificationUri });
        toast.info("Authentication code received!");
      };
      
      console.log('[SetupBotDialog] Setting up bot:msaCode listener, socket connected:', socket.connected);

      const handleAuthComplete = (data: { success: boolean; profile?: any; error?: string }) => {
        if (data.success) {
          toast.success(`Authenticated as ${data.profile?.name || 'Unknown'}!`);
          setMsaCode(null);
          setAuthStarted(false);
          refetch();
          setCurrentStep(getStepNumber("Server"));
        } else {
          toast.error(data.error || "Authentication failed");
          setAuthStarted(false);
          setMsaCode(null);
        }
      };

      socket.on("storage:indexProgress", handleIndexProgress);
      socket.on("storage:indexComplete", handleIndexComplete);
      socket.on("bot:msaCode", handleMsaCode);
      socket.on("bot:authComplete", handleAuthComplete);

      return () => {
        socket.off("storage:indexProgress", handleIndexProgress);
        socket.off("storage:indexComplete", handleIndexComplete);
        socket.off("bot:msaCode", handleMsaCode);
        socket.off("bot:authComplete", handleAuthComplete);
      };
    }
  }, [socket, storageId, refetch]);

  // Pre-fill from bot data - only run once when dialog opens
  useEffect(() => {
    if (bot && open) {
      // Pre-fill form fields
      if (bot.serverHost) setServerHost(bot.serverHost);
      if (bot.serverPort) setServerPort(String(bot.serverPort));
      if (bot.microsoftEmail) setMicrosoftEmail(bot.microsoftEmail);
    }
  }, [bot?.id, open]);

  // Determine initial step based on bot state - only on first open, once
  useEffect(() => {
    if (bot && open && !hasInitialized) {
      setHasInitialized(true);
      const isOffline = bot.useOfflineAccount;
      
      // Check if bot has completed setup steps
      if ((isOffline || bot.isAuthenticated) && bot.serverHost && bot.isOnline) {
        const indexStep = getStepNumber("Index");
        const storageStep = getStepNumber("Storage");
        
        if (bot.storageSystems?.length > 0 && bot.storageSystems[0].isIndexed) {
          setSetupComplete(true);
        } else if (bot.storageSystems?.length > 0) {
          setCurrentStep(indexStep);
          setStorageId(bot.storageSystems[0].id);
        } else {
          setCurrentStep(storageStep);
        }
      } else if (!isOffline && bot.isAuthenticated) {
        // Only advance to Server step if actually authenticated (not just has email)
        setCurrentStep(getStepNumber("Server"));
      }
    }
  }, [bot?.id, open, hasInitialized]);

  // Reset hasInitialized when dialog closes
  useEffect(() => {
    if (!open) {
      setHasInitialized(false);
    }
  }, [open]);

  const handleStartAuth = async () => {
    if (!microsoftEmail) {
      toast.error("Please enter your Microsoft account email");
      return;
    }

    try {
      await updateBot.mutateAsync({ id: botId, data: { microsoftEmail } });
    } catch (error) {
      toast.error((error as Error).message || "Failed to update bot");
      return;
    }
    
    startAuth.mutate(botId, {
      onSuccess: (data) => {
        setAuthStarted(true);
        toast.info(data.message);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleConnect = async () => {
    if (!serverHost) {
      toast.error("Please enter a server address");
      return;
    }

    connectBot.mutate(
      {
        id: botId,
        data: {
          serverHost,
          serverPort: parseInt(serverPort, 10),
          serverVersion: serverVersion === "auto" ? null : serverVersion,
        },
      },
      {
        onSuccess: () => {
          toast.success("Connecting to server...");
          refetch();
          setCurrentStep(getStepNumber("Storage"));
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleCreateStorage = async () => {
    if (!centerX || !centerY || !centerZ) {
      toast.error("Please enter storage coordinates");
      return;
    }

    createStorage.mutate(
      {
        name: storageName,
        botId,
        centerX: parseInt(centerX, 10),
        centerY: parseInt(centerY, 10),
        centerZ: parseInt(centerZ, 10),
        radius: parseInt(radius, 10),
      },
      {
        onSuccess: (storage) => {
          toast.success("Storage system created!");
          setStorageId(storage.id);
          setCurrentStep(getStepNumber("Index"));
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  };

  const handleStartIndexing = () => {
    if (!storageId) return;

    startIndexing.mutate(storageId, {
      onSuccess: () => {
        toast.info("Indexing started...");
        setIndexingProgress(0);
        setIndexingStatus("Starting...");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const handleFinish = () => {
    setSetupComplete(true);
    setOpen(false);
    onComplete?.();
  };

  const resetAndClose = () => {
    setOpen(false);
  };

  // Prevent dialog from closing during pending operations
  const handleOpenChange = (newOpen: boolean) => {
    // Don't allow close during connection, storage creation, or indexing
    if (!newOpen && (
      connectBot.isPending || 
      createStorage.isPending ||
      startIndexing.isPending || 
      (indexingProgress > 0 && indexingProgress < 100)
    )) {
      return;
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        {isLoading && open ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base">Setup {botName}</DialogTitle>
              <DialogDescription className="text-xs">
                Configure your bot to connect and index storage
              </DialogDescription>
            </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-1 py-2">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = step.id === currentStep;
            const isComplete = step.id < currentStep || setupComplete || (step.title === "Index" && indexingProgress === 100);

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full border transition-colors ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : isComplete
                      ? "border-[#4CAF50] bg-[#4CAF50] text-white"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {isComplete ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`w-6 h-0.5 mx-0.5 ${
                      isComplete ? "bg-[#4CAF50]" : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Setup Complete */}
        {setupComplete && (
          <div className="text-center py-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#4CAF50] text-white flex items-center justify-center mx-auto">
              <Check className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium">Setup Complete!</p>
              <p className="text-xs text-muted-foreground">Your bot is ready to use</p>
            </div>
            <Button size="sm" onClick={resetAndClose}>Done</Button>
          </div>
        )}

        {/* Microsoft Login Step */}
        {!setupComplete && !useOfflineAccount && STEPS[currentStep - 1]?.title === "Auth" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="microsoftEmail" className="text-xs">Microsoft Email</Label>
              <Input
                id="microsoftEmail"
                type="email"
                placeholder="your.email@outlook.com"
                value={microsoftEmail}
                onChange={(e) => setMicrosoftEmail(e.target.value)}
                className="h-8 text-sm"
                disabled={authStarted}
              />
            </div>

            {authStarted && msaCode && (
              <div className="p-2.5 rounded-md border bg-muted/50 space-y-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="font-medium">Enter this code to sign in:</span>
                </div>
                <div className="text-center py-2">
                  <code className="text-2xl font-bold tracking-widest bg-background px-4 py-2 rounded border">
                    {msaCode.userCode}
                  </code>
                </div>
                <div className="text-xs text-center space-y-1.5">
                  <a 
                    href={msaCode.verificationUri} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    Open {msaCode.verificationUri} <ExternalLink className="h-3 w-3" />
                  </a>
                  <p className="text-muted-foreground">Sign in with your Microsoft account</p>
                </div>
              </div>
            )}

            {authStarted && !msaCode && (
              <div className="p-2.5 rounded-md border bg-muted/50 space-y-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="font-medium">Starting authentication...</span>
                </div>
              </div>
            )}

            <Button
              onClick={handleStartAuth}
              size="sm"
              className="w-full h-8"
              disabled={startAuth.isPending || authStarted}
            >
              {(startAuth.isPending || authStarted) && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
              {authStarted ? "Authenticating..." : "Start Authentication"}
            </Button>
          </div>
        )}

        {/* Server Connection Step */}
        {!setupComplete && STEPS[currentStep - 1]?.title === "Server" && (
          <div className="space-y-3">
            {useOfflineAccount && (
              <Badge variant="outline" className="text-[10px]">
                <Wifi className="h-2.5 w-2.5 mr-1" />
                Offline Mode: {bot?.offlineUsername}
              </Badge>
            )}
            
            <div className="space-y-1.5">
              <Label htmlFor="serverHost" className="text-xs">Server Address</Label>
              <Input
                id="serverHost"
                type="text"
                placeholder={useOfflineAccount ? "localhost or 192.168.x.x" : "play.example.com"}
                value={serverHost}
                onChange={(e) => setServerHost(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="serverPort" className="text-xs">Port</Label>
                <Input
                  id="serverPort"
                  type="number"
                  placeholder="25565"
                  value={serverPort}
                  onChange={(e) => setServerPort(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="serverVersion" className="text-xs">Version</Label>
                <Select value={serverVersion} onValueChange={setServerVersion}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto Detect</SelectItem>
                    {supportedVersions.map((version) => (
                      <SelectItem key={version} value={version}>
                        {version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              {!useOfflineAccount && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-8"
                  onClick={() => setCurrentStep(getStepNumber("Auth"))}
                >
                  <ChevronLeft className="mr-1 h-3 w-3" />
                  Back
                </Button>
              )}
              <Button
                onClick={handleConnect}
                size="sm"
                className={`h-8 ${useOfflineAccount ? "w-full" : "flex-1"}`}
                disabled={connectBot.isPending}
              >
                {connectBot.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Connect
                <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Storage Location Step */}
        {!setupComplete && STEPS[currentStep - 1]?.title === "Storage" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="storageName" className="text-xs">Storage Name</Label>
              <Input
                id="storageName"
                type="text"
                placeholder="Main Storage"
                value={storageName}
                onChange={(e) => setStorageName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label htmlFor="centerX" className="text-xs">X</Label>
                <Input
                  id="centerX"
                  type="number"
                  placeholder="0"
                  value={centerX}
                  onChange={(e) => setCenterX(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="centerY" className="text-xs">Y</Label>
                <Input
                  id="centerY"
                  type="number"
                  placeholder="64"
                  value={centerY}
                  onChange={(e) => setCenterY(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="centerZ" className="text-xs">Z</Label>
                <Input
                  id="centerZ"
                  type="number"
                  placeholder="0"
                  value={centerZ}
                  onChange={(e) => setCenterZ(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="radius" className="text-xs">Search Radius</Label>
              <Input
                id="radius"
                type="number"
                placeholder="32"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-8"
                onClick={() => setCurrentStep(getStepNumber("Server"))}
              >
                <ChevronLeft className="mr-1 h-3 w-3" />
                Back
              </Button>
              <Button
                onClick={handleCreateStorage}
                size="sm"
                className="flex-1 h-8"
                disabled={createStorage.isPending}
              >
                {createStorage.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                Continue
                <ChevronRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Index Storage Step */}
        {!setupComplete && STEPS[currentStep - 1]?.title === "Index" && (
          <div className="space-y-3">
            {indexingProgress === 0 && !indexingStatus ? (
              <div className="p-2.5 rounded-md border bg-muted/50 text-xs space-y-1.5">
                <p>The bot will scan and index all chests in your storage area.</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  <li>Navigate to storage area</li>
                  <li>Find all chests within radius</li>
                  <li>Open and record contents</li>
                </ul>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>{indexingStatus}</span>
                  <span>{indexingProgress}%</span>
                </div>
                <Progress value={indexingProgress} className="h-2" />
              </div>
            )}

            {indexingProgress < 100 ? (
              <Button
                onClick={handleStartIndexing}
                size="sm"
                className="w-full h-8"
                disabled={startIndexing.isPending || (indexingProgress > 0 && indexingProgress < 100)}
              >
                {(startIndexing.isPending || (indexingProgress > 0 && indexingProgress < 100)) && (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                )}
                {indexingProgress > 0 && indexingProgress < 100 ? "Indexing..." : "Start Indexing"}
              </Button>
            ) : (
              <Button onClick={handleFinish} size="sm" className="w-full h-8">
                <Check className="mr-1.5 h-3 w-3" />
                Finish Setup
              </Button>
            )}
          </div>
        )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
