# StorageBot

<div align="center">

![Minecraft](https://img.shields.io/badge/Minecraft-1.8--1.21-brightgreen)
![Node.js](https://img.shields.io/badge/Node.js-18+-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)
![Status](https://img.shields.io/badge/Status-Early%20Development-orange)

**A Minecraft storage management bot with a modern web interface inspired by [Gringotts](https://2b2t.miraheze.org/wiki/User:Bezo/Drafts/Gringotts)**

_Automatically index, search, and retrieve items from your storage systems_

</div>

---

> **Early Development Notice**
>
> StorageBot is currently in **early development**. While core features are functional, you may encounter bugs or incomplete functionality. Your feedback is invaluable!
>
> **Found a bug or have a feature request?** Please open an issue on the [GitHub Issues](https://github.com/SilkePilon/StorageBot/issues) page. We appreciate all contributions and feedback from the community!
>
> ### Roadmap
>
> - [X] Automated Storage Indexing
> - [X] Smart Search
> - [X] Real-time Dashboard
> - [X] Task System
> - [X] Multiple Delivery Methods
> - [X] Microsoft Authentication
> - [X] Multi-user Support
> - [X] Real-time Updates via WebSocket
> - [ ] Random item sorting across storage chests
> - [ ] Category-based item sorting
> - [ ] Litematica schematic upload support
> - [ ] Automatic material gathering (from storage) for schematics

---

## Features

- **Automated Storage Indexing** - Bot automatically scans and catalogs all chests in your storage area
- **Smart Search** - Quickly find any item across hundreds of chests
- **Real-time Dashboard** - Modern web UI showing storage statistics and item counts
- **Task System** - Request items and the bot will collect and deliver them
- **Multiple Delivery Methods** - Direct drop, chest deposit, or shulker box packing
- **Microsoft Authentication** - Secure MSA login with device code flow
- **Multi-user Support** - Multiple users can manage their own bots
- **Real-time Updates** - Live status updates via WebSocket

## Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker](https://www.docker.com/) and Docker Compose (for PostgreSQL database)
- A Minecraft account (Java Edition)
- A Minecraft server to connect to

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/SilkePilon/StorageBot.git
cd StorageBot
```

### 2. Start the Database

```bash
docker-compose up -d
```

This starts a PostgreSQL database on port 5432.

### 3. Setup the Backend

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
DATABASE_URL="postgresql://storagebot:storagebot_secret@localhost:5432/storagebot"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
PORT=3001
FRONTEND_URL="http://localhost:3000"
NODE_ENV="development"
```

> ⚠️ **Important:** In production, always use a strong, unique `JWT_SECRET`!

```bash
# Generate Prisma client and push schema to database
npm run db:generate
npm run db:push

# Start the backend server
npm run dev
```

### 4. Setup the Frontend

Open a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

### 5. Access the Web Interface

Open your browser and navigate to:

```
http://localhost:3000
```

## How to Use

### First Time Setup

1. **Create an Account** - Register with an email and password on the login page
2. **Create a Bot** - Click "New Bot" and give it a name
3. **Setup Wizard** - Follow the setup wizard:
   - **Authentication**: Enter your Microsoft account email and complete the device code login
   - **Server**: Enter your Minecraft server address and port
   - **Storage Area**: Define the center coordinates and radius of your storage system
   - **Indexing**: Click "Start Indexing" to scan all chests in the area

### Dashboard Overview

- **Storage Stats** - View total items, unique item types, and chest count
- **Item Browser** - Search and browse all indexed items
- **Recent Activity** - See bot actions and task history

### Requesting Items

1. Click on any item in the storage browser
2. Select the quantity you need
3. Choose a delivery method:
   - **Drop** - Bot drops items at its current location
   - **Chest** - Bot deposits items into a specified chest
   - **Shulker Drop** - Bot packs items into shulker boxes and drops them
   - **Shulker Chest** - Bot packs items into shulkers and stores in a chest
4. Set the delivery coordinates
5. Click "Create Task"

The bot will automatically navigate to collect the items and deliver them to the specified location.

### Re-indexing Storage

Storage contents change over time. To update the index:

1. Go to your bot's settings
2. Click "Re-index Storage"
3. Wait for the indexing to complete

## Project Structure

```
StorageBot/
├── backend/                 # Express.js API server
│   ├── src/
│   │   ├── bot/            # Mineflayer bot logic
│   │   ├── config/         # Configuration
│   │   ├── lib/            # Utilities (Prisma, Socket.IO)
│   │   ├── middleware/     # Express middleware
│   │   └── routes/         # API routes
│   └── prisma/             # Database schema
├── frontend/               # Next.js web application
│   ├── app/               # Next.js app router pages
│   ├── components/        # React components
│   │   └── ui/           # shadcn/ui components
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities
│   └── stores/           # Zustand state stores
└── docker-compose.yml    # Database setup
```

## Configuration

### Backend Environment Variables

| Variable         | Description                  | Default                   |
| ---------------- | ---------------------------- | ------------------------- |
| `DATABASE_URL` | PostgreSQL connection string | Required                  |
| `JWT_SECRET`   | Secret key for JWT tokens    | Required                  |
| `PORT`         | API server port              | `3001`                  |
| `FRONTEND_URL` | Frontend URL for CORS        | `http://localhost:3000` |
| `NODE_ENV`     | Environment mode             | `development`           |

### Frontend Environment Variables

| Variable                | Description     | Default                   |
| ----------------------- | --------------- | ------------------------- |
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:3001` |

## Development

### Running in Development Mode

**Backend:**

```bash
cd backend
npm run dev
```

**Frontend:**

```bash
cd frontend
npm run dev
```

### Database Management

```bash
# View database in Prisma Studio
npm run db:studio

# Create a new migration
npm run db:migrate

# Push schema changes (development only)
npm run db:push
```

## Troubleshooting

### Bot won't connect to server

- Verify the server address and port are correct
- Ensure the server allows the Minecraft version the bot is using
- Check if the server has online-mode enabled (requires valid Microsoft account)

### Authentication issues

- Make sure you're using the correct Microsoft account email
- Complete the device code login within the time limit
- Check that your Minecraft account has a valid game license

### Items not found during indexing

- Ensure the bot can physically access all chests (no blocks in the way)
- Verify the storage area coordinates and radius include all chests
- The bot cannot break blocks - ensure pathways are clear

### Database connection errors

- Verify Docker is running: `docker ps`
- Check the database container: `docker-compose logs postgres`
- Ensure `DATABASE_URL` in `.env` matches the docker-compose configuration

## Contributing

Contributions are welcome! Since this project is in early development, there are many ways to help:

1. **Report Bugs** - Open an issue describing the bug and steps to reproduce
2. **Request Features** - Share your ideas for new features
3. **Submit PRs** - Fix bugs or implement new features
4. **Improve Docs** - Help improve this README or add documentation

Please open an issue on our [GitHub Issues](https://github.com/SilkePilon/StorageBot/issues) page for any bugs or feature requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) - Minecraft bot framework
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Prisma](https://www.prisma.io/) - Database ORM
- [Next.js](https://nextjs.org/) - React framework

---

<div align="center">

**Made with love for the Minecraft community**

[Report Bug](https://github.com/SilkePilon/StorageBot/issues) · [Request Feature](https://github.com/SilkePilon/StorageBot/issues)

</div>
