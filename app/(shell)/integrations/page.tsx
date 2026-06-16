import { Suspense } from "react"

import {
  IntegrationSkeleton,
  IntegrationsDashboard,
} from "@/components/integrations/integrations-dashboard"

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<IntegrationSkeleton />}>
      <IntegrationsDashboard />
    </Suspense>
  )
}
