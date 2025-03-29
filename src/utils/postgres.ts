import { Client, ClientConfig } from "pg";

const clientFields: ClientConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB,
  ssl: process.env.DB_SSL ? process.env.DB_SSL === "true" : false,
};

const client = new Client(clientFields);

client.connect();

export default client;
