# Catalyst Web

This is a full-stack Next.js application for Catalyst, providing both the frontend interface and backend API for AI-powered code assistance with cloud VMs.

## Features

- 🚀 **Modern Stack**: Built with Next.js 15, TypeScript, and Tailwind CSS
- 💬 **Chat Interface**: Real-time AI conversation with code assistance
- 📁 **File Explorer**: Browse and manage project files in cloud VMs
- ✏️ **Code Editor**: Integrated Monaco Editor with syntax highlighting
- 📊 **Task Management**: Track and monitor background AI tasks
- 🔄 **Real-time Updates**: Socket.IO integration for live updates
- 🎨 **Beautiful UI**: Built with shadcn/ui components
- 🔐 **Authentication**: JWT-based auth system (ready for implementation)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API server running (see main project README)

### Installation

```bash
# From the project root
cd packages/web

# Install dependencies
npm install
```

### Development

```bash
# Start the development server
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```

## Project Structure

```
packages/web/
├── app/                    # Next.js app router pages
│   ├── (auth)/            # Authentication pages
│   ├── (authenticated)/   # Protected pages
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── chat/             # Chat interface components
│   ├── code-editor/      # Monaco editor wrapper
│   ├── file-explorer/    # File browser components
│   ├── layout/           # Layout components
│   ├── navigation/       # Navigation components
│   ├── tasks/            # Task management components
│   └── ui/               # shadcn/ui components
├── hooks/                 # Custom React hooks
│   ├── use-projects.ts   # Project management hook
│   └── use-realtime-task.ts # Real-time task updates
├── lib/                   # Utility libraries
│   ├── api/              # API client
│   ├── socket/           # Socket.IO client
│   └── utils.ts          # Helper functions
└── stores/               # Zustand state stores
    ├── auth-store.ts     # Authentication state
    ├── chat-store.ts     # Chat conversation state
    └── project-store.ts  # Project management state
```

## Key Components

### Chat Interface

- Real-time messaging with AI assistant
- Tool call visualization
- Message history persistence

### File Explorer

- Tree view of project files
- Click to open files in editor
- Real-time file updates via WebSocket

### Code Editor

- Monaco Editor integration
- Syntax highlighting for multiple languages
- Real-time collaborative editing (ready for implementation)

### Task Management

- Visual task progress tracking
- Real-time status updates
- Task logs and history

## State Management

The app uses Zustand for state management with the following stores:

- **AuthStore**: User authentication and session management
- **ProjectStore**: Project data and operations
- **ChatStore**: Conversation history and messaging state

## API Integration

All API calls are centralized in `lib/api/client.ts` with:

- Automatic token injection
- Error handling and retries
- TypeScript interfaces for all endpoints

## Real-time Features

Socket.IO integration provides:

- Live task progress updates
- File change notifications
- Collaborative features (cursors, selections)
- Connection status management

## Styling

- Tailwind CSS for utility-first styling
- shadcn/ui for consistent component design
- CSS variables for theming support
- Responsive design for all screen sizes

## API Endpoints

The application includes a complete REST API built with Next.js API routes:

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/session` - Get current user session

### Projects

- `GET /api/projects` - List user's projects
- `POST /api/projects` - Create new project
- `GET /api/projects/[id]` - Get project details
- `PUT /api/projects/[id]` - Update project
- `DELETE /api/projects/[id]` - Delete project

### Tasks

- `GET /api/projects/[id]/tasks` - List project tasks
- `POST /api/projects/[id]/tasks` - Create new task
- `GET /api/tasks/[id]` - Get task details
- `POST /api/tasks/[id]/cancel` - Cancel task

### Conversation

- `GET /api/projects/[id]/conversation` - Get conversation history
- `POST /api/projects/[id]/conversation` - Send message

### Files

- `GET /api/projects/[id]/files` - List files in directory
- `GET /api/projects/[id]/files/[...path]` - Read file content
- `PUT /api/projects/[id]/files/[...path]` - Write file content
- `DELETE /api/projects/[id]/files/[...path]` - Delete file

## Database

The application uses MongoDB with Mongoose for data persistence:

- **Users**: Authentication and user profiles
- **Projects**: Project settings and collaborators
- **Tasks**: Background task queue and progress tracking
- **Conversations**: Chat history (currently in-memory)

## Security

- JWT-based authentication with secure token handling
- Protected API routes with authentication middleware
- Role-based access control for projects
- Input validation on all endpoints

## Next Steps

1. **Real-time Features**: Implement WebSocket with Socket.IO
2. **Redis Integration**: Add caching and job queue with Bull
3. **VM Integration**: Connect to actual CodeSandbox or similar VM provider
4. **AI Integration**: Connect to OpenAI or other LLM providers
5. **Production Deployment**: Configure for production with proper environment variables
6. **Testing**: Add unit and integration tests
7. **Monitoring**: Add logging and error tracking
