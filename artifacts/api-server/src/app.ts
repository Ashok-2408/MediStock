import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.CLERK_PUBLISHABLE_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
}

app.use("/api", router);

app.use(
  (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    const isAuthRequest =
      req.path === "/api/auth/login" ||
      req.path === "/api/auth/register-customer";
    const isMalformedJson =
      err instanceof SyntaxError &&
      "type" in err &&
      err.type === "entity.parse.failed";

    if (!isAuthRequest) {
      next(err);
      return;
    }

    if (isMalformedJson) {
      res.status(400).json({
        success: false,
        error: "Request body must be valid JSON.",
      });
      return;
    }

    logger.error({ err, method: req.method, path: req.path }, "Auth request failed");
    res.status(500).json({
      success: false,
      error: "The authentication request could not be completed. Please try again.",
    });
  },
);

export default app;
