import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
// If your Prisma file is located elsewhere, you can change the path
import { prisma } from "./db";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "postgresql", ...etc
    }),
    emailAndPassword: {
        enabled: true,
    },
    socialProviders: {
        github: {
            clientId: process.env.BETTER_AUTH_GITHUB_CLIENT_ID as string,
            clientSecret: process.env.BETTER_AUTH_GITHUB_CLIENT_SECRET as string,
        },
        google: { 
            clientId: process.env.BETTER_AUTH_GOOGLE_CLIENT_ID as string, 
            clientSecret: process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET as string, 
        }, 
    },
    plugins: [nextCookies()],
});
