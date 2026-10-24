# Architecture

## System Overview

iskole is a monorepo with Next.js frontend and Express API, sharing types via packages/shared.

## Diagram

`mermaid
graph TD
    A[Next.js Web App] -->|/api/* proxy| B[Express API]
    B --> C[Postgres DB]
    B --> D[Mailpit/SMTP]
    B --> E[AI Services]
`

## Components

- **apps/web**: Next.js App Router frontend
- **apps/api**: Express API server with Prisma ORM
- **packages/shared**: Shared Zod schemas and types
