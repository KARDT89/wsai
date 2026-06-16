import { Badge } from "@/components/ui/badge"

type PlaceholderSurfaceProps = {
  title: string
  eyebrow: string
  description: string
}

export function PlaceholderSurface({
  title,
  eyebrow,
  description,
}: PlaceholderSurfaceProps) {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] items-center justify-center bg-muted/20 p-6">
      <section className="w-full max-w-2xl rounded-lg border bg-background p-6">
        <Badge variant="outline">{eyebrow}</Badge>
        <h1 className="mt-4 text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </section>
    </div>
  )
}
