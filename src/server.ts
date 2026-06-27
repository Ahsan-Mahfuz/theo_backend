import mongoose from "mongoose";
import { createServer } from "http";
import config from "./app/config";
import app from "./app";
import { seedSuperAdmin } from "./app/utilities/adminSeeder";
import { initSocket } from "./app/socket";
import { startCalendarSync } from "./app/jobs/calendarSync";
import 'dotenv/config';

const httpServer = createServer(app);

// Initialise Socket.io (real-time chat) on the same HTTP server
initSocket(httpServer);

async function main() {
  try {
    await mongoose.connect(config.database_url as string);
    console.log("✅ Database connected");

    await seedSuperAdmin();

    startCalendarSync();

    httpServer.listen(Number(config.port), () => {
      console.log(`🚀 Gestlio server running on port ${config.port}`);
    });
  } catch (err) {
    console.log(err);
  }
}

main();

process.on("unhandledRejection", () => {
  console.log("unhandledRejection detected, shutting down");
  httpServer.close(() => process.exit(1));
});

process.on("uncaughtException", () => {
  console.log("uncaughtException detected, shutting down");
  process.exit(1);
});
