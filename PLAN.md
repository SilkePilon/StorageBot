# StorageBot - Minecraft Storage Management System

## Project Overview

A full-stack application for managing Minecraft storage systems using a bot controlled via a modern web interface.

## Tech Stack

### Backend

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js + Socket.IO for real-time communication
- **Bot**: Mineflayer with pathfinder plugin
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT for user auth, MSA (Microsoft) for bot auth

### Frontend

- **Framework**: Next.js 14 (App Router)
- **UI Components**: shadcn/ui (Radix + Tailwind)
- **State Management**: React Query + Zustand
- **Real-time**: Socket.IO client

### Infrastructure

- **Containerization**: Docker & Docker Compose
- **Database**: PostgreSQL in Docker

---

## Features

### Phase 1: Core Infrastructure ✅

- [x] Project structure setup
- [x] Docker Compose configuration (PostgreSQL)
- [x] Database schema design
- [x] Backend API scaffolding
- [x] Frontend Next.js setup with shadcn

### Phase 2: Authentication System ✅

- [x] User registration/login (JWT)
- [x] Protected routes
- [x] User session management

### Phase 3: Bot Management ✅

- [x] Create bot instances per user
- [x] Microsoft MSA authentication flow (device code)
- [x] Server connection settings (host, port, auto-version)
- [x] Bot status monitoring (WebSocket)

### Phase 4: Setup Wizard ✅

- [x] Step 1: Microsoft account authentication
- [x] Step 2: Server connection settings
- [x] Step 3: Storage area coordinates selection
- [x] Step 4: Chest indexing with radius configuration

### Phase 5: Storage System ✅

- [x] Pathfinding to storage area
- [x] Chest discovery in radius
- [x] Chest content indexing
- [x] Save to database (position, contents, timestamp)
- [x] Real-time indexing progress

### Phase 6: Inventory Dashboard ✅

- [x] Display all indexed items
- [x] Search/filter items
- [x] View chest locations
- [x] Re-index functionality

### Phase 7: Multi-Bot Support ✅

- [x] Multiple bots per user
- [x] Multiple storage systems per bot
- [x] Bot switching in UI

---

## Database Schema

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // hashed
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  bots      Bot[]
}

model Bot {
  id              String   @id @default(uuid())
  name            String
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  // Server connection
  serverHost      String?
  serverPort      Int      @default(25565)
  serverVersion   String?  // null = auto-detect

  // Microsoft auth (email for mineflayer cache)
  microsoftEmail  String?
  isAuthenticated Boolean  @default(false)

  // Status
  isOnline        Boolean  @default(false)
  lastSeen        DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  storageSystems  StorageSystem[]
}

model StorageSystem {
  id        String   @id @default(uuid())
  name      String
  botId     String
  bot       Bot      @relation(fields: [botId], references: [id])

  // Center coordinates
  centerX   Int
  centerY   Int
  centerZ   Int
  radius    Int      @default(32)

  // Indexing status
  isIndexed     Boolean  @default(false)
  lastIndexed   DateTime?
  indexProgress Int      @default(0) // 0-100

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  chests    Chest[]
}

model Chest {
  id              String   @id @default(uuid())
  storageSystemId String
  storageSystem   StorageSystem @relation(fields: [storageSystemId], references: [id])

  // Position
  x               Int
  y               Int
  z               Int

  // Type
  isDoubleChest   Boolean  @default(false)
  chestType       String   @default("chest") // chest, trapped_chest, barrel, etc.

  lastOpened      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  items           ChestItem[]

  @@unique([storageSystemId, x, y, z])
}

