/**
 * Mounts the better-auth Node handler at /api/auth/*.
 *
 * Docs: https://better-auth.com/docs/integrations/express#mount-the-handler
 *
 * Two things are load-bearing here:
 * 1. toNodeHandler(auth) owns the whole /api/auth subtree. iskole adds NO custom auth
 *    routes: no sign-in, sign-out, session, verification or reset endpoints of our own.
 * 2. It must be mounted BEFORE express.json(). A body parser consumes the request
 *    stream, and better-auth's handler needs to read it itself.
 *
 * Express 5 uses the named wildcard syntax (/api/auth/*splat). Express 4 would need
 * /api/auth/*. Check the express version in apps/api/package.json before changing this.
 */
import { Router } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from '../lib/auth';

export const authRouter = Router();

authRouter.all('/auth/*splat', toNodeHandler(auth));
