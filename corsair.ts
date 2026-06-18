import "dotenv/config"

import { getCorsairInstance } from "./lib/corsair/server"

const corsair = getCorsairInstance()
const corsairConfig = {
  corsair,
}

export { corsair }

export default corsairConfig
