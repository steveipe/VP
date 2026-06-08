"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/services/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/apply");
    }
  }, [user, loading, router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);

    if (!email.trim()) {
      setStatusMessage({ type: "error", text: "Email is required." });
      return;
    }

    if (!password.trim()) {
      setStatusMessage({ type: "error", text: "Password is required." });
      return;
    }

    setLogging(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        setStatusMessage({ type: "error", text: `Login failed: ${error.message}` });
      } else if (data.session) {
        setStatusMessage({ type: "success", text: "Login successful! Redirecting..." });
        setEmail("");
        setPassword("");
        setTimeout(() => router.push("/apply"), 500);
      }
    } catch (err: any) {
      setStatusMessage({ type: "error", text: `Error: ${err.message || "Login failed"}` });
    } finally {
      setLogging(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-[#D4D1C8] bg-[#FFFFFF]/95 px-8 py-10 shadow-lg shadow-black/5">
        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">Vendor access</p>
          <h1 className="mt-4 text-3xl font-semibold text-[#111111]">Sign in to your account</h1>
          <p className="mt-3 text-sm text-[#5D5D5D]">Enter your email and password to access your profile and proposals.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-[#333333]">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-[#F7F5F1] px-4 py-3 text-sm outline-none transition focus:border-[#4A70A9] focus:ring-2 focus:ring-[#4A70A980]"
            />
          </label>

          <label className="block text-sm font-medium text-[#333333]">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
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
            disabled={logging}
            className="w-full rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[#EFECE3] transition hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {logging ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#666666]">
          <p>
            Don't have an account?{" "}
            <a href="/signup" className="font-semibold text-[var(--primary)] hover:underline">
              Create one
            </a>
          </p>
        </div>

        <div className="mt-6 border-t border-[#D4D1C8] pt-6 text-center text-xs text-[#666666]">
          <p>After signing in, you can view your account and all generated vendor proposals.</p>
        </div>
      </div>
    </div>
  );
}
