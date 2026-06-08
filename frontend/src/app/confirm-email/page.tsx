"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/services/supabase";

export default function ConfirmEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get the token from URL
        const token = searchParams.get("token");
        const type = searchParams.get("type");

        if (!token || type !== "email_change") {
          // Try to verify with the current session from the callback
          const { error } = await supabase.auth.verifyOtp({
            token_hash: window.location.hash.substring(1),
            type: "email_change" as any,
          });

          if (!error) {
            setStatus("success");
            setMessage("Email confirmed successfully! You can now log in with your credentials.");
            setTimeout(() => router.push("/login"), 2000);
            return;
          }
        }

        // If we get here, the verification happened via redirect
        // Supabase automatically handles this - just check if user is authenticated
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setStatus("success");
          setMessage("Email confirmed successfully! Redirecting to your account...");
          setTimeout(() => router.push("/apply"), 2000);
        } else {
          setStatus("success");
          setMessage("Email confirmed successfully! You can now log in with your credentials.");
          setTimeout(() => router.push("/login"), 2000);
        }
      } catch (error: any) {
        console.error("Verification error:", error);
        setStatus("error");
        setMessage("Failed to verify email. Please try again or contact support.");
      }
    };

    verifyEmail();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-3xl border border-[#D4D1C8] bg-[#FFFFFF]/95 px-8 py-10 shadow-lg shadow-black/5 text-center">
        {status === "loading" && (
          <>
            <div className="mb-4 w-8 h-8 mx-auto border-4 border-[#D4D1C8] border-t-[var(--primary)] rounded-full animate-spin" />
            <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">Verifying</p>
            <h1 className="mt-3 text-2xl font-semibold text-[#111111]">Confirming your email</h1>
            <p className="mt-3 text-sm text-[#5D5D5D]">Please wait while we verify your email address...</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mb-4 text-4xl">✓</div>
            <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">Email verified</p>
            <h1 className="mt-3 text-2xl font-semibold text-[#111111]">Email confirmed!</h1>
            <p className="mt-3 text-sm text-[#5D5D5D]">{message}</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mb-4 text-4xl">✕</div>
            <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">Verification failed</p>
            <h1 className="mt-3 text-2xl font-semibold text-[#111111]">Verification error</h1>
            <p className="mt-3 text-sm text-[#5D5D5D]">{message}</p>
            <a
              href="/login"
              className="mt-6 inline-block rounded-2xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-[#EFECE3] hover:bg-[var(--primary-hover)]"
            >
              Back to login
            </a>
          </>
        )}
      </div>
    </div>
  );
}
