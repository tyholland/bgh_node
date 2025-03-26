import { Client, ClientConfig } from "pg";

const clientFields: ClientConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB,
};

const client = new Client(clientFields);

client.connect();

export default client;
