import { startServer } from "./server.js";
import { startScheduler } from "./scheduler.js";
import { startMachineSync } from "./machine.js";

console.log("✍️  دوّنلي — بيبدأ...");
startServer();
startScheduler();
startMachineSync();
