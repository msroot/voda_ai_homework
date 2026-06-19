import "dotenv/config";
import pool from "../src/db.js";
import { runSeed } from "./index.js";

runSeed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
