"""Companies service - fetch and manage company profiles"""


def _get_supabase_client():
    import os
    from supabase import create_client

    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_KEY")
        or os.getenv("SUPABASE_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or ""
    )

    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "Supabase credentials are not configured. "
            "Set SUPABASE_URL and SUPABASE_SERVICE_KEY, or NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
        )

    return create_client(supabase_url, supabase_key)


async def get_all_companies(limit: int = 50, offset: int = 0):
    """
    Fetch all companies from the database.
    
    Args:
        limit: Maximum number of companies to return (max 100)
        offset: Number of companies to skip for pagination
    
    Returns:
        List of company profiles
    """
    try:
        supabase = _get_supabase_client()

        # Fetch companies with limit and offset
        limit = min(limit, 100)  # Cap at 100
        response = supabase.table("users").select(
            "id, company_name, industry, location, website, description, rating, "
            "profile_image, verified, founded_year, company_size, specialties, created_at"
        ).order("rating", desc=True).limit(limit).offset(offset).execute()

        if getattr(response, "error", None):
            raise RuntimeError(f"Supabase error fetching companies: {response.error}")

        return response.data or []
    except Exception as e:
        print(f"[Companies] Error fetching companies: {e}")
        raise


async def search_companies(query: str, limit: int = 50):
    """
    Search companies by name or industry.
    
    Args:
        query: Search query (company name or industry)
        limit: Maximum number of results
    
    Returns:
        List of matching company profiles
    """
    try:
        supabase = _get_supabase_client()

        # Search companies
        response = supabase.table("users").select(
            "id, company_name, industry, location, website, description, rating, "
            "profile_image, verified, founded_year, company_size, specialties, created_at"
        ).or_(
            f"company_name.ilike.%{query}%,industry.ilike.%{query}%"
        ).order("rating", desc=True).limit(limit).execute()

        if getattr(response, "error", None):
            raise RuntimeError(f"Supabase error searching companies: {response.error}")

        return response.data or []
    except Exception as e:
        print(f"[Companies] Error searching companies: {e}")
        raise


async def get_company(company_id: str):
    """
    Fetch a single company by ID.
    
    Args:
        company_id: UUID of the company
    
    Returns:
        Company profile or None
    """
    try:
        supabase = _get_supabase_client()

        response = supabase.table("users").select("*").eq("id", company_id).single().execute()

        if getattr(response, "error", None):
            raise RuntimeError(f"Supabase error fetching company {company_id}: {response.error}")

        return response.data or None
    except Exception as e:
        print(f"[Companies] Error fetching company {company_id}: {e}")
        raise
