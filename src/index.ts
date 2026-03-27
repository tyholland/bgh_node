import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { privateRoutes } from "./routes/privateRoutes";
import cors from "cors";
import { budgetNewYear } from "./utils/cronJobs";
import { publicRoutes } from "./routes/publicRoutes";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("Simple Budgeting API");
});

publicRoutes(app);
privateRoutes(app);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
  budgetNewYear();
});
