"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiUrl } from "@/lib/api";

interface Company {
  id: string;
  email?: string;
  company_name: string;
  industry?: string;
  location?: string;
  website?: string;
  description?: string;
  rating?: number;
  profile_image?: string;
  verified?: boolean;
  founded_year?: string;
  company_size?: string;
  specialties?: string[];
}

export default function CompanyDetailPage() {
  const params = useParams();
  const companyId = params?.id as string | undefined;
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setError("Invalid company ID.");
      setLoading(false);
      return;
    }

    const fetchCompany = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(apiUrl(`/api/companies/${companyId}`));
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail || "Company not found");
        }
        const data = await response.json();
        setCompany(data.company || null);
      } catch (err) {
        console.error("Error fetching company details:", err);
        setError(err instanceof Error ? err.message : "Unable to load company details.");
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [companyId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 py-12 px-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-slate-500">Company Profile</p>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Company details</h1>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
          >
            Back to Directory
          </Link>
        </div>

        {loading && (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            <p className="text-sm text-slate-600">Loading company details…</p>
          </div>
        )}

        {error && (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-700 shadow-sm">
            <p className="text-lg font-semibold">Unable to load company</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && !company && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-slate-900">Company not found</p>
            <p className="mt-2 text-sm text-slate-600">The requested company profile does not exist.</p>
          </div>
        )}

        {company && (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid gap-6 p-6 lg:grid-cols-[280px_minmax(1fr,auto)] lg:items-start">
              <div className="rounded-3xl bg-gradient-to-br from-blue-500 to-violet-500 p-6 text-white">
                <div className="mb-6 flex h-40 items-center justify-center overflow-hidden rounded-3xl bg-white/10">
                  {company.profile_image ? (
                    <img
                      src={company.profile_image}
                      alt={company.company_name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-6xl font-bold tracking-tight text-white/75">
                      {company.company_name?.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Verified</p>
                    <p className="mt-2 text-2xl font-semibold">{company.verified ? "Yes" : "No"}</p>
                  </div>
                  {company.rating != null && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-200/80">Rating</p>
                      <p className="mt-2 text-2xl font-semibold">{company.rating.toFixed(1)} / 5</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6 p-6">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-3xl font-bold text-slate-900">{company.company_name}</h2>
                    {company.verified && (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Vendor name</p>
                  <p className="mt-1 text-lg text-slate-900">{company.company_name}</p>

                  {company.email && (
                    <>
                      <p className="mt-6 text-sm font-semibold uppercase tracking-[0.35em] text-slate-500">Email</p>
                      <p className="mt-1 text-sm text-slate-900">{company.email}</p>
                    </>
                  )}

                  {company.description && (
                    <p className="mt-6 max-w-2xl text-sm leading-7 text-slate-600">{company.description}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {company.industry && (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Industry</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{company.industry}</p>
                    </div>
                  )}
                  {company.location && (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Location</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{company.location}</p>
                    </div>
                  )}
                  {company.founded_year && (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Founded</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{company.founded_year}</p>
                    </div>
                  )}
                  {company.website && (
                    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Website</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        <a href={company.website} target="_blank" rel="noreferrer" className="hover:text-blue-600">
                          {company.website.replace(/^https?:\/\//, "")}
                        </a>
                      </p>
                    </div>
                  )}
                </div>

                {company.specialties && company.specialties.length > 0 && (
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Specialties</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {company.specialties.map((specialty) => (
                        <span key={specialty} className="inline-flex rounded-full bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                          {specialty}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
