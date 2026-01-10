"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Bot,
  Box,
  Home,
  Settings,
  HelpCircle,
  LogOut,
  Plus,
} from "lucide-react"

import { useAuthStore } from "@/stores/auth-store"
import { useBots } from "@/hooks/use-bots"
import { useBotStore } from "@/stores/bot-store"
import { NewBotDialog } from "@/components/new-bot-dialog"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const { isMobile } = useSidebar()
  const { user, logout } = useAuthStore()
  const { data: bots } = useBots()
  const botStatuses = useBotStore((state) => state.botStatuses)
  const expandedBotId = useBotStore((state) => state.expandedBotId)

  const handleLogout = () => {
    logout()
    router.push("/login")
  }

  const navSecondary = [
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: Settings,
    },
    {
      title: "Help",
      url: "/dashboard/help",
      icon: HelpCircle,
    },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <Link href="/dashboard">
                <Box className="!size-5 text-primary" />
                <span className="text-base font-semibold">StorageBot</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem className="flex items-center gap-2">
                <NewBotDialog>
                  <SidebarMenuButton
                    tooltip="New Bot"
                    className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear cursor-pointer"
                  >
                    <Plus className="size-4" />
                    <span>New Bot</span>
                  </SidebarMenuButton>
                </NewBotDialog>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Dashboard"
                  isActive={pathname === "/dashboard"}
                >
                  <Link href="/dashboard">
                    <Home className="size-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Bots List */}
        {bots && bots.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Your Bots</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {bots.map((bot: any) => {
                  const status = botStatuses[bot.id] || bot.runtimeStatus
                  const isOnline = status?.connected
                  return (
                    <SidebarMenuItem key={bot.id}>
                      <SidebarMenuButton
                        tooltip={bot.name}
                        isActive={expandedBotId === bot.id}
                        onClick={() => {
                          useBotStore.getState().setExpandedBot(bot.id)
                          router.push("/dashboard")
                        }}
                        className="cursor-pointer"
                      >
                        <div className="relative">
                          <Bot className="size-4" />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ${
                              isOnline ? "bg-green-500" : "bg-muted-foreground"
                            }`}
                          />
                        </div>
                        <span className="truncate">{bot.name}</span>
                        {isOnline && (
                          <Badge variant="outline" className="ml-auto text-xs">
                            Online
                          </Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Secondary Navigation */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {navSecondary.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg">
                      {user?.username?.slice(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user?.username || "User"}</span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        {user?.username?.slice(0, 2).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user?.username || "User"}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/settings">
                      <Settings className="mr-2 size-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
