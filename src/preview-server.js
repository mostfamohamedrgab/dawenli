// Preview-only entry: starts the dashboard HTTP server WITHOUT the scheduler,
// so local previews don't fire check-ins/reminders. Production uses index.js.
import { startServer } from "./server.js";
startServer();
