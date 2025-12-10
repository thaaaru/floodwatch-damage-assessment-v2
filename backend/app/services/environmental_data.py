# SPDX-License-Identifier: Apache-2.0

"""
Environmental Data Service
Fetches deforestation and population density data from World Bank API
to correlate with flood patterns.
"""
import httpx
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class EnvironmentalDataService:
    """Fetches environmental indicators from World Bank API"""

    WORLD_BANK_API = "https://api.worldbank.org/v2"
    CACHE_DURATION_HOURS = 24 * 7  # Cache for 1 week (data doesn't change often)

    # World Bank indicators
    INDICATORS = {
        "forest_area_pct": "AG.LND.FRST.ZS",      # Forest area (% of land area)
        "population_density": "EN.POP.DNST",       # Population density (people per sq. km)
        "population_total": "SP.POP.TOTL",         # Total population
        "urban_population_pct": "SP.URB.TOTL.IN.ZS",  # Urban population (% of total)
        "agricultural_land_pct": "AG.LND.AGRI.ZS",  # Agricultural land (% of land area)
    }

    def __init__(self):
        self._cache: dict = {}
        self._cache_time: Optional[datetime] = None

    async def fetch_indicator(
        self,
        indicator_code: str,
        country_code: str = "LKA",
        start_year: int = 1990,
        end_year: int = None  # Will default to current year
    ) -> list[dict]:
        """Fetch a specific indicator from World Bank API"""
        try:
            # Default to current year
            if end_year is None:
                end_year = datetime.now().year

            url = f"{self.WORLD_BANK_API}/country/{country_code}/indicator/{indicator_code}"
            params = {
                "format": "json",
                "date": f"{start_year}:{end_year}",
                "per_page": 100
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()

            if len(data) < 2 or not data[1]:
                return []

            # Extract year and value pairs
            results = []
            for item in data[1]:
                if item.get("value") is not None:
                    results.append({
                        "year": int(item["date"]),
                        "value": float(item["value"])
                    })

            # Sort by year ascending
            results.sort(key=lambda x: x["year"])
            return results

        except Exception as e:
            logger.error(f"Failed to fetch indicator {indicator_code}: {e}")
            return []

    async def get_environmental_trends(self, start_year: int = 1994, end_year: int = 2024) -> dict:
        """
        Get all environmental trends for Sri Lanka.
        Returns forest cover, population density, and other indicators.
        """
        cache_key = f"env_trends_{start_year}_{end_year}"

        # Check cache
        if cache_key in self._cache:
            cached = self._cache[cache_key]
            cache_age = (datetime.utcnow() - cached["cached_at"]).total_seconds() / 3600
            if cache_age < self.CACHE_DURATION_HOURS:
                logger.info(f"Returning cached environmental data ({cache_age:.1f}h old)")
                return cached["data"]

        logger.info(f"Fetching environmental data for {start_year}-{end_year}")

        # Fetch all indicators
        forest_data = await self.fetch_indicator(
            self.INDICATORS["forest_area_pct"], "LKA", start_year, end_year
        )
        population_density = await self.fetch_indicator(
            self.INDICATORS["population_density"], "LKA", start_year, end_year
        )
        population_total = await self.fetch_indicator(
            self.INDICATORS["population_total"], "LKA", start_year, end_year
        )
        urban_pct = await self.fetch_indicator(
            self.INDICATORS["urban_population_pct"], "LKA", start_year, end_year
        )
        agricultural_land = await self.fetch_indicator(
            self.INDICATORS["agricultural_land_pct"], "LKA", start_year, end_year
        )

        # Calculate changes and trends
        result = {
            "country": "Sri Lanka",
            "country_code": "LKA",
            "period": f"{start_year}-{end_year}",
            "forest_cover": {
                "data": forest_data,
                "unit": "% of land area",
                "analysis": self._analyze_trend(forest_data, "Forest Cover")
            },
            "population_density": {
                "data": population_density,
                "unit": "people per sq. km",
                "analysis": self._analyze_trend(population_density, "Population Density")
            },
            "population_total": {
                "data": population_total,
                "unit": "people",
                "analysis": self._analyze_trend(population_total, "Total Population")
            },
            "urban_population": {
                "data": urban_pct,
                "unit": "% of total",
                "analysis": self._analyze_trend(urban_pct, "Urban Population")
            },
            "agricultural_land": {
                "data": agricultural_land,
                "unit": "% of land area",
                "analysis": self._analyze_trend(agricultural_land, "Agricultural Land")
            },
            "flood_risk_factors": self._calculate_flood_risk_factors(
                forest_data, population_density, urban_pct
            ),
            "data_source": "World Bank Open Data API",
            "analyzed_at": datetime.utcnow().isoformat()
        }

        # Cache the result
        self._cache[cache_key] = {
            "data": result,
            "cached_at": datetime.utcnow()
        }

        return result

    def _analyze_trend(self, data: list[dict], metric_name: str) -> dict:
        """Analyze the trend in a time series"""
        if not data or len(data) < 2:
            return {"error": "Insufficient data"}

        first_value = data[0]["value"]
        last_value = data[-1]["value"]
        first_year = data[0]["year"]
        last_year = data[-1]["year"]

        absolute_change = last_value - first_value
        percent_change = (absolute_change / first_value) * 100 if first_value != 0 else 0
        years_span = last_year - first_year
        annual_rate = percent_change / years_span if years_span > 0 else 0

        # Determine trend direction
        if percent_change > 5:
            trend = "increasing"
        elif percent_change < -5:
            trend = "decreasing"
        else:
            trend = "stable"

        # Find min, max, average
        values = [d["value"] for d in data]
        min_val = min(values)
        max_val = max(values)
        avg_val = sum(values) / len(values)

        min_year = next(d["year"] for d in data if d["value"] == min_val)
        max_year = next(d["year"] for d in data if d["value"] == max_val)

        return {
            "first_year": first_year,
            "last_year": last_year,
            "first_value": round(first_value, 2),
            "last_value": round(last_value, 2),
            "absolute_change": round(absolute_change, 2),
            "percent_change": round(percent_change, 2),
            "annual_rate": round(annual_rate, 3),
            "trend": trend,
            "min_value": round(min_val, 2),
            "max_value": round(max_val, 2),
            "avg_value": round(avg_val, 2),
            "min_year": min_year,
            "max_year": max_year,
        }

    def _calculate_flood_risk_factors(
        self,
        forest_data: list[dict],
        population_density: list[dict],
        urban_pct: list[dict]
    ) -> dict:
        """
        Calculate how environmental changes affect flood risk.
        Deforestation + urbanization + population density = increased flood risk
        """
        factors = []
        risk_score = 0

        # Forest loss increases runoff and flood risk
        if forest_data and len(forest_data) >= 2:
            first_forest = forest_data[0]["value"]
            last_forest = forest_data[-1]["value"]
            forest_loss = first_forest - last_forest
            forest_loss_pct = (forest_loss / first_forest) * 100 if first_forest > 0 else 0

            if forest_loss_pct > 5:
                risk_contribution = min(forest_loss_pct * 2, 30)  # Max 30 points
                risk_score += risk_contribution
                factors.append({
                    "factor": "Deforestation",
                    "description": f"Forest cover reduced from {first_forest:.1f}% to {last_forest:.1f}% ({forest_loss_pct:.1f}% loss)",
                    "impact": "High" if forest_loss_pct > 10 else "Medium",
                    "explanation": "Less forest = reduced water absorption = more surface runoff during heavy rain",
                    "risk_contribution": round(risk_contribution, 1)
                })

        # Population density increases impervious surfaces and exposure
        if population_density and len(population_density) >= 2:
            first_density = population_density[0]["value"]
            last_density = population_density[-1]["value"]
            density_increase = last_density - first_density
            density_increase_pct = (density_increase / first_density) * 100 if first_density > 0 else 0

            if density_increase_pct > 5:
                risk_contribution = min(density_increase_pct, 25)  # Max 25 points
                risk_score += risk_contribution
                factors.append({
                    "factor": "Population Growth",
                    "description": f"Population density increased from {first_density:.0f} to {last_density:.0f} people/sq.km ({density_increase_pct:.1f}% increase)",
                    "impact": "High" if density_increase_pct > 15 else "Medium",
                    "explanation": "More people = more infrastructure = more impervious surfaces = more flood exposure",
                    "risk_contribution": round(risk_contribution, 1)
                })

        # Urbanization increases impervious surfaces
        if urban_pct and len(urban_pct) >= 2:
            first_urban = urban_pct[0]["value"]
            last_urban = urban_pct[-1]["value"]
            urban_increase = last_urban - first_urban

            if urban_increase > 2:
                risk_contribution = min(urban_increase * 2, 25)  # Max 25 points
                risk_score += risk_contribution
                factors.append({
                    "factor": "Urbanization",
                    "description": f"Urban population increased from {first_urban:.1f}% to {last_urban:.1f}% of total",
                    "impact": "High" if urban_increase > 5 else "Medium",
                    "explanation": "Urban areas have concrete/asphalt surfaces that prevent water absorption",
                    "risk_contribution": round(risk_contribution, 1)
                })

        # Determine overall risk level
        if risk_score >= 50:
            overall_risk = "HIGH"
            summary = "Environmental changes have significantly increased flood vulnerability"
        elif risk_score >= 25:
            overall_risk = "MEDIUM"
            summary = "Environmental changes have moderately increased flood vulnerability"
        else:
            overall_risk = "LOW"
            summary = "Environmental changes have had limited impact on flood vulnerability"

        return {
            "overall_risk_level": overall_risk,
            "risk_score": round(risk_score, 1),
            "max_score": 80,
            "summary": summary,
            "factors": factors,
            "recommendation": self._get_recommendation(factors)
        }

    def _get_recommendation(self, factors: list) -> str:
        """Generate recommendations based on risk factors"""
        if not factors:
            return "Continue monitoring environmental indicators"

        recommendations = []
        for factor in factors:
            if factor["factor"] == "Deforestation":
                recommendations.append("Reforestation in catchment areas can reduce flood peaks by 20-30%")
            elif factor["factor"] == "Population Growth":
                recommendations.append("Improved drainage infrastructure needed in high-density areas")
            elif factor["factor"] == "Urbanization":
                recommendations.append("Permeable surfaces and urban green spaces can mitigate urban flooding")

        return "; ".join(recommendations) if recommendations else "Continue monitoring"


# Singleton instance
environmental_service = EnvironmentalDataService()
