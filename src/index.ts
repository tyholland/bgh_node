import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { routes } from "../src/routes/routes";
import { auth } from "express-oauth2-jwt-bearer";
import cors from "cors";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());
app.use(
  auth({
    audience: process.env.AUTH0_AUDIENCE,
    issuerBaseURL: process.env.AUTH0_BASE_URL,
  }),
);

app.get("/", (req: Request, res: Response) => {
  res.send("Eazy Budgeting API");
});

routes(app);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
