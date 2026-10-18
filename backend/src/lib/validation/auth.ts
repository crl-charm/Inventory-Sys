import { z } from "zod";

/**
 * Shared Zod schemas for auth (used by route handlers).
 * Zod v4 API: z.uuid(), z.iso.date() are top-level.
 */

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Enter your username.")
    .max(80, "Username is too long."),
  password: z
    .string()
    .min(1, "Enter your password.")
    .max(200, "Password is too long."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters.")
      .max(200, "New password is too long."),
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "The two passwords do not match.",
    path: ["confirmPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