model ChestItem {
  id        String   @id @default(uuid())
  chestId   String
  chest     Chest    @relation(fields: [chestId], references: [id], onDelete: Cascade)

  slot      Int
  itemId    String   // minecraft:diamond, etc.
  itemName  String   // Display name
  count     Int
  nbt       Json?    // NBT data if any

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([chestId, slot])
}
```

---

## API Endpoints

### Auth

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Bots

- `GET /api/bots` - List user's bots
- `POST /api/bots` - Create new bot
- `GET /api/bots/:id` - Get bot details
- `PATCH /api/bots/:id` - Update bot settings
- `DELETE /api/bots/:id` - Delete bot
- `POST /api/bots/:id/connect` - Connect bot to server
- `POST /api/bots/:id/disconnect` - Disconnect bot
- `GET /api/bots/:id/status` - Get bot real-time status

### Bot Authentication

- `POST /api/bots/:id/auth/start` - Start MSA device code flow
- `GET /api/bots/:id/auth/status` - Check auth status

### Storage Systems

- `GET /api/bots/:id/storage` - List storage systems
- `POST /api/bots/:id/storage` - Create storage system
- `PATCH /api/storage/:id` - Update storage system
- `DELETE /api/storage/:id` - Delete storage system
- `POST /api/storage/:id/index` - Start indexing chests
- `GET /api/storage/:id/progress` - Get indexing progress

### Inventory

- `GET /api/storage/:id/items` - List all items in storage
- `GET /api/storage/:id/chests` - List all chests
- `GET /api/storage/:id/search` - Search items

---

## WebSocket Events

### Client -> Server

- `bot:connect` - Connect bot to server
- `bot:disconnect` - Disconnect bot
- `bot:goto` - Move bot to coordinates
- `storage:startIndex` - Start chest indexing

### Server -> Client

- `bot:status` - Bot status update (health, position, etc.)
- `bot:authCode` - MSA device code for authentication
- `bot:connected` - Bot connected to server
- `bot:disconnected` - Bot disconnected
- `storage:indexProgress` - Indexing progress update
- `storage:indexComplete` - Indexing finished
- `storage:chestFound` - New chest discovered
- `storage:itemsUpdated` - Chest contents updated

---

## File Structure

```
StorageBot/
├── docker-compose.yml
├── PLAN.md
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   └── schema.prisma
│   └── src/
│       ├── index.ts              # Entry point
│       ├── config/
│       │   └── index.ts          # Environment config
│       ├── lib/
│       │   ├── prisma.ts         # Prisma client
│       │   └── socket.ts         # Socket.IO setup
│       ├── middleware/
│       │   └── auth.ts           # JWT middleware
│       ├── routes/
│       │   ├── auth.ts
│       │   ├── bots.ts
│       │   └── storage.ts
│       ├── services/
│       │   ├── auth.service.ts
│       │   ├── bot.service.ts
│       │   └── storage.service.ts
│       └── bot/
│           ├── BotManager.ts     # Manages all bot instances
│           ├── BotInstance.ts    # Single bot wrapper
│           └── StorageIndexer.ts # Chest discovery & indexing
│
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.js
    ├── tsconfig.json
    ├── components.json          # shadcn config
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx             # Landing/redirect
    │   ├── (auth)/
    │   │   ├── login/page.tsx
    │   │   └── register/page.tsx
    │   ├── (dashboard)/
    │   │   ├── layout.tsx       # Dashboard layout
    │   │   ├── dashboard/page.tsx
    │   │   ├── bots/
    │   │   │   ├── page.tsx     # Bot list
    │   │   │   ├── new/page.tsx # Create bot
    │   │   │   └── [id]/
    │   │   │       ├── page.tsx # Bot details
    │   │   │       └── setup/page.tsx # Setup wizard
    │   │   └── storage/
    │   │       └── [id]/page.tsx # Storage inventory view
    │   └── api/                  # Next.js API routes (proxy to backend)
    ├── components/
    │   ├── ui/                   # shadcn components
    │   ├── auth/
    │   ├── bots/
    │   ├── storage/
    │   └── setup/
    │       └── SetupWizard.tsx   # Multi-step setup
    ├── lib/
    │   ├── api.ts               # API client
    │   ├── socket.ts            # Socket.IO client
    │   └── utils.ts
    ├── hooks/
    │   ├── useAuth.ts
    │   ├── useBot.ts
    │   └── useSocket.ts
    └── stores/
        ├── authStore.ts
        └── botStore.ts
```

---

## Development Progress

### Current Sprint: Core Infrastructure

#### Tasks

- [x] Create project plan
- [ ] Set up Docker Compose with PostgreSQL
- [ ] Initialize backend with TypeScript
- [ ] Initialize frontend with Next.js
- [ ] Set up Prisma and database schema
- [ ] Install shadcn/ui components

---

## Notes

- Mineflayer caches MSA tokens automatically in ~/.minecraft or custom profilesFolder
- Use `version: false` for automatic server version detection
- Use `GoalGetToBlock` for pathfinding to chests (stops adjacent)
- Add delays between chest operations to avoid server kicks
- Implement reconnection with exponential backoff
