"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient } from "@/lib/auth-client"

type SignupFormValues = {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const form = useForm<SignupFormValues>({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  const signupMutation = useMutation({
    mutationFn: async ({ confirmPassword, ...values }: SignupFormValues) => {
      if (values.password !== confirmPassword) {
        throw new Error("Passwords do not match.")
      }

      const result = await authClient.signUp.email({
        ...values,
        callbackURL: "/dashboard",
      })

      if (result.error) {
        throw new Error(result.error.message ?? "Unable to create account.")
      }

      return result.data
    },
    onSuccess: () => {
      router.push("/dashboard")
      router.refresh()
    },
  })

  const socialMutation = useMutation({
    mutationFn: async (provider: "github" | "google") => {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/dashboard",
      })

      if (result.error) {
        throw new Error(
          result.error.message ?? "Unable to continue with this provider."
        )
      }

      return result.data
    },
  })

  const isPending = signupMutation.isPending || socialMutation.isPending
  const error = signupMutation.error?.message ?? socialMutation.error?.message

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>
            Enter your email below to create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={form.handleSubmit((values) =>
              signupMutation.mutate(values)
            )}
          >
            <FieldGroup>
              <Field>
                <Button
                  variant="outline"
                  type="button"
                  disabled={isPending}
                  onClick={() => socialMutation.mutate("github")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.725-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.775.418-1.305.762-1.605-2.665-.3-5.467-1.332-5.467-5.93 0-1.31.467-2.382 1.235-3.222-.123-.303-.535-1.523.118-3.177 0 0 1.008-.322 3.3 1.23.957-.267 1.983-.4 3.003-.405 1.02.005 2.047.138 3.005.405 2.29-1.552 3.297-1.23 3.297-1.23.653 1.654.242 2.874.12 3.177.77.84 1.232 1.912 1.232 3.222 0 4.61-2.807 5.625-5.48 5.922.43.372.815 1.103.815 2.222 0 1.605-.015 2.898-.015 3.293 0 .322.217.695.825.577C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                      fill="currentColor"
                    />
                  </svg>
                  Continue with GitHub
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  disabled={isPending}
                  onClick={() => socialMutation.mutate("google")}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  Continue with Google
                </Button>
              </Field>
              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>
              <Field>
                <FieldLabel htmlFor="name">Full Name</FieldLabel>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  autoComplete="name"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register("name", {
                    required: "Name is required.",
                  })}
                  required
                />
                {form.formState.errors.name ? (
                  <FieldDescription className="text-destructive">
                    {form.formState.errors.name.message}
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email", {
                    required: "Email is required.",
                    pattern: {
                      value: /^\S+@\S+$/i,
                      message: "Enter a valid email address.",
                    },
                  })}
                  required
                />
                {form.formState.errors.email ? (
                  <FieldDescription className="text-destructive">
                    {form.formState.errors.email.message}
                  </FieldDescription>
                ) : null}
              </Field>
              <Field>
                <Field className="grid grid-cols-2 gap-4">
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={Boolean(form.formState.errors.password)}
                      {...form.register("password", {
                        required: "Password is required.",
                        minLength: {
                          value: 8,
                          message: "Password must be at least 8 characters.",
                        },
                      })}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="confirm-password">
                      Confirm Password
                    </FieldLabel>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={Boolean(
                        form.formState.errors.confirmPassword
                      )}
                      {...form.register("confirmPassword", {
                        required: "Please confirm your password.",
                        validate: (value) =>
                          value === form.getValues("password") ||
                          "Passwords do not match.",
                      })}
                      required
                    />
                  </Field>
                </Field>
                {form.formState.errors.password ||
                form.formState.errors.confirmPassword ? (
                  <FieldDescription className="text-destructive">
                    {form.formState.errors.password?.message ??
                      form.formState.errors.confirmPassword?.message}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    Must be at least 8 characters long.
                  </FieldDescription>
                )}
              </Field>
              {error ? (
                <FieldDescription className="text-destructive">
                  {error}
                </FieldDescription>
              ) : null}
              <Field>
                <Button type="submit" disabled={isPending}>
                  {signupMutation.isPending ? "Creating..." : "Create Account"}
                </Button>
                <FieldDescription className="text-center">
                  Already have an account? <Link href="/login">Sign in</Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </FieldDescription>
    </div>
  )
}
