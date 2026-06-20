import { MongoClient, type Db } from "mongodb";
import "dotenv/config";

const url = process.env.MONGO_URL ?? "mongodb://localhost:27017";
const dbName = process.env.MONGO_DB ?? "voda_assets";

let client: MongoClient | null = null;
let dbPromise: Promise<Db> | null = null;

export function getMongoDb(): Promise<Db> {
  if (!dbPromise) {
    client = new MongoClient(url);
    dbPromise = client.connect().then((connected) => connected.db(dbName));
  }
  return dbPromise;
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
  dbPromise = null;
}
