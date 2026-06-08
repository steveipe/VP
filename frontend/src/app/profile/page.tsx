"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/services/supabase";

interface VendorProposal {
  id: string;
  title: string;
  vendor_name: string;
  price: string;
  timeline: string;
  proposal_file_name: string;
  proposal_file: string;
  proposal_type: string;
  created_at: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading, signOut, updateProfile } = useAuth();
  const [proposals, setProposals] = useState<VendorProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [deletingProposalId, setDeletingProposalId] = useState<string | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ company_name: "", industry: "", location: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const fetchProposals = async () => {
      setLoadingProposals(true);
      console.log("Fetching proposals for user:", user?.id);

      // Load DB-backed proposals
      const { data, error } = await supabase
        .from("proposals")
        .select("*")
        .eq("vendor_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load proposals from DB:", error);
      }

      const dbProposals = (data || []) as VendorProposal[];
      console.log("DB proposals loaded:", dbProposals.length);

      // Also list any files in the proposals storage bucket under the user's prefix
      const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "proposals";
      let storageProposals: VendorProposal[] = [];
      try {
        const prefixes = [user.id, `${user.id}/`];
        let listResult: Awaited<ReturnType<typeof supabase.storage.from>> | null = null;
        let usedPrefix = "";

        for (const prefix of prefixes) {
          const result = await supabase.storage.from(bucket).list(prefix, { limit: 100 });
          console.log(`Storage list attempt for prefix '${prefix}':`, result);
          if (!result.error && result.data && result.data.length > 0) {
            listResult = result;
            usedPrefix = prefix;
            break;
          }
        }

        if (!listResult) {
          const rootResult = await supabase.storage.from(bucket).list("", { limit: 200 });
          console.log("Storage root list result:", rootResult);
          if (!rootResult.error && rootResult.data) {
            listResult = rootResult;
            usedPrefix = "";
          }
        }

        if (listResult && !listResult.error && listResult.data) {
          const files = listResult.data.filter((file) => {
            if (!usedPrefix) {
              return file.name === user.id || file.name.startsWith(`${user.id}/`) || file.name.includes(`${user.id}/`);
            }
            return true;
          });

          console.log(`Using storage prefix '${usedPrefix}', matched files:`, files.length);
          for (const f of files) {
            let filePath = f.name;
            if (usedPrefix && !f.name.startsWith(`${user.id}/`)) {
              filePath = `${user.id}/${f.name}`;
            }

            try {
              const { data: publicData, error: publicUrlError } = await supabase.storage
                .from(bucket)
                .getPublicUrl(filePath);

              if (publicUrlError || !publicData?.publicUrl) {
                console.debug("Failed to get public URL for file:", filePath, publicUrlError);
                continue;
              }

              console.log("Added storage proposal:", filePath);
              storageProposals.push({
                id: filePath,
                title: f.name,
                vendor_name: profile?.company_name || user.email || "",
                price: "",
                timeline: "",
                proposal_file_name: f.name,
                proposal_file: publicData.publicUrl,
                proposal_type: "generated",
                created_at: (f as any)?.created_at || new Date().toISOString(),
              });
            } catch (e) {
              console.debug("Failed to map storage file to proposal entry:", filePath, e);
            }
          }
        } else {
          console.log("No storage files found for user after fallback attempts.");
        }
      } catch (e) {
        console.error("Failed to list storage proposals:", e);
      }

      // Merge storage files first, then DB proposals (avoid duplicates by file URL)
      const merged = [
        ...storageProposals,
        ...dbProposals.filter((p) => !storageProposals.some((s) => s.proposal_file === p.proposal_file)),
      ];

      console.log("Total proposals:", merged.length, "(storage:", storageProposals.length, "+ db:", dbProposals.length, ")");
      setProposals(merged);
      setLoadingProposals(false);
    };

    void fetchProposals();
  }, [user]);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        company_name: profile.company_name || "",
        industry: profile.industry || "",
        location: profile.location || "",
      });
    }
  }, [profile]);

  const handleProfileFieldChange = (field: keyof typeof profileForm, value: string) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const saveProfileChanges = async () => {
    if (!updateProfile || !user) return;
    setSavingProfile(true);
    setProfileSaveMessage(null);

    try {
      const updated = await updateProfile({
        company_name: profileForm.company_name,
        industry: profileForm.industry,
        location: profileForm.location,
      });
      if (updated) {
        setIsEditingProfile(false);
        setProfileSaveMessage("Profile updated successfully.");
      } else {
        setProfileSaveMessage("Unable to save profile. Please try again.");
      }
    } catch (error) {
      console.error("Failed to update profile:", error);
      setProfileSaveMessage("Failed to save profile. Please try again.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteProposal = async (proposal: VendorProposal) => {
    const confirmed = window.confirm("Delete this proposal? This action cannot be undone.");
    if (!confirmed) return;

    setDeletingProposalId(proposal.id);
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "proposals";
    try {
      if (proposal.id.includes("/")) {
        const { error } = await supabase.storage.from(bucket).remove([proposal.id]);
        if (error) {
          console.error("Failed to remove proposal file from storage:", error);
        }
      } else if (proposal.proposal_file_name) {
        const guessedPath = `${user.id}/${proposal.proposal_file_name}`;
        const { error } = await supabase.storage.from(bucket).remove([guessedPath]);
        if (error) {
          console.debug("Storage delete fallback failed:", error);
        }
      }

      if (!proposal.id.includes("/")) {
        const { error: deleteError } = await supabase.from("proposals").delete().eq("id", proposal.id);
        if (deleteError) {
          console.error("Failed to delete proposal record:", deleteError);
        }
      } else if (proposal.proposal_file) {
        const { error: deleteError } = await supabase
          .from("proposals")
          .delete()
          .eq("proposal_file", proposal.proposal_file);
        if (deleteError) {
          console.debug("Failed to delete proposal metadata by file URL:", deleteError);
        }
      }

      setProposals((current) => current.filter((item) => item.id !== proposal.id));
    } finally {
      setDeletingProposalId(null);
    }
  };

  if (loading || (!user && loadingProposals)) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-12">
        <div className="rounded-3xl border border-[#D4D1C8] bg-white px-8 py-10 shadow-lg shadow-black/5 text-center text-sm text-[#555555]">
          Loading your account...
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--background)] py-10 px-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row">
        <section className="w-full rounded-3xl border border-[#D4D1C8] bg-white p-8 shadow-lg shadow-black/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">Account</p>
              <h1 className="mt-3 text-3xl font-semibold text-[#111111]">{profile?.company_name || user.email || "Vendor account"}</h1>
              <p className="mt-2 max-w-xl text-sm text-[#555555]">Manage your profile and review all generated vendor proposals created with your account.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {profileSaveMessage && (
                <span className="rounded-full bg-[#E5F4EA] px-3 py-2 text-sm font-semibold text-[#166534]">{profileSaveMessage}</span>
              )}
              {isEditingProfile ? (
                <>
                  <button
                    type="button"
                    onClick={saveProfileChanges}
                    disabled={savingProfile}
                    className="rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-[#EFECE3] transition hover:bg-[var(--primary-hover)] disabled:opacity-60"
                  >
                    {savingProfile ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    disabled={savingProfile}
                    className="rounded-2xl border border-[#D4D1C8] bg-[#F7F5F1] px-4 py-3 text-sm font-semibold text-[#333333] transition hover:bg-[#E5E2D8] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(true)}
                    className="rounded-2xl bg-[#F7F5F1] px-4 py-3 text-sm font-semibold text-[#333333] transition hover:bg-[#E5E2D8]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="rounded-2xl border border-[#D4D1C8] bg-[#F7F5F1] px-4 py-3 text-sm font-semibold text-[#333333] transition hover:bg-[#E5E2D8]"
                  >
                    Sign out
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-[#FBFBFB] p-5 shadow-sm shadow-black/5">
              <p className="text-xs uppercase tracking-[0.35em] text-[#777777]">Email</p>
              <p className="mt-2 text-sm text-[#222222]">{user.email || "Not available"}</p>
            </div>
            <div className="rounded-3xl bg-[#FBFBFB] p-5 shadow-sm shadow-black/5">
              <p className="text-xs uppercase tracking-[0.35em] text-[#777777]">Vendor name</p>
              {isEditingProfile ? (
                <input
                  type="text"
                  value={profileForm.company_name}
                  onChange={(event) => handleProfileFieldChange("company_name", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(59,130,246,0.12)]"
                />
              ) : (
                <p className="mt-2 text-sm text-[#222222]">{profile?.company_name || "Not set"}</p>
              )}
            </div>
            <div className="rounded-3xl bg-[#FBFBFB] p-5 shadow-sm shadow-black/5">
              <p className="text-xs uppercase tracking-[0.35em] text-[#777777]">Industry</p>
              {isEditingProfile ? (
                <input
                  type="text"
                  value={profileForm.industry}
                  onChange={(event) => handleProfileFieldChange("industry", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(59,130,246,0.12)]"
                />
              ) : (
                <p className="mt-2 text-sm text-[#222222]">{profile?.industry || "Not available"}</p>
              )}
            </div>
            <div className="rounded-3xl bg-[#FBFBFB] p-5 shadow-sm shadow-black/5">
              <p className="text-xs uppercase tracking-[0.35em] text-[#777777]">Location</p>
              {isEditingProfile ? (
                <input
                  type="text"
                  value={profileForm.location}
                  onChange={(event) => handleProfileFieldChange("location", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#D4D1C8] bg-white px-3 py-2 text-sm text-[#111111] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[rgba(59,130,246,0.12)]"
                />
              ) : (
                <p className="mt-2 text-sm text-[#222222]">{profile?.location || "Not available"}</p>
              )}
            </div>
          </div>
        </section>

        <section className="w-full rounded-3xl border border-[#D4D1C8] bg-white p-8 shadow-lg shadow-black/5">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">Vendor proposals</p>
              <h2 className="mt-3 text-2xl font-semibold text-[#111111]">Generated proposals</h2>
            </div>
            <span className="rounded-full bg-[#E5E2D8] px-3 py-2 text-sm font-semibold text-[#1F2D3D]">
              {loadingProposals ? "Loading…" : `${proposals.length} proposal${proposals.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {loadingProposals ? (
            <div className="rounded-3xl bg-[#FBFBFB] p-8 text-center text-sm text-[#555555]">Loading proposals…</div>
          ) : proposals.length === 0 ? (
            <div className="rounded-3xl bg-[#FBFBFB] p-8 text-center text-sm text-[#555555]">You have not generated any proposals yet. Build one from the proposal builder to see it here.</div>
          ) : (
            <div className="space-y-4">
              {proposals.map((proposal) => (
                <article key={proposal.id} className="rounded-3xl border border-[#E5E2D8] bg-[#FBFBFB] p-5 shadow-sm shadow-black/5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm uppercase tracking-[0.35em] text-[#666666]">{proposal.proposal_type === "generated" ? "Generated proposal" : "Proposal"}</p>
                      <h3 className="mt-2 truncate text-lg font-semibold text-[#111111]">{proposal.proposal_file_name || proposal.title || "Untitled proposal"}</h3>
                      <p className="mt-2 text-xs text-[#777777]">Created {new Date(proposal.created_at).toLocaleDateString()}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {proposal.proposal_file && (
                        <a
                          href={proposal.proposal_file}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-[#EFECE3] px-4 py-2 text-sm font-semibold transition"
                        >
                          View PDF
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDeleteProposal(proposal)}
                        disabled={deletingProposalId === proposal.id}
                        className="inline-flex items-center justify-center gap-2 rounded-full border border-[#D4D1C8] bg-white hover:bg-[#F5F3EE] text-[#333333] px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingProposalId === proposal.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
