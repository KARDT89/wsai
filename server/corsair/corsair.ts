import "dotenv/config";
import { Pool } from "pg";
import { createCorsair } from "corsair";

import { github } from "@corsair-dev/github";
import { gmail } from "@corsair-dev/gmail";
import { googlecalendar } from "@corsair-dev/googlecalendar";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const corsair = createCorsair({
  plugins: [
    github(),
    gmail(),
    googlecalendar(),
  ],
  database: pool,
  kek: process.env.CORSAIR_KEK!,
  multiTenancy: true,
});