# StorageBot - AI Coding Instructions

## Project Overview

StorageBot is a Minecraft storage management system with a **Mineflayer bot backend** and **Next.js frontend**. The bot connects to Minecraft servers, indexes chest contents, and executes item retrieval tasks via a web dashboard.

## Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Next.js App   │◄──────────────────►│  Express API    │
│   (frontend/)   │     REST API       │   (backend/)    │
└─────────────────┘                    └────────┬────────┘
                                                │
                                       ┌────────▼────────┐
                                       │   BotManager    │
                                       │  (Singleton)    │
                                       └────────┬────────┘
                                                │
                                       ┌────────▼────────┐
                                       │  BotInstance    │
                                       │  (Mineflayer)   │
                                       └────────┬────────┘
                                                │
                                       ┌────────▼────────┐
                                       │ Minecraft Server│
                                       └─────────────────┘
```

### Key Components

- **BotManager** (`backend/src/bot/BotManager.ts`): Singleton managing all bot instances, authentication sessions, and task queues
- **BotInstance** (`backend/src/bot/BotInstance.ts`): Individual Mineflayer bot with pathfinding, chest interaction, and task execution
- **Socket.IO** (`backend/src/lib/socket.ts`): Real-time events using room-based subscriptions (`bot:{id}`, `user:{id}`)
- **Prisma ORM** (`backend/prisma/schema.prisma`): PostgreSQL database with User → Bot → StorageSystem → Chest → ChestItem hierarchy

## Development Commands

```bash
# Database (run from project root)
docker-compose up -d                    # Start PostgreSQL

# Backend (cd backend/)
npm run dev                             # Start with tsx watch
npm run db:generate                     # Generate Prisma client
npm run db:push                         # Push schema changes
npm run db:studio                       # Open Prisma Studio GUI

# Frontend (cd frontend/)
npm run dev                             # Start Next.js dev server
```

## Code Patterns

### Backend API Routes

Routes use Zod validation and follow this pattern:
```typescript
// backend/src/routes/*.ts
const schema = z.object({ name: z.string().min(1) });

router.post('/', authMiddleware, async (req: AuthRequest, res) => {
  const data = schema.parse(req.body);
  // ... prisma operations
  res.json(result);
});
```

### Frontend Data Fetching

Uses TanStack Query with custom hooks wrapping the API client:
```typescript
// frontend/hooks/use-*.ts
export function useBots() {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: ["bots"],
    queryFn: () => botsApi.list(token!),
    enabled: !!token,
  });
}
```

### Real-time Updates

Backend emits events via `emitToBot(botId, event, data)`. Frontend subscribes in components:
```typescript
// Frontend pattern
const { socket, subscribeTo } = useSocket();
useEffect(() => {
  subscribeTo(botId);
  socket?.on('bot:status', handleStatus);
  return () => socket?.off('bot:status', handleStatus);
}, [botId]);
```

### State Management

- **Auth**: Zustand with persistence (`frontend/stores/auth-store.ts`)
- **Server state**: TanStack Query with query invalidation on mutations
- **Bot runtime state**: Zustand store updated via WebSocket events

## Database Schema Highlights

- **ChestItem.isShulkerBox**: Items can contain nested `ShulkerContent` records
- **RequestTask**: Queue-based task system with `PENDING → IN_PROGRESS → COMPLETED/FAILED` states
- **RequestItem.sourceLocations**: JSON array caching chest coordinates at task creation time

## Bot Task Execution Flow

1. User creates task via `/api/tasks` with item list and delivery method
2. Backend resolves item locations from indexed storage
3. `BotManager.processTaskQueue()` picks up pending tasks
4. `BotInstance.executeTask()` handles collection and delivery:
   - Direct chest items: Open chest → withdraw → close
   - Shulker items: Take shulker → place → open → extract → break → return shulker

## UI Components

Frontend uses **shadcn/ui** components in `frontend/components/ui/`. Add new components via:
```bash
npx shadcn@latest add <component-name>
```

## Environment Variables

**Backend** (`.env`):
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Token signing key (change in production!)
- `FRONTEND_URL` - CORS origin

**Frontend** (`.env.local`):
- `NEXT_PUBLIC_API_URL` - Backend URL (default: `http://localhost:3001`)

## Important Conventions

1. **Bot auth caching**: Microsoft auth tokens cached in `backend/auth_cache/{botId}/`
2. **Pathfinder settings**: Bots cannot dig blocks (`movements.canDig = false`)
3. **WebSocket throttling**: Bot position updates throttled to 500ms intervals
4. **Task cancellation**: Check `this.taskCancelled` flag during long operations
5. **Shulker handling**: Always return shulkers to original chest after extraction
