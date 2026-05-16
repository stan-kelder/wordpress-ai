"use server"

import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"

type ActionState = { error: string } | undefined

export async function register(prevState: ActionState, formData: FormData): Promise<ActionState> {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const name = formData.get("name") as string

  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return { error: "An account with this email already exists" }
  }

  const hashed = await bcrypt.hash(password, 12)
  await prisma.user.create({ data: { email, password: hashed, name } })

  await signIn("credentials", { email, password, redirectTo: "/dashboard" })
}

export async function login(prevState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" }
    }
    throw error
  }
}
