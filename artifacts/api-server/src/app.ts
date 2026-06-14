import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

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
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Response-time header — intercepts res.end() so the header is set before flush
app.use((_req, res, next) => {
  const start = Date.now();
  const origEnd = res.end.bind(res) as typeof res.end;
  (res.end as any) = (...args: Parameters<typeof res.end>) => {
    res.setHeader("X-Response-Time", `${Date.now() - start}ms`);
    return origEnd(...args);
  };
  next();
});

app.use("/api", router);

export default app;
