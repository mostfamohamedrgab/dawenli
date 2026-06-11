// Preview-only entry: starts the dashboard HTTP server WITHOUT the Telegram bot,
// so it doesn't conflict with the live polling bot on the VPS. Not used in prod.
import { startServer } from "./server.js";
startServer();
