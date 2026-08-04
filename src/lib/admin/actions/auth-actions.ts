"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server Actions for authentication.
 *
 * Login uses Supabase Auth email/password. No public registration exists —
 * administrators are provisioned via the admin_users table + Supabase dashboard.
 */

export interface AuthActionResult {
  readonly error?: string;
}

export async function loginAction(
  formData: FormData,
): Promise<AuthActionResult> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createAdminClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  // Verify this user is actually an admin
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication failed." };
  }

  const { data: adminRecord } = await supabase
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!adminRecord) {
    // User exists in auth but is not an admin — sign them out
    await supabase.auth.signOut();
    return { error: "You do not have administrator access." };
  }

  redirect("/admin");
}

export async function logoutAction(): Promise<never> {
  const supabase = await createAdminClient();
  await supabase.auth.signOut();
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}
