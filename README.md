# ExtraHand Notification Service

Notification Service for ExtraHand Platform - Handles push notifications, preferences, and FCM token management.

## Overview

This service manages:
- FCM token registration and management
- Notification preferences (push, email, SMS)
- Push notification sending via Firebase Cloud Messaging (FCM)
- Service-to-service notification API

## Port

**4005**

## Features

- ✅ FCM token registration and management
- ✅ Notification preferences management
- ✅ Push notification sending
- ✅ Batch notification sending
- ✅ Preference-based notification filtering
- ✅ Automatic invalid token cleanup
- ✅ Service-to-service authentication

## Setup

### Prerequisites

- Node.js >= 18
- MongoDB
- Firebase project with Cloud Messaging enabled

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`

4. Build the project:
```bash
npm run build
```

5. Start the service:
```bash
npm start
```

For development:
```bash
npm run dev
```

## Environment Variables

See `.env.example` for all required environment variables.

## API Endpoints

### Public Endpoints (Require User Auth)

- `POST /api/v1/notifications/token` - Register/update FCM token
- `DELETE /api/v1/notifications/token` - Remove FCM token
- `GET /api/v1/notifications/preferences` - Get notification preferences
- `PUT /api/v1/notifications/preferences` - Update notification preferences

### Service-to-Service Endpoints (Require Service Auth)

- `POST /api/v1/notifications/send` - Send notification to a user
- `POST /api/v1/notifications/send-batch` - Send notification to multiple users

## Health Check

- `GET /api/v1/health` - Service health check

## Architecture

- **Models**: NotificationPreferences, FCMToken
- **Services**: NotificationService (FCM sending, preference checking)
- **Controllers**: NotificationController
- **Routes**: `/api/v1/notifications/*`

## Service-to-Service Communication

Other services can send notifications by calling:
```
POST /api/v1/notifications/send
Headers:
  X-Service-Auth: <SERVICE_AUTH_TOKEN>
  X-Service-Name: <service-name>
Body:
  {
    "userId": "user-id",
    "type": "task_update",
    "title": "Task Updated",
    "body": "Your task has been updated",
    "data": { "taskId": "..." },
    "category": "taskUpdates"
  }
```

## Notification Categories

- `transactional` - Payments, cancellations, account updates
- `taskUpdates` - Task status changes, comments, offers
- `taskReminders` - Reminders for pending actions
- `keywordTaskAlerts` - Alerts for keyword-matched tasks
- `recommendedTaskAlerts` - Recommended task alerts
- `helpfulInformation` - Tips and advice
- `updatesNewsletters` - Feature updates and newsletters



























