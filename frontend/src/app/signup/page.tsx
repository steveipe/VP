"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/services/supabase";

export default function SignUpPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [formData, setFormData] = useState({
    company_name: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [statusMessage, setStatusMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/apply");
    }
  }, [user, loading, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatusMessage(null);

    // Validation
    if (!formData.company_name.trim()) {
      setStatusMessage({ type: "error", text: "Company name is required." });
      return;
    }
    if (!formData.email.trim()) {
      setStatusMessage({ type: "error", text: "Email is required." });
      return;
    }
    if (!formData.password.trim()) {
      setStatusMessage({ type: "error", text: "Password is required." });
      return;
    }
    if (formData.password.length < 8) {
      setStatusMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    if (formData.password !== formData.confirm_password) {
      setStatusMessage({ type: "error", text: "Passwords do not match." });
      return;
    }

    setSending(true);
    try {
      // Sign up user with Supabase
      const { data, error: signupError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            company_name: formData.company_name.trim(),
          },
          emailRedirectTo: `${window.location.origin}/confirm-email`,
        },
      });

      if (signupError) {
        setStatusMessage({ type: "error", text: `Sign-up failed: ${signupError.message}` });
        setSending(false);
        return;
      }

      setStatusMessage({
        type: "success",
        text: "Account created successfully! You can now sign in with your email and password. A confirmation email may take a few minutes to arrive.",
      });
      setFormData({ company_name: "", email: "", password: "", confirm_password: "" });
      
      // Redirect to login after 2 seconds
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Error: ${err.message || "Sign-up failed"}` });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-[#D4D1C8] bg-[#FFFFFF]/95 px-8 py-10 shadow-lg shadow-black/5">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">Create vendor account</p>
          <h1 className="mt-4 text-3xl font-semibold text-[#111111]">Sign up to get started</h1>
          <p className="mt-3 text-sm text-[#5D5D5D]">Create an account to build and manage your vendor proposals.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-[#333333]">
            Company name
            <input
              type="text"
              name="company_name"
              value={formData.company_name}
              onChange={handleChange}
              placeholder="Your Company Inc."
              className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-[#F7F5F1] px-4 py-3 text-sm outline-none transition focus:border-[#4A70A9] focus:ring-2 focus:ring-[#4A70A980]"
            />
          </label>

          <label className="block text-sm font-medium text-[#333333]">
            Email address
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-[#F7F5F1] px-4 py-3 text-sm outline-none transition focus:border-[#4A70A9] focus:ring-2 focus:ring-[#4A70A980]"
            />
          </label>

          <label className="block text-sm font-medium text-[#333333]">
            Password
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="At least 8 characters"
              className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-[#F7F5F1] px-4 py-3 text-sm outline-none transition focus:border-[#4A70A9] focus:ring-2 focus:ring-[#4A70A980]"
            />
          </label>

          <label className="block text-sm font-medium text-[#333333]">
            Confirm password
            <input
              type="password"
              name="confirm_password"
              value={formData.confirm_password}
              onChange={handleChange}
              placeholder="Re-enter your password"
              className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-[#F7F5F1] px-4 py-3 text-sm outline-none transition focus:border-[#4A70A9] focus:ring-2 focus:ring-[#4A70A980]"
            />
          </label>

          {statusMessage ? (
            <p className={`text-sm ${statusMessage.type === "error" ? "text-red-600" : "text-green-600"}`}>
              {statusMessage.text}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[#EFECE3] transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? "Creating account..." : "Create account & send confirmation"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#666666]">
          <p>
            Already have an account?{" "}
            <a href="/login" className="font-semibold text-[var(--primary)] hover:underline">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
