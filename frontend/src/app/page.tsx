'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';

interface Company {
  id: string;
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

export default function Page() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCompanies, setFilteredCompanies] = useState<Company[]>([]);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        setLoading(true);
        const response = await fetch(apiUrl('/api/companies?limit=100'));
        if (!response.ok) {
          throw new Error('Failed to fetch companies');
        }
        const data = await response.json();
        setCompanies(data.companies || []);
        setFilteredCompanies(data.companies || []);
      } catch (err) {
        console.error('Error fetching companies:', err);
        setError(err instanceof Error ? err.message : 'Failed to load companies');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  useEffect(() => {
    // Filter companies based on search query
    if (!searchQuery.trim()) {
      setFilteredCompanies(companies);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = companies.filter(
      (company) =>
        company.company_name.toLowerCase().includes(query) ||
        company.industry?.toLowerCase().includes(query) ||
        company.location?.toLowerCase().includes(query) ||
        company.description?.toLowerCase().includes(query)
    );
    setFilteredCompanies(filtered);
  }, [searchQuery, companies]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Company Directory</h1>
          <p className="text-xl text-gray-600 mb-8">
            Discover and connect with verified companies on ProcureNet
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="relative">
              <input
                type="text"
                placeholder="Search companies by name, industry, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-6 py-3 rounded-lg border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg
                className="absolute right-3 top-3.5 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            <p className="font-semibold">Error loading companies</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredCompanies.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">
              {searchQuery ? 'No companies found matching your search.' : 'No companies available yet.'}
            </p>
          </div>
        )}

        {/* Companies Grid */}
        {!loading && filteredCompanies.length > 0 && (
          <>
            <p className="text-gray-600 mb-6">
              Found <span className="font-semibold">{filteredCompanies.length}</span> companies
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCompanies.map((company) => (
                <Link key={company.id} href={`/profile/${company.id}`}>
                  <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow cursor-pointer h-full">
                    {/* Profile Image */}
                    {company.profile_image && (
                      <div className="h-32 bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center overflow-hidden">
                        <img
                          src={company.profile_image}
                          alt={company.company_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    {!company.profile_image && (
                      <div className="h-32 bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center">
                        <svg
                          className="w-16 h-16 text-white opacity-30"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                        </svg>
                      </div>
                    )}

                    <div className="p-5">
                      {/* Company Name and Verified Badge */}
                      <div className="flex items-start justify-between mb-2">
                        <h2 className="text-lg font-bold text-gray-900 truncate">{company.company_name}</h2>
                        {company.verified && (
                          <svg
                            className="w-5 h-5 text-blue-600 flex-shrink-0 ml-2"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Rating */}
                      {company.rating && company.rating > 0 && (
                        <div className="flex items-center mb-3">
                          <div className="flex text-yellow-400">
                            {[...Array(5)].map((_, i) => (
                              <svg
                                key={i}
                                className={`w-4 h-4 ${i < Math.floor(company.rating!) ? 'fill-current' : 'text-gray-300'}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                            ))}
                          </div>
                          <span className="ml-2 text-sm text-gray-600">{company.rating.toFixed(1)}</span>
                        </div>
                      )}

                      {/* Industry */}
                      {company.industry && (
                        <p className="text-sm text-blue-600 font-semibold mb-2">{company.industry}</p>
                      )}

                      {/* Location */}
                      {company.location && (
                        <div className="flex items-center text-gray-600 text-sm mb-2">
                          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {company.location}
                        </div>
                      )}

                      {/* Company Size */}
                      {company.company_size && (
                        <div className="text-xs text-gray-500 mb-3">{company.company_size} employees</div>
                      )}

                      {/* Description */}
                      {company.description && (
                        <p className="text-gray-600 text-sm line-clamp-3 mb-4">{company.description}</p>
                      )}

                      {/* Specialties */}
                      {company.specialties && company.specialties.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {company.specialties.slice(0, 2).map((specialty, idx) => (
                            <span
                              key={idx}
                              className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                            >
                              {specialty}
                            </span>
                          ))}
                          {company.specialties.length > 2 && (
                            <span className="inline-block text-xs text-gray-500">
                              +{company.specialties.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

