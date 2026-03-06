"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

interface ProfileFormData {
  name: string;
  email: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface ProfileFormProps {
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

export function ProfileForm({ user }: ProfileFormProps) {
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors, isSubmitting: isProfileSubmitting },
  } = useForm<ProfileFormData>({
    defaultValues: {
      name: user.name || "",
      email: user.email,
    },
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    watch,
    formState: { errors: passwordErrors, isSubmitting: isPasswordSubmitting },
  } = useForm<PasswordFormData>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const newPassword = watch("newPassword");

  async function onProfileSubmit(data: ProfileFormData) {
    setProfileStatus(null);
    setProfileError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to update profile");
      }

      setProfileStatus("Profile updated successfully");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    }
  }

  async function onPasswordSubmit(data: PasswordFormData) {
    setPasswordStatus(null);
    setPasswordError(null);
    try {
      const res = await fetch("/api/users/me/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to change password");
      }

      setPasswordStatus("Password changed successfully");
      resetPassword();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your name and email address.</CardDescription>
        </CardHeader>
        <form onSubmit={handleProfileSubmit(onProfileSubmit)}>
          <CardContent className="space-y-4">
            {profileStatus && (
              <p className="text-sm text-green-600">{profileStatus}</p>
            )}
            {profileError && (
              <p className="text-sm text-red-600">{profileError}</p>
            )}
            <Input
              id="name"
              label="Name"
              {...registerProfile("name", { required: "Name is required" })}
              error={profileErrors.name?.message}
            />
            <Input
              id="email"
              label="Email"
              type="email"
              {...registerProfile("email", {
                required: "Email is required",
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: "Invalid email address",
                },
              })}
              error={profileErrors.email?.message}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isProfileSubmitting}>
              {isProfileSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Ensure your account uses a strong password.</CardDescription>
        </CardHeader>
        <form onSubmit={handlePasswordSubmit(onPasswordSubmit)}>
          <CardContent className="space-y-4">
            {passwordStatus && (
              <p className="text-sm text-green-600">{passwordStatus}</p>
            )}
            {passwordError && (
              <p className="text-sm text-red-600">{passwordError}</p>
            )}
            <Input
              id="currentPassword"
              label="Current Password"
              type="password"
              {...registerPassword("currentPassword", {
                required: "Current password is required",
              })}
              error={passwordErrors.currentPassword?.message}
            />
            <Input
              id="newPassword"
              label="New Password"
              type="password"
              {...registerPassword("newPassword", {
                required: "New password is required",
                minLength: {
                  value: 8,
                  message: "Password must be at least 8 characters",
                },
              })}
              error={passwordErrors.newPassword?.message}
            />
            <Input
              id="confirmPassword"
              label="Confirm New Password"
              type="password"
              {...registerPassword("confirmPassword", {
                required: "Please confirm your new password",
                validate: (value) =>
                  value === newPassword || "Passwords do not match",
              })}
              error={passwordErrors.confirmPassword?.message}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isPasswordSubmitting}>
              {isPasswordSubmitting ? "Changing..." : "Change Password"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
