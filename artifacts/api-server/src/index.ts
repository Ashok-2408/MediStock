import { fileURLToPath } from "node:url";
import path from "node:path";
import app from "./app";
import { logger } from "./lib/logger";

const modulePath = fileURLToPath(import.meta.url);
const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(modulePath);

export { app };
export default app;

if (isDirectExecution) {
  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}
