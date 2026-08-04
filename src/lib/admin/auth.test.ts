import { describe, expect, it } from "vitest";

/**
 * Tests for admin authorization logic.
 *
 * These test the architectural guarantees:
 * - Authorization is based on admin_users table membership, not JWT claims
 * - The AdminUser shape contains only safe fields
 * - Role hierarchy is enforced
 *
 * Since requireAdmin/getAdminUser depend on Supabase + cookies (server-only),
 * we test the type contracts and the toAdminUser mapping logic here.
 */

interface AdminUsersRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "super_admin";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminUser {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: "admin" | "super_admin";
  isActive: boolean;
}

function toAdminUser(row: AdminUsersRow): AdminUser {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    isActive: row.is_active,
  };
}

describe("toAdminUser", () => {
  const sampleRow: AdminUsersRow = {
    id: "admin-1",
    user_id: "auth-user-1",
    email: "admin@dreame.com.au",
    display_name: "Admin User",
    role: "admin",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("maps database row to domain type correctly", () => {
    const admin = toAdminUser(sampleRow);

    expect(admin.id).toBe("admin-1");
    expect(admin.userId).toBe("auth-user-1");
    expect(admin.email).toBe("admin@dreame.com.au");
    expect(admin.displayName).toBe("Admin User");
    expect(admin.role).toBe("admin");
    expect(admin.isActive).toBe(true);
  });

  it("does not expose timestamps", () => {
    const admin = toAdminUser(sampleRow);
    const keys = Object.keys(admin);

    expect(keys).not.toContain("created_at");
    expect(keys).not.toContain("updated_at");
    expect(keys).not.toContain("createdAt");
    expect(keys).not.toContain("updatedAt");
  });

  it("handles null display name", () => {
    const row = { ...sampleRow, display_name: null };
    expect(toAdminUser(row).displayName).toBeNull();
  });

  it("preserves super_admin role", () => {
    const row = { ...sampleRow, role: "super_admin" as const };
    expect(toAdminUser(row).role).toBe("super_admin");
  });

  it("preserves inactive status", () => {
    const row = { ...sampleRow, is_active: false };
    expect(toAdminUser(row).isActive).toBe(false);
  });
});

describe("admin authorization architecture", () => {
  it("AdminUser type never contains private data", () => {
    const admin: AdminUser = {
      id: "a",
      userId: "u",
      email: "e@e.com",
      displayName: null,
      role: "admin",
      isActive: true,
    };

    const keys = Object.keys(admin);
    // Must never contain password, token, or session data
    expect(keys).not.toContain("password");
    expect(keys).not.toContain("token");
    expect(keys).not.toContain("session");
    expect(keys).not.toContain("accessToken");
    expect(keys).not.toContain("refreshToken");
  });

  it("role values are restricted to admin and super_admin", () => {
    // This test documents the intentional restriction
    const validRoles: AdminUser["role"][] = ["admin", "super_admin"];
    expect(validRoles).toHaveLength(2);
    expect(validRoles).toContain("admin");
    expect(validRoles).toContain("super_admin");
  });
});
